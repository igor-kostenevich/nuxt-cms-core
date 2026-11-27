-- Entries (014, stage 2a): `npm run test:db`. One transaction, rolled back.
--
-- Checked:
--   1. who may call what: internal functions for nobody, entry RPCs for
--      signed-in users only, no direct writes to cms_entries;
--   2. integrity of documents with two subtypes: one UUID never belongs to a
--      page and an entry, no orphan documents, type and id never change,
--      deleting an entry (or its document) removes all its content;
--   3. create: atomic (document + entry + draft + Activity), with the lock
--      for Content and without it for Pages, a title required, a retry with
--      the same id returns the same entry and creates nothing;
--   4. lifecycle on the shared tables: lock, save, publish, restore,
--      translation, force unlock, language delete, the (type, id) pair.

begin;

create extension if not exists pgtap with schema extensions;

select plan(82);

-- Fixture -------------------------------------------------------------------------

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-0000000014a1', 'admin-014@example.test'),
  ('00000000-0000-4000-8000-0000000014b1', 'owner-014@example.test'),
  ('00000000-0000-4000-8000-0000000014e1', 'editor-014@example.test'),
  ('00000000-0000-4000-8000-0000000014e2', 'editor2-014@example.test'),
  ('00000000-0000-4000-8000-0000000014c1', 'customer-014@example.test');

insert into public.cms_users (user_id, role, status)
values
  ('00000000-0000-4000-8000-0000000014a1', 'admin', 'active'),
  ('00000000-0000-4000-8000-0000000014b1', 'owner', 'active'),
  ('00000000-0000-4000-8000-0000000014e1', 'editor', 'active'),
  ('00000000-0000-4000-8000-0000000014e2', 'editor', 'active');

-- A known language set: `xa` is the original, `xb` a translation.
delete from public.cms_site_settings_translations;
delete from public.cms_site_texts;
delete from public.cms_languages;

insert into public.cms_languages (code, name, native_name, is_default, active, sort_order)
values
  ('xa', 'Original', 'Original', true, true, 0),
  ('xb', 'Second', 'Second', false, true, 1);

insert into public.cms_pages (id, key) values ('00000000-0000-4000-8000-000000001400', 'entries-page-fixture');

-- Acting as a signed-in user: `select pg_temp.act('…'); set local role authenticated;`.
create function pg_temp.act(user_id text)
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- Documents without their subtype, or of the wrong kind.
create function pg_temp.broken_documents()
returns integer
language sql
as $$
  select count(*)::int
    from public.cms_documents d
    where not (
      (d.kind = 'page' and exists (select 1 from public.cms_pages p where p.id = d.id))
      or (d.kind = 'entry' and exists (select 1 from public.cms_entries e where e.id = d.id))
    )
$$;

-- 1. Who may call what -------------------------------------------------------------

select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('cms_entry_lock_row', 'cms_entry_take_lock', 'cms_entry_held_lock', 'cms_entry_check_title',
                         'cms_entry_title_of', 'cms_document_event', 'cms_document_restore', 'cms_entry_keep_type')
       and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0,
  'internal entry functions: no client may call them'
);

select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'cms_entry\_%' escape '\'
       -- The visibility helper runs inside RLS policies, for anon too; the public
       -- reads of stage 3 are for the site.
       and p.proname not in ('cms_entry_public', 'cms_entry_public_slugs', 'cms_entry_get_localized')
       and has_function_privilege('anon', p.oid, 'execute')),
  0,
  'anon cannot call any entry RPC'
);

select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('cms_entry_create', 'cms_entry_lock_acquire', 'cms_entry_lock_heartbeat', 'cms_entry_lock_release',
                         'cms_entry_lock_force_unlock', 'cms_entry_lock_status', 'cms_entry_get_editable',
                         'cms_entry_locale_states', 'cms_entry_save_draft', 'cms_entry_publish', 'cms_entry_restore')
       and has_function_privilege('authenticated', p.oid, 'execute')),
  11,
  'signed-in users call the 11 entry RPCs (each checks the CMS permission)'
);

select ok(
  (select bool_and(p.prorettype = 'boolean'::regtype and p.prosecdef)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('cms_document_public', 'cms_entry_public')),
  'visibility helpers are security definer and answer only a boolean'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.cms_entries'::regclass),
  'cms_entries has RLS'
);

select ok(
  not has_table_privilege('authenticated', 'public.cms_entries', 'insert')
    and not has_table_privilege('authenticated', 'public.cms_entries', 'update')
    and not has_table_privilege('authenticated', 'public.cms_entries', 'delete')
    and not has_table_privilege('anon', 'public.cms_entries', 'insert'),
  'no direct writes to cms_entries'
);

select ok(
  not has_column_privilege('authenticated', 'public.cms_entries', 'created_by', 'select')
    and not has_column_privilege('anon', 'public.cms_entries', 'created_by', 'select'),
  'who created an entry is not readable'
);

-- 2. Integrity of documents ------------------------------------------------------------

insert into public.cms_entries (id, type) values ('00000000-0000-4000-8000-000000001401', 'job');

select is(
  (select kind from public.cms_documents where id = '00000000-0000-4000-8000-000000001401'),
  'entry',
  'inserting an entry creates its document of kind entry'
);

select throws_ok(
  $$ insert into public.cms_pages (id, key) values ('00000000-0000-4000-8000-000000001401', 'steals-entry-id') $$,
  '23505', null,
  'a page cannot take the id of an entry'
);

select throws_ok(
  $$ insert into public.cms_entries (id, type) values ('00000000-0000-4000-8000-000000001400', 'job') $$,
  '23505', null,
  'an entry cannot take the id of a page'
);

select throws_ok(
  $$ update public.cms_entries set type = 'post' where id = '00000000-0000-4000-8000-000000001401' $$,
  '23514', null,
  'the type of an entry never changes'
);

select throws_ok(
  $$ update public.cms_entries set id = '00000000-0000-4000-8000-0000000014ff' where id = '00000000-0000-4000-8000-000000001401' $$,
  '23514', null,
  'the id of an entry never changes'
);

select throws_ok(
  $$ insert into public.cms_entries (id, type) values (gen_random_uuid(), 'Not_A_Type') $$,
  '23514', null,
  'a type key has the declared format'
);

-- Content of every kind, then the entry goes.
insert into public.cms_page_draft (page_id, locale, content) values ('00000000-0000-4000-8000-000000001401', 'xa', '{"title": "D"}');
insert into public.cms_page_published (page_id, locale, content) values ('00000000-0000-4000-8000-000000001401', 'xa', '{"title": "P"}');
insert into public.cms_page_revisions (page_id, locale, content) values ('00000000-0000-4000-8000-000000001401', 'xa', '{"title": "P"}');
insert into public.cms_page_locks (page_id, user_id) values ('00000000-0000-4000-8000-000000001401', '00000000-0000-4000-8000-0000000014e1');

delete from public.cms_entries where id = '00000000-0000-4000-8000-000000001401';

select is(
  (select count(*)::int from public.cms_documents where id = '00000000-0000-4000-8000-000000001401')
    + (select count(*)::int from public.cms_page_draft where page_id = '00000000-0000-4000-8000-000000001401')
    + (select count(*)::int from public.cms_page_published where page_id = '00000000-0000-4000-8000-000000001401')
    + (select count(*)::int from public.cms_page_revisions where page_id = '00000000-0000-4000-8000-000000001401')
    + (select count(*)::int from public.cms_page_locks where page_id = '00000000-0000-4000-8000-000000001401'),
  0,
  'deleting an entry deletes its document, draft, publication, revisions and lock'
);

insert into public.cms_entries (id, type) values ('00000000-0000-4000-8000-000000001402', 'job');
delete from public.cms_documents where id = '00000000-0000-4000-8000-000000001402';

select is(
  (select count(*)::int from public.cms_entries where id = '00000000-0000-4000-8000-000000001402'),
  0,
  'deleting the document deletes the entry'
);

select is(pg_temp.broken_documents(), 0, 'no orphan document, no document of the wrong kind');

-- 3. Create ---------------------------------------------------------------------------

select pg_temp.act('00000000-0000-4000-8000-0000000014e1');
set local role authenticated;

-- Content: the dialog creates on the first save and holds the lock.
select set_config('t.created', (
  select row_to_json(c)::text
    from public.cms_entry_create('job', '{"title": "Designer", "city": "Kyiv"}', true, '00000000-0000-4000-8000-000000001410') c
), true);

select is(
  current_setting('t.created')::json ->> 'id',
  '00000000-0000-4000-8000-000000001410',
  'create returns the id the client chose'
);

select ok(
  (current_setting('t.created')::json ->> 'lock_token') is not null
    and (current_setting('t.created')::json ->> 'draft_updated_at') is not null,
  'create with take_lock returns the draft time and a lock token'
);

reset role;

select is(
  (select l.token::text from public.cms_page_locks l
     where l.page_id = '00000000-0000-4000-8000-000000001410' and l.user_id = '00000000-0000-4000-8000-0000000014e1'),
  current_setting('t.created')::json ->> 'lock_token',
  'the lock belongs to the creator, under the returned token'
);

select is(
  (select content from public.cms_page_draft where page_id = '00000000-0000-4000-8000-000000001410' and locale = 'xa'),
  '{"title": "Designer", "city": "Kyiv"}'::jsonb,
  'the first draft is in the language of the original'
);

select is(
  (select kind from public.cms_documents where id = '00000000-0000-4000-8000-000000001410'),
  'entry',
  'create made the document'
);

select is(
  (select count(*)::int from public.cms_activity
     where action = 'create' and entity_type = 'entry' and entity_id = '00000000-0000-4000-8000-000000001410'
       and entity_label = 'Designer' and details ->> 'type' = 'job'
       and actor_id = '00000000-0000-4000-8000-0000000014e1'),
  1,
  'create records one Activity event with the title and the type'
);

select pg_temp.act('00000000-0000-4000-8000-0000000014e1');
set local role authenticated;

-- Pages: the create dialog does not lock; Edit Mode takes the lock later.
select is(
  (select lock_token from public.cms_entry_create('job', '{"title": "Writer"}', false, '00000000-0000-4000-8000-000000001411')),
  null,
  'create without take_lock returns no token'
);

reset role;

select is(
  (select count(*)::int from public.cms_page_locks where page_id = '00000000-0000-4000-8000-000000001411'),
  0,
  'and takes no lock'
);

select ok(
  (select sort_order from public.cms_entries where id = '00000000-0000-4000-8000-000000001411')
    < (select sort_order from public.cms_entries where id = '00000000-0000-4000-8000-000000001410'),
  'a new entry goes first in the manual order'
);

select pg_temp.act('00000000-0000-4000-8000-0000000014e1');
set local role authenticated;

select throws_ok(
  $$ select * from public.cms_entry_create('job', '{"title": "  "}', true, '00000000-0000-4000-8000-000000001412') $$,
  '23514', null,
  'create refuses a blank title'
);

select throws_ok(
  $$ select * from public.cms_entry_create('job', '{"city": "Lviv"}', true, '00000000-0000-4000-8000-000000001412') $$,
  '23514', null,
  'create refuses a content without title'
);

select throws_ok(
  $$ select * from public.cms_entry_create('job', '"text"', false, '00000000-0000-4000-8000-000000001412') $$,
  '23514', null,
  'create refuses content that is not an object'
);

select throws_ok(
  $$ select * from public.cms_entry_create('Job!', '{"title": "x"}', false, '00000000-0000-4000-8000-000000001412') $$,
  '23514', null,
  'create refuses a malformed type'
);

select throws_ok(
  $$ select * from public.cms_entry_create('job', '{"title": "x"}', false, null) $$,
  '23514', null,
  'create needs the id chosen by the client'
);

reset role;

select is(
  (select count(*)::int from public.cms_entries where id = '00000000-0000-4000-8000-000000001412')
    + (select count(*)::int from public.cms_documents where id = '00000000-0000-4000-8000-000000001412')
    + (select count(*)::int from public.cms_activity where entity_id = '00000000-0000-4000-8000-000000001412'),
  0,
  'a refused create leaves no entry, document or event'
);

-- Retries ----------------------------------------------------------------------------

select pg_temp.act('00000000-0000-4000-8000-0000000014e1');
set local role authenticated;

select is(
  (select id::text from public.cms_entry_create('job', '{"title": "Other title"}', false, '00000000-0000-4000-8000-000000001410')),
  '00000000-0000-4000-8000-000000001410',
  'a retried create returns the same entry'
);

select is(
  (select lock_token from public.cms_entry_create('job', '{"title": "Other title"}', false, '00000000-0000-4000-8000-000000001410')),
  null,
  'a retry without take_lock hands out no token'
);

select set_config('t.retry_token', (
  select lock_token::text from public.cms_entry_create('job', '{"title": "Designer"}', true, '00000000-0000-4000-8000-000000001410')
), true);

select ok(current_setting('t.retry_token') <> '', 'a retried create with take_lock gets the lock again');

-- The retry gets a token of its own; the token of the first answer is never
-- handed out again and stops working (the lost answer cannot be replayed).
select isnt(
  current_setting('t.retry_token'),
  current_setting('t.created')::json ->> 'lock_token',
  'the retry does not reveal the token of the first session'
);

select throws_ok(
  format($$ select public.cms_entry_save_draft('job', '00000000-0000-4000-8000-000000001410', 'xa', '{"title": "Replay"}', %L) $$,
         current_setting('t.created')::json ->> 'lock_token'),
  'CMSLL', null,
  'the first token no longer writes'
);

reset role;

select is(
  (select count(*)::int from public.cms_entries where id = '00000000-0000-4000-8000-000000001410')
    || '/' || (select count(*)::int from public.cms_activity where action = 'create' and entity_id = '00000000-0000-4000-8000-000000001410')
    || '/' || (select count(*)::int from public.cms_page_locks where page_id = '00000000-0000-4000-8000-000000001410'),
  '1/1/1',
  'retries: one entry, one create event, one lock'
);

select is(
  (select content ->> 'title' from public.cms_page_draft where page_id = '00000000-0000-4000-8000-000000001410' and locale = 'xa'),
  'Designer',
  'a retry does not overwrite the draft'
);

select is(
  (select token::text from public.cms_page_locks where page_id = '00000000-0000-4000-8000-000000001410'),
  current_setting('t.retry_token'),
  'the lock now has the token of the retry'
);

select pg_temp.act('00000000-0000-4000-8000-0000000014e2');
set local role authenticated;

select throws_ok(
  $$ select * from public.cms_entry_create('job', '{"title": "Mine"}', false, '00000000-0000-4000-8000-000000001410') $$,
  'CMSCF', null,
  'another user cannot repeat a create'
);

select pg_temp.act('00000000-0000-4000-8000-0000000014e1');

select throws_ok(
  $$ select * from public.cms_entry_create('post', '{"title": "x"}', false, '00000000-0000-4000-8000-000000001410') $$,
  'CMSCF', null,
  'a retry of another type is refused'
);

select throws_ok(
  $$ select * from public.cms_entry_create('job', '{"title": "x"}', false, '00000000-0000-4000-8000-000000001400') $$,
  'CMSCF', null,
  'the id of a page cannot become an entry'
);

-- Who may create.
select pg_temp.act('00000000-0000-4000-8000-0000000014c1');

select throws_ok(
  $$ select * from public.cms_entry_create('job', '{"title": "x"}', false, gen_random_uuid()) $$,
  '42501', null,
  'a signed-in user without CMS access cannot create'
);

reset role;
set local role anon;

select throws_ok(
  $$ select * from public.cms_entry_create('job', '{"title": "x"}', false, gen_random_uuid()) $$,
  '42501', null,
  'anon cannot create'
);

select throws_ok(
  $$ insert into public.cms_entries (id, type) values (gen_random_uuid(), 'job') $$,
  '42501', null,
  'anon cannot insert an entry'
);

reset role;

-- 4. Lifecycle ------------------------------------------------------------------------

-- Entry 1410: the editor holds the lock under t.retry_token.
select pg_temp.act('00000000-0000-4000-8000-0000000014e1');
set local role authenticated;

select lives_ok(
  format($$ select public.cms_entry_save_draft('job', '00000000-0000-4000-8000-000000001410', 'xa', '{"title": "Designer 2", "city": "Kyiv"}', %L) $$,
         current_setting('t.retry_token')),
  'the holder saves a draft'
);

select throws_ok(
  format($$ select public.cms_entry_save_draft('job', '00000000-0000-4000-8000-000000001410', 'xa', '{"city": "Kyiv"}', %L) $$,
         current_setting('t.retry_token')),
  '23514', null,
  'a draft in the original keeps its title'
);

select throws_ok(
  format($$ select public.cms_entry_save_draft('post', '00000000-0000-4000-8000-000000001410', 'xa', '{"title": "x"}', %L) $$,
         current_setting('t.retry_token')),
  'CMSLL', null,
  'the wrong type does not reach the entry'
);

select throws_ok(
  $$ select public.cms_entry_get_editable('post', '00000000-0000-4000-8000-000000001410', null, null) $$,
  'P0002', null,
  'an id of another type is not found'
);

select is(
  (select draft ->> 'title' from public.cms_entry_get_editable('job', '00000000-0000-4000-8000-000000001410', null, null)),
  'Designer 2',
  'the editor reads the draft by type and id'
);

select throws_ok(
  format($$ select public.cms_entry_publish('job', '00000000-0000-4000-8000-000000001410', 'xa', %L) $$,
         current_setting('t.retry_token')),
  '42501', null,
  'an editor cannot publish'
);

select pg_temp.act('00000000-0000-4000-8000-0000000014e2');

select throws_ok(
  $$ select public.cms_entry_lock_acquire('job', '00000000-0000-4000-8000-000000001410') $$,
  'CMSLK', null,
  'a second editor gets the entry locked'
);

select throws_ok(
  format($$ select public.cms_entry_save_draft('job', '00000000-0000-4000-8000-000000001410', 'xa', '{"title": "x"}', %L) $$,
         current_setting('t.retry_token')),
  'CMSLL', null,
  'a second editor cannot save with the token of the first'
);

select throws_ok(
  $$ select public.cms_entry_lock_force_unlock('job', '00000000-0000-4000-8000-000000001410') $$,
  '42501', null,
  'an editor cannot force an unlock'
);

select is(
  (select is_mine from public.cms_entry_lock_status('job', '00000000-0000-4000-8000-000000001410')),
  false,
  'the lock status names someone else'
);

-- The admin takes over, publishes, translates and restores.
select pg_temp.act('00000000-0000-4000-8000-0000000014a1');

select lives_ok(
  $$ select public.cms_entry_lock_force_unlock('job', '00000000-0000-4000-8000-000000001410') $$,
  'an admin forces the unlock'
);

select set_config('t.admin_token', public.cms_entry_lock_acquire('job', '00000000-0000-4000-8000-000000001410')::text, true);

select ok(current_setting('t.admin_token') <> '', 'and takes the lock');

select ok(
  (select public.cms_entry_publish('job', '00000000-0000-4000-8000-000000001410', 'xa', current_setting('t.admin_token')::uuid)) is not null,
  'the admin publishes the draft'
);

select throws_ok(
  format($$ select public.cms_entry_publish('job', '00000000-0000-4000-8000-000000001410', 'xa', %L) $$,
         current_setting('t.admin_token')),
  'P0002', null,
  'nothing left to publish'
);

select lives_ok(
  format($$ select public.cms_entry_save_draft('job', '00000000-0000-4000-8000-000000001410', 'xb', '{"title": "Designerin"}', %L) $$,
         current_setting('t.admin_token')),
  'a translation saves without the original''s other fields'
);

select lives_ok(
  format($$ select public.cms_entry_publish('job', '00000000-0000-4000-8000-000000001410', 'xb', %L) $$,
         current_setting('t.admin_token')),
  'and publishes'
);

select is(
  (select array_agg(locale || ':' || has_draft::text || ':' || (published_at is not null)::text order by locale)
     from public.cms_entry_locale_states('job', '00000000-0000-4000-8000-000000001410')),
  array['xa:false:true', 'xb:false:true'],
  'locale states list both published languages'
);

select lives_ok(
  format($$ select public.cms_entry_save_draft('job', '00000000-0000-4000-8000-000000001410', 'xa', '{"title": "Designer 3"}', %L) $$,
         current_setting('t.admin_token')),
  'a new draft of the original'
);

select set_config('t.revision', (
  select r.id::text from public.cms_page_revisions r
    where r.page_id = '00000000-0000-4000-8000-000000001410' and r.locale = 'xa'
    order by r.created_at desc limit 1
), true);

select throws_ok(
  format($$ select public.cms_entry_restore('job', '00000000-0000-4000-8000-000000001410', 'xa', %L, %L) $$,
         current_setting('t.revision'), current_setting('t.admin_token')),
  'CMSCF', null,
  'restore does not replace a draft unless asked'
);

select lives_ok(
  format($$ select public.cms_entry_restore('job', '00000000-0000-4000-8000-000000001410', 'xa', %L, %L, true) $$,
         current_setting('t.revision'), current_setting('t.admin_token')),
  'restore replaces the draft when asked'
);

select throws_ok(
  format($$ select public.cms_entry_restore('job', '00000000-0000-4000-8000-000000001410', 'xa', %L, %L, true) $$,
         '00000000-0000-4000-8000-0000000014ff', current_setting('t.admin_token')),
  'P0002', null,
  'a revision of another document is not found'
);

select lives_ok(
  format($$ select public.cms_entry_lock_heartbeat('job', '00000000-0000-4000-8000-000000001410', %L) $$,
         current_setting('t.admin_token')),
  'heartbeat keeps the lock'
);

reset role;

-- The restored revision is the live version: the draft equals Published, so
-- there is no draft left (write_draft drops a draft equal to Published).
select is(
  (select count(*)::int from public.cms_page_draft where page_id = '00000000-0000-4000-8000-000000001410' and locale = 'xa'),
  0,
  'restoring the live version leaves no draft'
);

select is(
  (select count(*)::int from public.cms_page_revisions where page_id = '00000000-0000-4000-8000-000000001410'),
  2,
  'each publish made a revision'
);

select ok(
  (select first_published_at from public.cms_entries where id = '00000000-0000-4000-8000-000000001410')
    = (select published_at from public.cms_page_published where page_id = '00000000-0000-4000-8000-000000001410' and locale = 'xa'),
  'first_published_at is the publication in the original, not the translation'
);

select is(
  (select array_agg(action || ':' || entity_type || ':' || coalesce(entity_label, '') || ':' || coalesce(details ->> 'type', '') order by created_at, action)
     from public.cms_activity
     where entity_id = '00000000-0000-4000-8000-000000001410' and action <> 'create'),
  array[
    'force_unlock:entry:Designer 2:job',
    'publish:entry:Designer 2:job',
    'publish:entry:Designer 2:job',
    -- The label is the title after the change: the restored one.
    'restore:entry:Designer 2:job'
  ],
  'Activity records unlock, both publications and the restore as entry events'
);

select is(
  (select details ->> 'replacedDraft' from public.cms_activity
     where entity_id = '00000000-0000-4000-8000-000000001410' and action = 'restore'),
  'true',
  'the restore event says it replaced a draft'
);

select pg_temp.act('00000000-0000-4000-8000-0000000014a1');
set local role authenticated;

select lives_ok(
  format($$ select public.cms_entry_lock_release('job', '00000000-0000-4000-8000-000000001410', %L) $$,
         current_setting('t.admin_token')),
  'release'
);

select lives_ok(
  format($$ select public.cms_entry_lock_release('job', '00000000-0000-4000-8000-000000001410', %L) $$,
         current_setting('t.admin_token')),
  'releasing again is not an error'
);

select throws_ok(
  $$ select public.cms_entry_lock_acquire('post', '00000000-0000-4000-8000-000000001410') $$,
  'P0002', null,
  'a lock of another type is not found'
);

select throws_ok(
  $$ select public.cms_entry_lock_acquire('job', '00000000-0000-4000-8000-0000000014ff') $$,
  'P0002', null,
  'a lock of a missing entry is not found'
);

reset role;

select is(
  (select count(*)::int from public.cms_page_locks where page_id = '00000000-0000-4000-8000-000000001410'),
  0,
  'no lock left'
);

-- Pages keep their own events.
select is(
  (select entity_type from public.cms_document_event('00000000-0000-4000-8000-000000001400')),
  'page',
  'a page is still a page in Activity'
);

-- Deleting a language removes the entry content in it (no live locks: the
-- other test editor's lock on 1411 does not exist; 1410 was released).
delete from public.cms_page_locks where page_id in (select id from public.cms_entries);

select pg_temp.act('00000000-0000-4000-8000-0000000014b1');
set local role authenticated;

select lives_ok($$ select public.cms_language_delete('xb') $$, 'the owner deletes the translation language');

reset role;

select is(
  (select count(*)::int from public.cms_page_published where page_id = '00000000-0000-4000-8000-000000001410' and locale = 'xb')
    + (select count(*)::int from public.cms_page_revisions where page_id = '00000000-0000-4000-8000-000000001410' and locale = 'xb'),
  0,
  'the entry has nothing left in the deleted language'
);

select is(
  (select count(*)::int from public.cms_page_published where page_id = '00000000-0000-4000-8000-000000001410' and locale = 'xa'),
  1,
  'and keeps the original'
);

select is(pg_temp.broken_documents(), 0, 'still no orphan document and no document of the wrong kind');

select * from finish();

rollback;
