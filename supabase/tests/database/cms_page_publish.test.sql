-- Draft / Publish / Restore and Content Lock (007): `npm run test:db`.
-- Self-contained like cms_core.test.sql: own users and page, one transaction,
-- rolled back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select plan(52);

-- Fixture, written as the migration owner -------------------------------------

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-0000000007a1', 'admin-007@example.test'),
  ('00000000-0000-4000-8000-0000000007e1', 'editor-007@example.test'),
  ('00000000-0000-4000-8000-0000000007e2', 'editor2-007@example.test');

insert into public.cms_users (user_id, role, status)
values
  ('00000000-0000-4000-8000-0000000007a1', 'admin', 'active'),
  ('00000000-0000-4000-8000-0000000007e1', 'editor', 'active'),
  ('00000000-0000-4000-8000-0000000007e2', 'editor', 'active');

-- Fails the last step of Publish on demand, to prove the earlier steps roll back.
create function public.cms_test_fail_publish()
returns trigger
language plpgsql
as $$
begin
  raise exception 'publish interrupted by test';
end;
$$;

grant execute on function public.cms_test_fail_publish() to authenticated;

-- Internal helpers write without checking permission or lock: no client may call them.
select ok(
  not has_function_privilege('anon', 'public.cms_page_write_draft(uuid, text, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.cms_page_write_draft(uuid, text, jsonb)', 'execute'),
  'clients cannot call cms_page_write_draft'
);
select ok(
  not has_function_privilege('anon', 'public.cms_page_held_lock(text, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.cms_page_held_lock(text, uuid)', 'execute'),
  'clients cannot call cms_page_held_lock'
);
select ok(
  not has_function_privilege('anon', 'public.cms_require_permission(text)', 'execute')
    and not has_function_privilege('authenticated', 'public.cms_require_permission(text)', 'execute'),
  'clients cannot call cms_require_permission'
);
select ok(
  not has_function_privilege('anon', 'public.cms_page_lock_ttl()', 'execute')
    and not has_function_privilege('authenticated', 'public.cms_page_lock_ttl()', 'execute'),
  'clients cannot call cms_page_lock_ttl'
);

-- anon: no draft, revisions, locks or editing functions -------------------------

set local role anon;

select throws_ok($$ select * from public.cms_page_draft $$, '42501', null, 'anon cannot read drafts');
select throws_ok($$ select * from public.cms_page_revisions $$, '42501', null, 'anon cannot read revisions');
select throws_ok($$ select * from public.cms_page_locks $$, '42501', null, 'anon cannot read locks');
select throws_ok(
  $$ select public.cms_page_lock_acquire('publish-fixture') $$,
  '42501', null, 'anon cannot acquire a lock'
);
select throws_ok(
  $$ select public.cms_page_save_draft('publish-fixture', 'en', '{}', gen_random_uuid()) $$,
  '42501', null, 'anon cannot save a draft'
);

reset role;

-- Editor E1 takes the lock and saves a draft -------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000007e1", "role": "authenticated"}', true);

select ok(
  set_config('cms_test.token_e1', public.cms_page_lock_acquire('publish-fixture')::text, true) is not null,
  'editor acquires the lock of a page that has no row yet'
);

select results_eq(
  $$ select count(*)::int from public.cms_pages where key = 'publish-fixture' $$,
  $$ values (1) $$,
  'acquiring the lock creates the page row (C-42)'
);

select throws_ok($$ select * from public.cms_page_locks $$, '42501', null, 'editors cannot read lock tokens');

select isnt(
  public.cms_page_save_draft('publish-fixture', 'en', '{"title": "First"}', current_setting('cms_test.token_e1')::uuid),
  null,
  'editor saves a draft with the held lock'
);

select results_eq(
  $$
    select d.content ->> 'title'
    from public.cms_page_draft d
    join public.cms_pages p on p.id = d.page_id
    where p.key = 'publish-fixture' and d.locale = 'en'
  $$,
  $$ values ('First') $$,
  'editor reads the saved draft'
);

select throws_ok(
  $$ select public.cms_page_save_draft('publish-fixture', 'en', '[]', current_setting('cms_test.token_e1')::uuid) $$,
  '23514', null, 'draft content must be an object'
);

select throws_ok(
  $$
    select public.cms_page_save_draft(
      'publish-fixture', 'en',
      jsonb_build_object('title', repeat('a', 600000)),
      current_setting('cms_test.token_e1')::uuid
    )
  $$,
  '23514', null, 'draft content has a hard size limit'
);

select throws_ok(
  $$ select public.cms_page_save_draft('publish-fixture', 'en-gb', '{}', current_setting('cms_test.token_e1')::uuid) $$,
  '23514', null, 'draft locale uses the shared cms_locale domain'
);

select throws_ok(
  $$ select public.cms_page_save_draft('publish-fixture', 'en', '{}', gen_random_uuid()) $$,
  'CMSLL', null, 'saving with a token the session does not hold is refused'
);

select throws_ok(
  $$ select public.cms_page_publish('publish-fixture', 'en', current_setting('cms_test.token_e1')::uuid) $$,
  '42501', null, 'an editor cannot publish'
);

select throws_ok(
  $$ select public.cms_page_lock_force_unlock('publish-fixture') $$,
  '42501', null, 'an editor cannot force unlock'
);

select throws_ok(
  $$ update public.cms_page_draft set content = '{}' $$,
  '42501', null, 'editors write drafts only through functions'
);

-- Editor E2 is read-only while E1 holds the lock.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000007e2", "role": "authenticated"}', true);

select throws_ok(
  $$ select public.cms_page_lock_acquire('publish-fixture') $$,
  'CMSLK', null, 'a fresh lock of another user is refused'
);

select throws_ok(
  $$ select public.cms_page_save_draft('publish-fixture', 'en', '{}', current_setting('cms_test.token_e1')::uuid) $$,
  'CMSLL', null, 'another user cannot save with a token that is not theirs'
);

-- The draft never reaches the public read.
reset role;
set local role anon;

select is_empty(
  $$
    select 1
    from public.cms_page_published pp
    join public.cms_pages p on p.id = pp.page_id
    where p.key = 'publish-fixture'
  $$,
  'an unpublished draft is not visible to the public read'
);

reset role;

-- Admin publishes ------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000007e1", "role": "authenticated"}', true);
select public.cms_page_lock_release('publish-fixture', current_setting('cms_test.token_e1')::uuid);

select lives_ok(
  $$ select public.cms_page_lock_release('publish-fixture', current_setting('cms_test.token_e1')::uuid) $$,
  'releasing a lock twice is not an error'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000007a1", "role": "authenticated"}', true);
select set_config('cms_test.token_a', public.cms_page_lock_acquire('publish-fixture')::text, true);

select isnt(
  public.cms_page_publish('publish-fixture', 'en', current_setting('cms_test.token_a')::uuid),
  null,
  'admin publishes the saved draft'
);

reset role;
set local role anon;

select results_eq(
  $$
    select pp.content ->> 'title'
    from public.cms_page_published pp
    join public.cms_pages p on p.id = pp.page_id
    where p.key = 'publish-fixture' and pp.locale = 'en'
  $$,
  $$ values ('First') $$,
  'the public read sees the published draft'
);

reset role;

select is_empty(
  $$
    select 1 from public.cms_page_draft d
    join public.cms_pages p on p.id = d.page_id
    where p.key = 'publish-fixture'
  $$,
  'publish removes the draft: no unpublished changes are left'
);

select results_eq(
  $$
    select r.content ->> 'title', r.created_by
    from public.cms_page_revisions r
    join public.cms_pages p on p.id = r.page_id
    where p.key = 'publish-fixture'
  $$,
  $$ values ('First', '00000000-0000-4000-8000-0000000007a1'::uuid) $$,
  'the first publication creates a revision of the new version'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000007a1", "role": "authenticated"}', true);

select throws_ok(
  $$ select public.cms_page_publish('publish-fixture', 'en', current_setting('cms_test.token_a')::uuid) $$,
  'P0002', null, 'publishing without a draft is refused'
);

select throws_ok(
  $$ update public.cms_page_revisions set content = '{}' $$,
  '42501', null, 'revisions are immutable for clients'
);

-- Publish is atomic ------------------------------------------------------------------

select public.cms_page_save_draft('publish-fixture', 'en', '{"title": "Second"}', current_setting('cms_test.token_a')::uuid);

reset role;
create trigger cms_test_fail_publish
  before insert or update on public.cms_page_published
  for each row execute function public.cms_test_fail_publish();
set local role authenticated;

select throws_ok(
  $$ select public.cms_page_publish('publish-fixture', 'en', current_setting('cms_test.token_a')::uuid) $$,
  'P0001', 'publish interrupted by test', 'a failure in the last step fails the whole publish'
);

reset role;
drop trigger cms_test_fail_publish on public.cms_page_published;

select results_eq(
  $$
    select
      (select d.content ->> 'title' from public.cms_page_draft d where d.page_id = p.id),
      (select pp.content ->> 'title' from public.cms_page_published pp where pp.page_id = p.id),
      (select count(*)::int from public.cms_page_revisions r where r.page_id = p.id)
    from public.cms_pages p
    where p.key = 'publish-fixture'
  $$,
  $$ values ('Second', 'First', 1) $$,
  'after a failed publish the draft, published content and revisions are unchanged'
);

set local role authenticated;

select isnt(
  public.cms_page_publish('publish-fixture', 'en', current_setting('cms_test.token_a')::uuid),
  null,
  'publish succeeds once the failure is gone'
);

reset role;

select results_eq(
  $$
    select
      (select pp.content ->> 'title' from public.cms_page_published pp where pp.page_id = p.id),
      (select count(*)::int from public.cms_page_revisions r where r.page_id = p.id)
    from public.cms_pages p
    where p.key = 'publish-fixture'
  $$,
  $$ values ('Second', 2) $$,
  'every publication adds a revision'
);

select set_config(
  'cms_test.revision_first',
  (
    select r.id::text from public.cms_page_revisions r
    join public.cms_pages p on p.id = r.page_id
    where p.key = 'publish-fixture' and r.content ->> 'title' = 'First'
  ),
  true
);

select set_config(
  'cms_test.revision_second',
  (
    select r.id::text from public.cms_page_revisions r
    join public.cms_pages p on p.id = r.page_id
    where p.key = 'publish-fixture' and r.content ->> 'title' = 'Second'
  ),
  true
);

-- Derived status: a draft equal to the published version is dropped --------------------

set local role authenticated;

select is(
  public.cms_page_save_draft('publish-fixture', 'en', '{"title": "Second"}', current_setting('cms_test.token_a')::uuid),
  null,
  'saving the published content leaves no draft'
);

select is_empty(
  $$ select 1 from public.cms_page_draft d join public.cms_pages p on p.id = d.page_id where p.key = 'publish-fixture' $$,
  'no draft row exists after saving the published content'
);

-- Restore ----------------------------------------------------------------------------

select isnt(
  public.cms_page_restore(
    'publish-fixture', 'en', current_setting('cms_test.revision_first')::uuid,
    current_setting('cms_test.token_a')::uuid
  ),
  null,
  'restore without a draft creates a draft from the revision'
);

select results_eq(
  $$
    select d.content ->> 'title' from public.cms_page_draft d
    join public.cms_pages p on p.id = d.page_id where p.key = 'publish-fixture'
  $$,
  $$ values ('First') $$,
  'the restored draft holds the revision content; published is untouched'
);

select throws_ok(
  $$
    select public.cms_page_restore(
      'publish-fixture', 'en', current_setting('cms_test.revision_second')::uuid,
      current_setting('cms_test.token_a')::uuid
    )
  $$,
  'CMSCF', null, 'restore does not replace an existing draft without confirmation'
);

select is(
  public.cms_page_restore(
    'publish-fixture', 'en', current_setting('cms_test.revision_second')::uuid,
    current_setting('cms_test.token_a')::uuid, true
  ),
  null,
  'confirmed restore of the published version resets the page: no draft is left'
);

select throws_ok(
  $$
    select public.cms_page_restore(
      'publish-fixture', 'en', gen_random_uuid(), current_setting('cms_test.token_a')::uuid
    )
  $$,
  'P0002', null, 'restore refuses a revision that does not exist'
);

-- Revisions of another page and of another locale, written as the owner.
reset role;
insert into public.cms_pages (id, key) values ('00000000-0000-4000-8000-000000000071', 'other-fixture');
insert into public.cms_page_revisions (id, page_id, locale, content)
values
  ('00000000-0000-4000-8000-0000000007f1', '00000000-0000-4000-8000-000000000071', 'en', '{"title": "Other page"}'),
  (
    '00000000-0000-4000-8000-0000000007f2',
    (select id from public.cms_pages where key = 'publish-fixture'),
    'uk',
    '{"title": "Other locale"}'
  );
set local role authenticated;

select throws_ok(
  $$
    select public.cms_page_restore(
      'publish-fixture', 'en', '00000000-0000-4000-8000-0000000007f1', current_setting('cms_test.token_a')::uuid
    )
  $$,
  'P0002', null, 'restore refuses a revision of another page'
);

select throws_ok(
  $$
    select public.cms_page_restore(
      'publish-fixture', 'en', '00000000-0000-4000-8000-0000000007f2', current_setting('cms_test.token_a')::uuid
    )
  $$,
  'P0002', null, 'restore refuses a revision of the same page in another locale'
);

-- Stale locks, takeover and force unlock ---------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000007e2", "role": "authenticated"}', true);

select throws_ok(
  $$ select public.cms_page_lock_acquire('publish-fixture') $$,
  'CMSLK', null, 'the admin''s fresh lock is refused to another editor'
);

reset role;
update public.cms_page_locks
  set heartbeat_at = now() - interval '3 minutes'
  where page_id = (select id from public.cms_pages where key = 'publish-fixture');
set local role authenticated;

select ok(
  set_config('cms_test.token_e2', public.cms_page_lock_acquire('publish-fixture')::text, true) is not null,
  'a stale lock is taken over by another editor'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000007a1", "role": "authenticated"}', true);

select throws_ok(
  $$ select public.cms_page_save_draft('publish-fixture', 'en', '{}', current_setting('cms_test.token_a')::uuid) $$,
  'CMSLL', null, 'the session whose lock was taken over can no longer save'
);

select throws_ok(
  $$ select public.cms_page_lock_heartbeat('publish-fixture', current_setting('cms_test.token_a')::uuid) $$,
  'CMSLL', null, 'the session whose lock was taken over gets lock_lost on heartbeat'
);

select lives_ok(
  $$ select public.cms_page_lock_force_unlock('publish-fixture') $$,
  'an admin force unlocks the page'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000007e2", "role": "authenticated"}', true);

select throws_ok(
  $$ select public.cms_page_lock_heartbeat('publish-fixture', current_setting('cms_test.token_e2')::uuid) $$,
  'CMSLL', null, 'after a force unlock the old session can no longer heartbeat'
);

-- The same user in a second tab takes over their own lock; the first tab loses it.
select set_config('cms_test.token_tab1', public.cms_page_lock_acquire('publish-fixture')::text, true);

select ok(
  set_config('cms_test.token_tab2', public.cms_page_lock_acquire('publish-fixture')::text, true)
    <> current_setting('cms_test.token_tab1'),
  'the same user acquiring again gets a new token'
);

select throws_ok(
  $$ select public.cms_page_save_draft('publish-fixture', 'en', '{}', current_setting('cms_test.token_tab1')::uuid) $$,
  'CMSLL', null, 'the first tab cannot save after the second took the lock'
);

reset role;

select * from finish();

rollback;
