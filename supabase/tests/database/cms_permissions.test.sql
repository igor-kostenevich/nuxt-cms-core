-- cms_can() and cms_users as PostgreSQL enforces them (003, 004b): `npm run test:db`.
-- The full role × permission matrix is compared with roleCan() by
-- tests/permissions-sync.test.ts; here only the behaviour that file cannot see:
-- who may call cms_can(), what membership status and a missing row do, and
-- that nobody can change their own role. Self-contained: own users, one
-- transaction, rolled back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- Fixture, written as the migration owner -------------------------------------

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-00000000c0a1', 'owner-perm@example.test'),
  ('00000000-0000-4000-8000-00000000c0e1', 'editor-perm@example.test'),
  ('00000000-0000-4000-8000-00000000c0d1', 'disabled-perm@example.test'),
  ('00000000-0000-4000-8000-00000000c0c1', 'customer-perm@example.test');

-- The customer has an auth identity and no cms_users row.
insert into public.cms_users (user_id, role, status)
values
  ('00000000-0000-4000-8000-00000000c0a1', 'owner', 'active'),
  ('00000000-0000-4000-8000-00000000c0e1', 'editor', 'active'),
  ('00000000-0000-4000-8000-00000000c0d1', 'owner', 'disabled');

create function pg_temp.sign_in(user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
end;
$$;

-- Runs as the caller (security invoker), so RLS of the current role applies.
create function pg_temp.rename_site(name text)
returns bigint
language plpgsql
as $$
declare
  changed bigint;
begin
  update public.cms_site_settings set site_name = name where id = 1;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

-- anon ------------------------------------------------------------------------

set local role anon;

select throws_ok(
  $$ select public.cms_can('pages.edit') $$,
  '42501',
  null,
  'anon cannot call cms_can()'
);

reset role;

-- Membership decides, not the identity ----------------------------------------

set local role authenticated;

select pg_temp.sign_in('00000000-0000-4000-8000-00000000c0a1');
select ok(public.cms_can('settings.update'), 'an active owner gets settings.update');

select pg_temp.sign_in('00000000-0000-4000-8000-00000000c0e1');
select ok(
  public.cms_can('pages.edit') and not public.cms_can('settings.update'),
  'an active editor gets pages.edit and not settings.update'
);
select ok(not public.cms_can('no.such.permission'), 'an unknown permission is denied');

select pg_temp.sign_in('00000000-0000-4000-8000-00000000c0d1');
select ok(
  not public.cms_can('settings.update') and not public.cms_can('pages.edit'),
  'a disabled owner gets nothing'
);

select pg_temp.sign_in('00000000-0000-4000-8000-00000000c0c1');
select ok(not public.cms_can('pages.edit'), 'an auth user without a cms_users row gets nothing');

-- cms_users: read own row only, write nothing ---------------------------------

select pg_temp.sign_in('00000000-0000-4000-8000-00000000c0e1');

select results_eq(
  $$ select user_id::text from public.cms_users $$,
  $$ values ('00000000-0000-4000-8000-00000000c0e1') $$,
  'a CMS user sees only their own membership'
);

select throws_ok(
  $$ update public.cms_users set role = 'owner' where user_id = '00000000-0000-4000-8000-00000000c0e1' $$,
  '42501',
  null,
  'an editor cannot raise their own role'
);

select throws_ok(
  $$ delete from public.cms_users where user_id = '00000000-0000-4000-8000-00000000c0e1' $$,
  '42501',
  null,
  'a CMS user cannot delete a membership'
);

select pg_temp.sign_in('00000000-0000-4000-8000-00000000c0d1');
select throws_ok(
  $$ update public.cms_users set status = 'active' where user_id = '00000000-0000-4000-8000-00000000c0d1' $$,
  '42501',
  null,
  'a disabled user cannot reactivate themselves'
);

select pg_temp.sign_in('00000000-0000-4000-8000-00000000c0c1');
select throws_ok(
  $$ insert into public.cms_users (user_id, role, status) values ('00000000-0000-4000-8000-00000000c0c1', 'owner', 'active') $$,
  '42501',
  null,
  'an auth user cannot grant themselves CMS access'
);

-- cms_can() behind RLS: site settings (004b) ----------------------------------

select pg_temp.sign_in('00000000-0000-4000-8000-00000000c0e1');
select is(pg_temp.rename_site('by editor'), 0::bigint, 'an editor update of site settings changes no row');

select pg_temp.sign_in('00000000-0000-4000-8000-00000000c0a1');
select is(pg_temp.rename_site('by owner'), 1::bigint, 'an owner update of site settings changes the row');

reset role;

select is(
  (select role || '/' || status from public.cms_users where user_id = '00000000-0000-4000-8000-00000000c0e1'),
  'editor/active',
  'the editor membership is unchanged'
);

select * from finish();

rollback;
