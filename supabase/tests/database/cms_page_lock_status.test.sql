-- Lock status for the Edit Mode UI (008): `npm run test:db`.
-- Self-contained: own users and page, one transaction, rolled back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-0000000008e1', 'editor-008@example.test'),
  ('00000000-0000-4000-8000-0000000008e2', 'editor2-008@example.test');

insert into public.cms_users (user_id, role, status)
values
  ('00000000-0000-4000-8000-0000000008e1', 'editor', 'active'),
  ('00000000-0000-4000-8000-0000000008e2', 'editor', 'active');

select ok(
  not has_function_privilege('anon', 'public.cms_page_lock_status(text)', 'execute'),
  'anon cannot call cms_page_lock_status'
);

select is(
  (select count(*) from information_schema.routines r
    join information_schema.parameters p
      on p.specific_name = r.specific_name
   where r.routine_name = 'cms_page_lock_status'
     and p.parameter_mode = 'OUT'
     and p.parameter_name ilike '%token%'),
  0::bigint,
  'the status never returns the lock token'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000008e1", "role": "authenticated"}', true);

select is_empty(
  $$ select * from public.cms_page_lock_status('lock-status-fixture') $$,
  'no row while nobody holds the lock'
);

select set_config('cms_test.token', public.cms_page_lock_acquire('lock-status-fixture')::text, true);

select results_eq(
  $$ select holder_email, is_mine, is_stale from public.cms_page_lock_status('lock-status-fixture') $$,
  $$ values ('editor-008@example.test'::text, true, false) $$,
  'the holder sees their own fresh lock'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000008e2", "role": "authenticated"}', true);

select results_eq(
  $$ select holder_email, is_mine from public.cms_page_lock_status('lock-status-fixture') $$,
  $$ values ('editor-008@example.test'::text, false) $$,
  'another editor sees who holds the lock'
);

-- A lock without a heartbeat for longer than the TTL is reported as stale.
reset role;
update public.cms_page_locks
   set heartbeat_at = now() - interval '3 minutes'
 where page_id = (select id from public.cms_pages where key = 'lock-status-fixture');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000008e2", "role": "authenticated"}', true);

select results_eq(
  $$ select is_stale from public.cms_page_lock_status('lock-status-fixture') $$,
  $$ values (true) $$,
  'a lock past its TTL is stale'
);

-- A signed-in user without CMS access gets permission_denied.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000008ff", "role": "authenticated"}', true);

select throws_ok(
  $$ select * from public.cms_page_lock_status('lock-status-fixture') $$,
  '42501', null, 'a user without CMS access cannot read the lock status'
);

reset role;

select ok(
  exists (select 1 from public.cms_page_locks l
            join public.cms_pages p on p.id = l.page_id
           where p.key = 'lock-status-fixture'),
  'reading the status does not change the lock'
);

select * from finish();

rollback;
