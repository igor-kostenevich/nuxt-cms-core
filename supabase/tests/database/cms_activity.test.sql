-- Activity (012a): `npm run test:db`.
-- One transaction, rolled back at the end. Every action runs as a real CMS
-- user through the same RPC or RLS write the admin uses.

begin;

create extension if not exists pgtap with schema extensions;

select plan(61);

-- Fixture, written as the migration owner -------------------------------------

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000012001', 'owner-012@example.test'),
  ('00000000-0000-4000-8000-000000012002', 'admin-012@example.test'),
  ('00000000-0000-4000-8000-000000012003', 'editor-012@example.test'),
  ('00000000-0000-4000-8000-000000012004', 'leaver-012@example.test');

insert into public.cms_users (user_id, role, status)
values
  ('00000000-0000-4000-8000-000000012001', 'owner', 'active'),
  ('00000000-0000-4000-8000-000000012002', 'admin', 'active'),
  ('00000000-0000-4000-8000-000000012003', 'editor', 'active'),
  ('00000000-0000-4000-8000-000000012004', 'admin', 'active');

delete from public.cms_activity;
delete from public.cms_form_submissions;
delete from public.cms_forms;
delete from public.cms_site_texts;
delete from public.cms_site_settings_translations;
delete from public.cms_page_locks where page_id is not null;
delete from public.cms_languages;
insert into public.cms_languages (code, name, native_name, active, is_default, sort_order)
values ('en', 'English', 'English', true, true, 0), ('de', 'German', 'Deutsch', false, false, 1);
-- The fixture itself wrote nothing to the log.
delete from public.cms_activity;

insert into storage.objects (bucket_id, name, owner_id, metadata)
values
  ('cms-media', 'c0000000-0000-4000-8000-000000000001.jpg', '00000000-0000-4000-8000-000000012001',
    '{"mimetype": "image/jpeg", "size": 2048}'),
  ('cms-media', 'c0000000-0000-4000-8000-000000000002.jpg', '00000000-0000-4000-8000-000000012001',
    '{"mimetype": "image/jpeg", "size": 2048}'),
  ('cms-media', 'c0000000-0000-4000-8000-000000000003.jpg', '00000000-0000-4000-8000-000000012004',
    '{"mimetype": "image/jpeg", "size": 2048}');

create function pg_temp.as_user(user_id text)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

-- Read as the owner of the table, whatever role the test is in.
create function pg_temp.events(event_action text, event_entity_type text)
returns integer
language sql
security definer
as $$
  select count(*)::integer
    from public.cms_activity
    where action = event_action
      and entity_type = event_entity_type;
$$;

create function pg_temp.total()
returns integer
language sql
security definer
as $$
  select count(*)::integer from public.cms_activity;
$$;

create function pg_temp.last_event()
returns public.cms_activity
language sql
security definer
as $$
  select * from public.cms_activity order by created_at desc, id desc limit 1;
$$;

grant execute on function pg_temp.events(text, text) to authenticated;
grant execute on function pg_temp.total() to authenticated;
grant execute on function pg_temp.last_event() to authenticated;

-- Fails the last step of Publish on demand, to prove the event rolls back with it.
create function pg_temp.fail_publish()
returns trigger
language plpgsql
as $$
begin
  raise exception 'publish interrupted by test';
end;
$$;

-- Access ---------------------------------------------------------------------------

select table_privs_are('public', 'cms_activity', 'authenticated', array['SELECT'],
  'authenticated may only select from cms_activity');
select table_privs_are('public', 'cms_activity', 'anon', array[]::text[],
  'anon has no privilege on cms_activity');
select table_privs_are('public', 'cms_activity', 'service_role', array[]::text[],
  'service_role has no privilege on cms_activity');
select policies_are('public', 'cms_activity', array['cms_activity_select'],
  'the only policy on cms_activity is select');
select ok(
  not has_function_privilege('anon', 'public.cms_activity_log(text, text, text, text, text, uuid, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.cms_activity_log(text, text, text, text, text, uuid, jsonb)', 'execute')
    and not has_function_privilege('service_role', 'public.cms_activity_log(text, text, text, text, text, uuid, jsonb)', 'execute'),
  'no client role can call the logger'
);
select ok(
  not has_function_privilege('authenticated', 'public.cms_forms_activity()', 'execute')
    and not has_function_privilege('authenticated', 'public.cms_site_settings_activity()', 'execute')
    and not has_function_privilege('authenticated', 'public.cms_site_settings_translations_activity()', 'execute')
    and not has_function_privilege('authenticated', 'public.cms_form_submissions_moved()', 'execute')
    and not has_function_privilege('authenticated', 'public.cms_form_submissions_deleted()', 'execute'),
  'clients cannot call the trigger functions'
);
select ok(
  (select bool_and(p.prosecdef) from pg_proc p where p.oid in (
    'public.cms_activity_log(text, text, text, text, text, uuid, jsonb)'::regprocedure,
    'public.cms_forms_activity()'::regprocedure,
    'public.cms_site_settings_activity()'::regprocedure,
    'public.cms_site_settings_translations_activity()'::regprocedure,
    'public.cms_form_submissions_moved()'::regprocedure,
    'public.cms_form_submissions_deleted()'::regprocedure
  )),
  'the logger and the trigger functions run as the owner'
);
select hasnt_column('public', 'cms_page_revisions', 'base', 'the legacy revisions.base column is gone');

-- Pages: Publish, Restore, Force unlock --------------------------------------------

select pg_temp.as_user('00000000-0000-4000-8000-000000012001');
select set_config('cms_test.token', public.cms_page_lock_acquire('activity-fixture')::text, true);
select public.cms_page_save_draft('activity-fixture', 'en', '{"title": "First"}', current_setting('cms_test.token')::uuid);

select is(pg_temp.total(), 0, 'acquiring a lock and saving a draft log nothing');

select public.cms_page_publish('activity-fixture', 'en', current_setting('cms_test.token')::uuid);

select is(pg_temp.events('publish', 'page'), 1, 'Publish writes one event');
select results_eq(
  $$ select e.actor_id::text, e.actor_email, e.entity_label, e.locale::text,
            e.revision_id = (select r.id from public.cms_page_revisions r
                               join public.cms_pages p on p.id = r.page_id
                               where p.key = 'activity-fixture'
                               order by r.created_at desc limit 1)
       from pg_temp.last_event() e $$,
  $$ values ('00000000-0000-4000-8000-000000012001', 'owner-012@example.test', 'activity-fixture', 'en', true) $$,
  'the publish event has the actor, the email snapshot, the page, the locale and the new revision'
);

select set_config('cms_test.revision', (pg_temp.last_event()).revision_id::text, true);
select public.cms_page_restore('activity-fixture', 'en', current_setting('cms_test.revision')::uuid, current_setting('cms_test.token')::uuid);

select results_eq(
  $$ select e.action, e.revision_id::text, e.details from pg_temp.last_event() e $$,
  $$ values ('restore', current_setting('cms_test.revision'), '{"replacedDraft": false}'::jsonb) $$,
  'Restore writes an event with the restored revision'
);

-- Restoring what is published leaves no draft (C-53): make one to replace.
select public.cms_page_save_draft('activity-fixture', 'en', '{"title": "Second"}', current_setting('cms_test.token')::uuid);
select public.cms_page_restore('activity-fixture', 'en', current_setting('cms_test.revision')::uuid, current_setting('cms_test.token')::uuid, true);
select is((pg_temp.last_event()).details, '{"replacedDraft": true}'::jsonb, 'Restore over a draft says it replaced the draft');

select public.cms_page_save_draft('activity-fixture', 'en', '{"title": "Third"}', current_setting('cms_test.token')::uuid);
select throws_ok(
  $$ select public.cms_page_restore('activity-fixture', 'en', current_setting('cms_test.revision')::uuid, current_setting('cms_test.token')::uuid) $$,
  'CMSCF', null, 'Restore over a draft without confirmation still fails'
);
select is(pg_temp.events('restore', 'page'), 2, 'a failed Restore writes no event');

-- An interrupted publish rolls back with its event.
reset role;
create trigger cms_test_fail_publish
  before insert or update on public.cms_page_published
  for each row execute function pg_temp.fail_publish();
select pg_temp.as_user('00000000-0000-4000-8000-000000012001');

select throws_ok(
  $$ select public.cms_page_publish('activity-fixture', 'en', current_setting('cms_test.token')::uuid) $$,
  'P0001', 'publish interrupted by test', 'the test trigger interrupts Publish'
);
select is(pg_temp.events('publish', 'page'), 1, 'an interrupted Publish leaves no event');

reset role;
drop trigger cms_test_fail_publish on public.cms_page_published;
select pg_temp.as_user('00000000-0000-4000-8000-000000012002');

select public.cms_page_lock_force_unlock('activity-fixture');
select is(pg_temp.events('force_unlock', 'page'), 1, 'Force unlock of a held lock writes an event');
select is((pg_temp.last_event()).details, null, 'the force unlock event carries no details');
select public.cms_page_lock_force_unlock('activity-fixture');
select is(pg_temp.events('force_unlock', 'page'), 1, 'Force unlock without a lock writes nothing');

-- "Publish translation" promotes through the same function: one event per page.
select pg_temp.as_user('00000000-0000-4000-8000-000000012001');
select set_config('cms_test.token_b', public.cms_page_lock_acquire('activity-second')::text, true);
select public.cms_page_save_draft('activity-second', 'en', '{"title": "B"}', current_setting('cms_test.token_b')::uuid);
select public.cms_page_lock_release('activity-second', current_setting('cms_test.token_b')::uuid);
select set_config('cms_test.token', public.cms_page_lock_acquire('activity-fixture')::text, true);
select public.cms_page_lock_release('activity-fixture', current_setting('cms_test.token')::uuid);

reset role;
select set_config('cms_test.pages', (
  select jsonb_agg(jsonb_build_object('key', p.key, 'draftUpdatedAt', d.updated_at))::text
    from public.cms_page_draft d
    join public.cms_pages p on p.id = d.page_id
    where p.key in ('activity-fixture', 'activity-second') and d.locale = 'en'
), true);
select pg_temp.as_user('00000000-0000-4000-8000-000000012001');

select results_eq(
  $$ select published from public.cms_language_publish('en', current_setting('cms_test.pages')::jsonb) $$,
  $$ values (2) $$,
  'Publish translation publishes both pages'
);
select is(pg_temp.events('publish', 'page'), 3, 'Publish translation writes one publish event per page');
select is(
  (select count(*)::integer from public.cms_activity where action = 'publish' and revision_id is null),
  0,
  'every publish event points at its revision'
);

-- Editors and anon do not read the log ---------------------------------------------

select pg_temp.as_user('00000000-0000-4000-8000-000000012003');
select is((select count(*)::integer from public.cms_activity), 0, 'an editor sees no events');
select throws_ok(
  $$ insert into public.cms_activity (action, entity_type) values ('publish', 'page') $$,
  '42501', null, 'an editor cannot write the log'
);

select pg_temp.as_user('00000000-0000-4000-8000-000000012001');
select ok((select count(*)::integer from public.cms_activity) > 0, 'the owner reads the log');
select throws_ok(
  $$ insert into public.cms_activity (action, entity_type) values ('publish', 'page') $$,
  '42501', null, 'not even the CMS owner can write the log directly'
);
select throws_ok(
  $$ update public.cms_activity set action = 'restore' $$,
  '42501', null, 'the CMS owner cannot change events'
);
select throws_ok(
  $$ delete from public.cms_activity $$,
  '42501', null, 'the CMS owner cannot delete events'
);
select throws_ok(
  $$ select public.cms_activity_log('publish', 'page', null, 'forged') $$,
  '42501', null, 'the CMS owner cannot call the logger'
);

reset role;
set local role anon;
select throws_ok($$ select * from public.cms_activity $$, '42501', null, 'anon cannot read the log');
reset role;

-- Media ------------------------------------------------------------------------------

select pg_temp.as_user('00000000-0000-4000-8000-000000012001');
select set_config('cms_test.media', public.cms_media_create('c0000000-0000-4000-8000-000000000001.jpg', ' hero.jpg ')::text, true);
select results_eq(
  $$ select e.action, e.entity_type, e.entity_id, e.entity_label from pg_temp.last_event() e $$,
  $$ values ('upload', 'media', current_setting('cms_test.media'), 'hero.jpg') $$,
  'Upload writes an event with the media id and name'
);

select public.cms_media_replace(current_setting('cms_test.media')::uuid, 'c0000000-0000-4000-8000-000000000002.jpg');
select is(pg_temp.events('replace', 'media'), 1, 'Replace writes an event');

select public.cms_media_delete(current_setting('cms_test.media')::uuid);
select is(pg_temp.events('delete', 'media'), 1, 'Delete writes an event');

-- Languages --------------------------------------------------------------------------

select public.cms_language_add('uk', 'Ukrainian', 'Українська');
select results_eq(
  $$ select e.action, e.entity_id, e.entity_label from pg_temp.last_event() e $$,
  $$ values ('add', 'uk', 'Ukrainian') $$,
  'Adding a language writes an event'
);

select public.cms_language_set_active('de', true);
select is((pg_temp.last_event()).action, 'show', 'Showing a language writes an event');
select public.cms_language_set_active('de', true);
select is(pg_temp.events('show', 'language'), 1, 'Showing a shown language writes nothing');
select public.cms_language_set_active('de', false);
select is(pg_temp.events('hide', 'language'), 1, 'Hiding a language writes an event');

select public.cms_language_delete('de');
select results_eq(
  $$ select e.action, e.entity_id, e.entity_label from pg_temp.last_event() e $$,
  $$ values ('delete', 'de', 'German') $$,
  'Deleting a language writes an event with its name'
);

-- Settings ---------------------------------------------------------------------------

select set_config('cms_test.before', pg_temp.total()::text, true);

update public.cms_site_settings
  set maintenance_mode = not maintenance_mode,
      contact_email = 'very.long.contact.address.' || repeat('x', 200) || '@example.test'
  where id = 1;

select is(pg_temp.total(), current_setting('cms_test.before')::integer + 1, 'one save of settings writes one event');
select is(
  (select jsonb_array_length(e.details -> 'changes') from pg_temp.last_event() e),
  2,
  'the event lists both changed fields'
);
select ok(
  (select e.details::text not like '%example.test%' and e.details::text not like '%xxxx%' from pg_temp.last_event() e),
  'the contact value is not in the event'
);
select results_eq(
  $$ select c ->> 'field', c ? 'from', c ? 'to'
       from pg_temp.last_event() e, jsonb_array_elements(e.details -> 'changes') c
       order by 1 $$,
  $$ values ('contact_email', false, false), ('maintenance_mode', true, true) $$,
  'only maintenance mode carries from / to'
);

update public.cms_site_settings set maintenance_mode = maintenance_mode where id = 1;
select is(pg_temp.total(), current_setting('cms_test.before')::integer + 1, 'a save without changes writes nothing');

update public.cms_site_settings
  set site_name = repeat('N', 200),
      logo_media_id = null,
      favicon_media_id = null
  where id = 1;
select ok(
  (select e.details::text not like '%NNNN%' from pg_temp.last_event() e),
  'a long site name saves and is not copied into the event'
);

insert into public.cms_site_settings_translations (locale, site_name)
  values ('uk', 'Сайт')
  on conflict (locale) do update set site_name = excluded.site_name;
select results_eq(
  $$ select e.action, e.entity_type, e.locale::text, e.details from pg_temp.last_event() e $$,
  $$ values ('update', 'settings', 'uk', '{"changes": [{"field": "site_name"}]}'::jsonb) $$,
  'the first site name in a language writes an event'
);

select set_config('cms_test.before', pg_temp.total()::text, true);
insert into public.cms_site_settings_translations (locale, site_name)
  values ('uk', 'Сайт')
  on conflict (locale) do update set site_name = excluded.site_name;
select is(pg_temp.total(), current_setting('cms_test.before')::integer, 'saving the same name again writes nothing');
insert into public.cms_site_settings_translations (locale, site_name)
  values ('uk', 'Новий сайт')
  on conflict (locale) do update set site_name = excluded.site_name;
select is(pg_temp.total(), current_setting('cms_test.before')::integer + 1, 'changing the name writes an event');

-- Forms ------------------------------------------------------------------------------

select public.cms_form_set_enabled('contact', true);
select is(pg_temp.events('enable', 'form') + pg_temp.events('disable', 'form'), 0,
  'turning on a form that is on (insert of the default) writes nothing');
select public.cms_form_set_enabled('contact', false);
select is(pg_temp.events('disable', 'form'), 1, 'pausing a form writes an event');
select public.cms_form_set_enabled('contact', false);
select is(pg_temp.events('disable', 'form'), 1, 'pausing a paused form writes nothing');
select public.cms_form_set_enabled('contact', true);
select is(pg_temp.events('enable', 'form'), 1, 'turning a form back on writes an event');
select public.cms_form_set_enabled('quote', false);
select is(pg_temp.events('disable', 'form'), 2, 'the first pause of a form without a row writes an event');

-- Submissions ------------------------------------------------------------------------

reset role;
select set_config('cms_test.before', pg_temp.total()::text, true);
insert into public.cms_form_submissions (id, form_key, payload, payload_fingerprint, location, client_token)
values
  ('00000000-0000-4000-8000-0000000120a1', 'contact', '{"email": "visitor@example.test"}', 'f1', 'inbox', gen_random_uuid()),
  ('00000000-0000-4000-8000-0000000120a2', 'contact', '{}', 'f2', 'inbox', gen_random_uuid()),
  ('00000000-0000-4000-8000-0000000120a3', 'contact', '{}', 'f3', 'inbox', gen_random_uuid()),
  ('00000000-0000-4000-8000-0000000120a4', 'contact', '{}', 'f4', 'archived', gen_random_uuid()),
  ('00000000-0000-4000-8000-0000000120b1', 'quote', '{}', 'f5', 'inbox', gen_random_uuid());
select is(pg_temp.total(), current_setting('cms_test.before')::integer, 'new submissions write nothing');
select pg_temp.as_user('00000000-0000-4000-8000-000000012002');

update public.cms_form_submissions
  set location = 'archived'
  where id in ('00000000-0000-4000-8000-0000000120a1', '00000000-0000-4000-8000-0000000120a2',
               '00000000-0000-4000-8000-0000000120a3', '00000000-0000-4000-8000-0000000120a4');
select results_eq(
  $$ select e.action, e.entity_id, e.entity_label, e.details from pg_temp.last_event() e $$,
  $$ values ('archive', null::text, 'contact', '{"count": 3, "form": "contact"}'::jsonb) $$,
  'archiving four submissions, one already archived, writes one event counting three'
);
select ok(
  (select e.details::text not like '%visitor%' from pg_temp.last_event() e),
  'the event carries no submission values'
);

select set_config('cms_test.before', pg_temp.total()::text, true);
update public.cms_form_submissions set read_at = now() where location = 'archived';
update public.cms_form_submissions set location = 'archived' where location = 'archived';
select is(pg_temp.total(), current_setting('cms_test.before')::integer, 'marking read and a no-op move write nothing');

update public.cms_form_submissions set location = 'spam' where id = '00000000-0000-4000-8000-0000000120a1';
select results_eq(
  $$ select e.action, e.entity_id, e.details from pg_temp.last_event() e $$,
  $$ values ('spam', '00000000-0000-4000-8000-0000000120a1', '{"count": 1, "form": "contact"}'::jsonb) $$,
  'moving one submission points at it'
);

delete from public.cms_form_submissions
  where id in ('00000000-0000-4000-8000-0000000120a2', '00000000-0000-4000-8000-0000000120b1');
select results_eq(
  $$ select e.action, e.entity_label, e.details from pg_temp.last_event() e $$,
  $$ values ('delete', null::text, '{"count": 2}'::jsonb) $$,
  'deleting submissions of two forms writes one event with the count only'
);

select set_config('cms_test.before', pg_temp.total()::text, true);
delete from public.cms_form_submissions where id = '00000000-0000-4000-8000-0000000120ff';
select is(pg_temp.total(), current_setting('cms_test.before')::integer, 'deleting nothing writes nothing');

-- A deleted user keeps the history -------------------------------------------------

select pg_temp.as_user('00000000-0000-4000-8000-000000012004');
select public.cms_media_create('c0000000-0000-4000-8000-000000000003.jpg', 'leaver.jpg');

reset role;
delete from auth.users where id = '00000000-0000-4000-8000-000000012004';

select results_eq(
  $$ select actor_id, actor_email from public.cms_activity where entity_label = 'leaver.jpg' $$,
  $$ values (null::uuid, 'leaver-012@example.test') $$,
  'after the user is deleted, the event stays with the email snapshot'
);

select * from finish();

rollback;
