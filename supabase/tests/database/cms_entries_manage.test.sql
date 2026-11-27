-- Managing entries and media in use (014, stage 2c): `npm run test:db`. One transaction, rolled back.
--
-- Checked:
--   1. Archive / Unarchive keep drafts, publications, addresses and history,
--      hide and show the entry publicly, refuse while it is open in the editor;
--   2. the manual order: one atomic save of the full list against the version
--      read, one Activity event, every malformed list refused with no change;
--   3. the admin list: status, title, search, the archive filter, total and
--      paging, sorts, access; the status of chosen entries;
--   4. media in use (pages, entries archived or not, Brand) cannot be deleted;
--      usage lists entries.

begin;

create extension if not exists pgtap with schema extensions;

select plan(95);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-0000000019a1', 'admin-014-manage@example.test'),
  ('00000000-0000-4000-8000-0000000019e1', 'editor-014-manage@example.test'),
  ('00000000-0000-4000-8000-0000000019e2', 'editor2-014-manage@example.test'),
  ('00000000-0000-4000-8000-0000000019c1', 'customer-014-manage@example.test');

insert into public.cms_users (user_id, role, status)
values
  ('00000000-0000-4000-8000-0000000019a1', 'admin', 'active'),
  ('00000000-0000-4000-8000-0000000019e1', 'editor', 'active'),
  ('00000000-0000-4000-8000-0000000019e2', 'editor', 'active');

delete from public.cms_site_settings_translations;
delete from public.cms_site_texts;
delete from public.cms_languages;

insert into public.cms_languages (code, name, native_name, is_default, active, sort_order)
values
  ('xa', 'Original', 'Original', true, true, 0),
  ('xb', 'Second', 'Second', false, true, 1);

-- J1 published + translated, J2 published with a pending draft, J3 draft only,
-- J4 published, J5 of another type. Manual order J1, J2, J3, J4.
insert into public.cms_entries (id, type, sort_order) values
  ('00000000-0000-4000-8000-000000001901', 'job', 0),
  ('00000000-0000-4000-8000-000000001902', 'job', 1),
  ('00000000-0000-4000-8000-000000001903', 'job', 2),
  ('00000000-0000-4000-8000-000000001904', 'job', 3),
  ('00000000-0000-4000-8000-000000001905', 'other', 0);

insert into public.cms_page_published (page_id, locale, content, published_at) values
  ('00000000-0000-4000-8000-000000001901', 'xa', '{"title": "Designer", "slug": "designer"}', '2026-11-20T10:00:00Z'),
  ('00000000-0000-4000-8000-000000001901', 'xb', '{"title": "Designerin"}', '2026-11-20T11:00:00Z'),
  ('00000000-0000-4000-8000-000000001902', 'xa', '{"title": "Writer 50% _off_", "slug": "writer"}', '2026-11-21T10:00:00Z'),
  ('00000000-0000-4000-8000-000000001904', 'xa', '{"title": "Analyst", "slug": "analyst"}', '2026-11-22T10:00:00Z'),
  ('00000000-0000-4000-8000-000000001905', 'xa', '{"title": "Other"}', '2026-11-22T10:00:00Z');
update public.cms_entries set first_published_at = '2026-11-20T10:00:00Z' where id = '00000000-0000-4000-8000-000000001901';
update public.cms_entries set first_published_at = '2026-11-21T10:00:00Z' where id = '00000000-0000-4000-8000-000000001902';
update public.cms_entries set first_published_at = '2026-11-22T10:00:00Z' where id = '00000000-0000-4000-8000-000000001904';

insert into public.cms_page_draft (page_id, locale, content) values
  ('00000000-0000-4000-8000-000000001902', 'xa', '{"title": "Writer 50% _off_ (edited)", "slug": "writer"}'),
  ('00000000-0000-4000-8000-000000001903', 'xa', '{"title": "Draft job"}');

insert into public.cms_page_revisions (page_id, locale, content) values
  ('00000000-0000-4000-8000-000000001901', 'xa', '{"title": "Designer", "slug": "designer"}');

insert into public.cms_entry_slugs (entry_id, locale, type, slug) values
  ('00000000-0000-4000-8000-000000001901', 'xa', 'job', 'designer'),
  ('00000000-0000-4000-8000-000000001902', 'xa', 'job', 'writer'),
  ('00000000-0000-4000-8000-000000001904', 'xa', 'job', 'analyst');

create function pg_temp.act(user_id text)
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- Everything an entry holds, as one comparable text.
create function pg_temp.holdings(entry text)
returns text
language sql
as $$
  select concat_ws(' | ',
    (select string_agg(locale || '=' || content::text, ',' order by locale) from public.cms_page_draft where page_id = entry::uuid),
    (select string_agg(locale || '=' || content::text || '@' || published_at::text, ',' order by locale) from public.cms_page_published where page_id = entry::uuid),
    (select string_agg(locale || '=' || slug, ',' order by locale) from public.cms_entry_slugs where entry_id = entry::uuid),
    (select count(*)::text from public.cms_page_revisions where page_id = entry::uuid)
  )
$$;

create function pg_temp.order_of(entry_type text)
returns text[]
language sql
as $$
  select array_agg(right(id::text, 4) order by sort_order, id)
    from public.cms_entries
    where type = entry_type and archived_at is null
$$;

-- 1. Archive / Unarchive -------------------------------------------------------------------

select set_config('t.before', pg_temp.holdings('00000000-0000-4000-8000-000000001901'), true);

select pg_temp.act('00000000-0000-4000-8000-0000000019e1');
set local role authenticated;

select throws_ok(
  $$ select public.cms_entry_archive('job', '00000000-0000-4000-8000-000000001901') $$,
  '42501', null, 'an editor cannot archive'
);

-- The second editor opens J1 in the editor.
select pg_temp.act('00000000-0000-4000-8000-0000000019e2');
select set_config('t.lock', public.cms_entry_lock_acquire('job', '00000000-0000-4000-8000-000000001901')::text, true);

select pg_temp.act('00000000-0000-4000-8000-0000000019a1');

select throws_ok(
  $$ select public.cms_entry_archive('job', '00000000-0000-4000-8000-000000001901') $$,
  'CMSLK', null, 'an entry open in the editor is not archived'
);

reset role;
-- The editor left long ago: the lock is stale.
update public.cms_page_locks set heartbeat_at = now() - interval '10 minutes' where page_id = '00000000-0000-4000-8000-000000001901';
select pg_temp.act('00000000-0000-4000-8000-0000000019a1');
set local role authenticated;

select lives_ok($$ select public.cms_entry_archive('job', '00000000-0000-4000-8000-000000001901') $$, 'an admin archives once the lock is stale');
select lives_ok($$ select public.cms_entry_archive('job', '00000000-0000-4000-8000-000000001901') $$, 'archiving again changes nothing');
select throws_ok(
  $$ select public.cms_entry_archive('other', '00000000-0000-4000-8000-000000001901') $$,
  'P0002', null, 'archive by the wrong type is not found'
);

reset role;

select is(pg_temp.holdings('00000000-0000-4000-8000-000000001901'), current_setting('t.before'),
  'the archive keeps drafts, publications, addresses and history');
select is(
  (select count(*)::int from public.cms_activity where action = 'archive' and entity_id = '00000000-0000-4000-8000-000000001901'
     and entity_type = 'entry' and entity_label = 'Designer' and details ->> 'type' = 'job'),
  1,
  'one archive event, with the title and the type'
);

set local role anon;
select is(
  (select count(*)::int from public.cms_entries where id = '00000000-0000-4000-8000-000000001901')
    + (select count(*)::int from public.cms_page_published where page_id = '00000000-0000-4000-8000-000000001901')
    + (select count(*)::int from public.cms_entry_slugs where entry_id = '00000000-0000-4000-8000-000000001901'),
  0,
  'an archived entry is not public: no row, no publication, no address'
);
reset role;

select is(pg_temp.order_of('job'), array['1902', '1903', '1904'], 'the archived entry leaves the manual order');

select pg_temp.act('00000000-0000-4000-8000-0000000019a1');
set local role authenticated;

select lives_ok($$ select public.cms_entry_unarchive('job', '00000000-0000-4000-8000-000000001901') $$, 'an admin unarchives');
select lives_ok($$ select public.cms_entry_unarchive('job', '00000000-0000-4000-8000-000000001901') $$, 'unarchiving a live entry changes nothing');

reset role;

select is(pg_temp.holdings('00000000-0000-4000-8000-000000001901'), current_setting('t.before'), 'and everything is back as it was');
select is(pg_temp.order_of('job'), array['1901', '1902', '1903', '1904'], 'an unarchived entry comes back in its place');
select is(
  (select count(*)::int from public.cms_activity where action in ('archive', 'unarchive') and entity_id = '00000000-0000-4000-8000-000000001901'),
  2,
  'one archive and one unarchive event: repeats write nothing'
);

set local role anon;
select is(
  (select count(*)::int from public.cms_entries where id = '00000000-0000-4000-8000-000000001901'),
  1,
  'it is public again'
);
reset role;

-- 2. Manual order ---------------------------------------------------------------------------

select set_config('t.version', public.cms_entry_order_version('job'), true);

select pg_temp.act('00000000-0000-4000-8000-0000000019e1');
set local role authenticated;

select throws_ok(
  format($$ select public.cms_entry_reorder('job', array['00000000-0000-4000-8000-000000001904', '00000000-0000-4000-8000-000000001903', '00000000-0000-4000-8000-000000001902', '00000000-0000-4000-8000-000000001901']::uuid[], %L) $$,
         current_setting('t.version')),
  '42501', null, 'an editor cannot reorder'
);

select pg_temp.act('00000000-0000-4000-8000-0000000019a1');

select throws_ok(
  $$ select public.cms_entry_reorder('job', array['00000000-0000-4000-8000-000000001904', '00000000-0000-4000-8000-000000001903', '00000000-0000-4000-8000-000000001902', '00000000-0000-4000-8000-000000001901']::uuid[], 'stale') $$,
  'CMSCF', null, 'a stale version is refused'
);
select throws_ok(
  format($$ select public.cms_entry_reorder('job', array['00000000-0000-4000-8000-000000001904', '00000000-0000-4000-8000-000000001903', '00000000-0000-4000-8000-000000001902']::uuid[], %L) $$,
         current_setting('t.version')),
  'CMSCF', null, 'a list missing an entry is refused'
);
select throws_ok(
  format($$ select public.cms_entry_reorder('job', array['00000000-0000-4000-8000-000000001904', '00000000-0000-4000-8000-000000001904', '00000000-0000-4000-8000-000000001902', '00000000-0000-4000-8000-000000001901']::uuid[], %L) $$,
         current_setting('t.version')),
  'CMSCF', null, 'a list with a duplicate is refused'
);
select throws_ok(
  format($$ select public.cms_entry_reorder('job', array['00000000-0000-4000-8000-000000001904', '00000000-0000-4000-8000-000000001903', '00000000-0000-4000-8000-000000001902', '00000000-0000-4000-8000-000000001901', '00000000-0000-4000-8000-000000001905']::uuid[], %L) $$,
         current_setting('t.version')),
  'CMSCF', null, 'a list with an entry of another type is refused'
);
select throws_ok(
  format($$ select public.cms_entry_reorder('job', array['00000000-0000-4000-8000-000000001904', '00000000-0000-4000-8000-000000001903', '00000000-0000-4000-8000-000000001902', '00000000-0000-4000-8000-0000000019ff']::uuid[], %L) $$,
         current_setting('t.version')),
  'CMSCF', null, 'a list with an unknown id is refused'
);

reset role;
select is(pg_temp.order_of('job'), array['1901', '1902', '1903', '1904'], 'refused lists change nothing');
select is((select count(*)::int from public.cms_activity where action = 'reorder' and details ->> 'type' = 'job'), 0, 'and write no event');

select pg_temp.act('00000000-0000-4000-8000-0000000019a1');
set local role authenticated;

select set_config('t.new_version', public.cms_entry_reorder('job',
  array['00000000-0000-4000-8000-000000001904', '00000000-0000-4000-8000-000000001903', '00000000-0000-4000-8000-000000001902', '00000000-0000-4000-8000-000000001901']::uuid[],
  current_setting('t.version')), true);

reset role;

select is(pg_temp.order_of('job'), array['1904', '1903', '1902', '1901'], 'the full list is saved');
select is(current_setting('t.new_version'), public.cms_entry_order_version('job'), 'reorder returns the new version');
select isnt(current_setting('t.new_version'), current_setting('t.version'), 'which differs from the old one');
select is(
  (select count(*)::int from public.cms_activity where action = 'reorder' and entity_type = 'entry' and entity_label = 'job'
     and details = '{"type": "job"}'::jsonb and entity_id is null),
  1,
  'one reorder event, with the type and no list of ids'
);
select is(pg_temp.order_of('other'), array['1905'], 'another type is untouched');

-- An entry off the site keeps its place: archived in the middle, then the live
-- ones reordered around it, then unarchived.
update public.cms_entries set archived_at = now() where id = '00000000-0000-4000-8000-000000001903';
select is(
  (select array_agg(right(id::text, 4) order by ordinality) from public.cms_entries_admin_list('job', null, null, 'manual') with ordinality),
  array['1904', '1903', '1902', '1901'],
  'in the list an entry off the site stays between the others'
);
select set_config('t.version_mid', public.cms_entry_order_version('job'), true);
select pg_temp.act('00000000-0000-4000-8000-0000000019a1');
set local role authenticated;
select lives_ok(
  format($$ select public.cms_entry_reorder('job', array['00000000-0000-4000-8000-000000001901', '00000000-0000-4000-8000-000000001902', '00000000-0000-4000-8000-000000001904']::uuid[], %L) $$,
         current_setting('t.version_mid')),
  'the live entries are reordered around the one off the site'
);
reset role;
select is(
  (select array_agg(right(id::text, 4) order by sort_order, id) from public.cms_entries where type = 'job'),
  array['1901', '1903', '1902', '1904'],
  'which keeps its place: the live ones fill the places of the live ones'
);
select is(
  (select array_agg(sort_order order by sort_order, id) from public.cms_entries where type = 'job'),
  array[0, 1, 2, 3],
  'and the whole list is numbered 0…n-1'
);
select pg_temp.act('00000000-0000-4000-8000-0000000019a1');
set local role authenticated;
select lives_ok($$ select public.cms_entry_unarchive('job', '00000000-0000-4000-8000-000000001903') $$, 'unarchive the one in the middle');
reset role;
select is(pg_temp.order_of('job'), array['1901', '1903', '1902', '1904'], 'it comes back where it was, not on top');
-- Back to the order the later tests expect.
update public.cms_entries set sort_order = case id
  when '00000000-0000-4000-8000-000000001904' then 0
  when '00000000-0000-4000-8000-000000001903' then 1
  when '00000000-0000-4000-8000-000000001902' then 2
  else 3 end
  where type = 'job';

-- An archived entry is not part of the order to save.
update public.cms_entries set archived_at = now() where id = '00000000-0000-4000-8000-000000001903';
-- The version is internal: read it as the owner, as the admin list would hand it out.
select set_config('t.version_archived', public.cms_entry_order_version('job'), true);
select pg_temp.act('00000000-0000-4000-8000-0000000019a1');
set local role authenticated;
select throws_ok(
  format($$ select public.cms_entry_reorder('job', array['00000000-0000-4000-8000-000000001904', '00000000-0000-4000-8000-000000001903', '00000000-0000-4000-8000-000000001902', '00000000-0000-4000-8000-000000001901']::uuid[], %L) $$,
         current_setting('t.version_archived')),
  'CMSCF', null, 'a list with an archived entry is refused'
);
reset role;
update public.cms_entries set archived_at = null where id = '00000000-0000-4000-8000-000000001903';

-- Publish brings an entry taken off the site back (the original), a translation
-- does not. An entry of its own, so the rest of the file is untouched.
insert into public.cms_entries (id, type, archived_at) values
  ('00000000-0000-4000-8000-000000001906', 'scratch', now());
insert into public.cms_page_published (page_id, locale, content, published_at) values
  ('00000000-0000-4000-8000-000000001906', 'xa', '{"title": "Scratch"}', '2026-11-20T10:00:00Z');
insert into public.cms_page_draft (page_id, locale, content) values
  ('00000000-0000-4000-8000-000000001906', 'xa', '{"title": "Scratch v2"}'),
  ('00000000-0000-4000-8000-000000001906', 'xb', '{"title": "Scratch DE"}');
select set_config('t.unarchive_events', (select count(*)::text from public.cms_activity where action = 'unarchive' and entity_id = '00000000-0000-4000-8000-000000001906'), true);

select pg_temp.act('00000000-0000-4000-8000-0000000019a1');
set local role authenticated;
select set_config('t.token_off', public.cms_entry_lock_acquire('scratch', '00000000-0000-4000-8000-000000001906')::text, true);
select public.cms_entry_publish('scratch', '00000000-0000-4000-8000-000000001906', 'xb', current_setting('t.token_off')::uuid);
reset role;
select isnt(
  (select archived_at from public.cms_entries where id = '00000000-0000-4000-8000-000000001906'),
  null,
  'publishing a translation leaves the entry off the site'
);

select pg_temp.act('00000000-0000-4000-8000-0000000019a1');
set local role authenticated;
select public.cms_entry_publish('scratch', '00000000-0000-4000-8000-000000001906', 'xa', current_setting('t.token_off')::uuid);
reset role;
select is(
  (select archived_at from public.cms_entries where id = '00000000-0000-4000-8000-000000001906'),
  null,
  'publishing the original brings it back to the site'
);
select is(
  (select count(*)::int from public.cms_activity where action = 'unarchive' and entity_id = '00000000-0000-4000-8000-000000001906')
    - current_setting('t.unarchive_events')::int,
  1,
  'with an unarchive event, as Put back would write'
);
select is(
  (select content ->> 'title' from public.cms_page_published where page_id = '00000000-0000-4000-8000-000000001906' and locale = 'xa'),
  'Scratch v2',
  'and what is published is the draft'
);

-- Taken off the site, with nothing newer: the editor is told, and Publish of the
-- original puts it back as it was; a translation without a draft is refused.
update public.cms_entries set archived_at = now() where id = '00000000-0000-4000-8000-000000001906';
select is(
  (select off_site from public.cms_entry_get_editable('scratch', '00000000-0000-4000-8000-000000001906', null, null)),
  true,
  'the editor is told the entry is off the site'
);

select pg_temp.act('00000000-0000-4000-8000-0000000019a1');
set local role authenticated;
select throws_ok(
  format($$ select public.cms_entry_publish('scratch', '00000000-0000-4000-8000-000000001906', 'xb', %L) $$, current_setting('t.token_off')),
  'P0002', null, 'a translation without a draft is refused'
);
select lives_ok(
  format($$ select public.cms_entry_publish('scratch', '00000000-0000-4000-8000-000000001906', 'xa', %L) $$, current_setting('t.token_off')),
  'Publish without a draft puts an entry off the site back'
);
reset role;
select is(
  (select archived_at from public.cms_entries where id = '00000000-0000-4000-8000-000000001906'),
  null,
  'it is on the site again'
);
select is(
  (select off_site from public.cms_entry_get_editable('scratch', '00000000-0000-4000-8000-000000001906', null, null)),
  false,
  'and no longer off it for the editor'
);
select is(
  (select base_published from public.cms_entry_get_editable('scratch', '00000000-0000-4000-8000-000000001906', 'xb', null)),
  true,
  'a translation is told the original is published (Delete is not offered then)'
);

-- Deleting for good: an entry that is not on the site, from the editor that holds its lock.
insert into public.cms_entries (id, type, archived_at) values
  ('00000000-0000-4000-8000-000000001907', 'scratch', null),
  ('00000000-0000-4000-8000-000000001908', 'scratch', null),
  ('00000000-0000-4000-8000-000000001909', 'scratch', now());
insert into public.cms_page_draft (page_id, locale, content) values
  ('00000000-0000-4000-8000-000000001907', 'xa', '{"title": "Draft only", "slug": "draft-only"}');
insert into public.cms_page_published (page_id, locale, content, published_at) values
  ('00000000-0000-4000-8000-000000001908', 'xa', '{"title": "Live"}', '2026-11-20T10:00:00Z'),
  ('00000000-0000-4000-8000-000000001909', 'xa', '{"title": "Was live"}', '2026-11-20T10:00:00Z');

select pg_temp.act('00000000-0000-4000-8000-0000000019e1');
set local role authenticated;
select set_config('t.editor_token', public.cms_entry_lock_acquire('scratch', '00000000-0000-4000-8000-000000001907')::text, true);
select throws_ok(
  format($$ select public.cms_entry_delete('scratch', '00000000-0000-4000-8000-000000001907', %L) $$, current_setting('t.editor_token')),
  '42501', null, 'an editor cannot delete an entry'
);
select public.cms_entry_lock_release('scratch', '00000000-0000-4000-8000-000000001907', current_setting('t.editor_token')::uuid);

select pg_temp.act('00000000-0000-4000-8000-0000000019a1');
set local role authenticated;
select set_config('t.token_draft', public.cms_entry_lock_acquire('scratch', '00000000-0000-4000-8000-000000001907')::text, true);
select set_config('t.token_live', public.cms_entry_lock_acquire('scratch', '00000000-0000-4000-8000-000000001908')::text, true);
select set_config('t.token_off2', public.cms_entry_lock_acquire('scratch', '00000000-0000-4000-8000-000000001909')::text, true);
select throws_ok(
  $$ select public.cms_entry_delete('scratch', '00000000-0000-4000-8000-000000001907', '00000000-0000-4000-8000-000000000000') $$,
  'CMSLL', null, 'the lock of the editing session is required'
);
select throws_ok(
  format($$ select public.cms_entry_delete('scratch', '00000000-0000-4000-8000-000000001908', %L) $$, current_setting('t.token_live')),
  'CMSEL', null, 'an entry on the site is taken off it first'
);
select lives_ok(
  format($$ select public.cms_entry_delete('scratch', '00000000-0000-4000-8000-000000001907', %L) $$, current_setting('t.token_draft')),
  'a draft is deleted'
);
select lives_ok(
  format($$ select public.cms_entry_delete('scratch', '00000000-0000-4000-8000-000000001909', %L) $$, current_setting('t.token_off2')),
  'so is an entry taken off the site, with its publication'
);
reset role;

select is(
  (select count(*)::int from public.cms_entries where id in ('00000000-0000-4000-8000-000000001907', '00000000-0000-4000-8000-000000001909'))
    + (select count(*)::int from public.cms_documents where id in ('00000000-0000-4000-8000-000000001907', '00000000-0000-4000-8000-000000001909'))
    + (select count(*)::int from public.cms_page_draft where page_id = '00000000-0000-4000-8000-000000001907')
    + (select count(*)::int from public.cms_page_published where page_id = '00000000-0000-4000-8000-000000001909')
    + (select count(*)::int from public.cms_page_locks where page_id in ('00000000-0000-4000-8000-000000001907', '00000000-0000-4000-8000-000000001909')),
  0,
  'the entry, its document, drafts, publications and lock are gone'
);
select is(
  (select count(*)::int from public.cms_entries where id = '00000000-0000-4000-8000-000000001908'),
  1,
  'and the one that was on the site is still there'
);
select is(
  (select count(*)::int from public.cms_activity where action = 'delete' and entity_type = 'entry'
     and entity_id = '00000000-0000-4000-8000-000000001907' and entity_label = 'Draft only'),
  1,
  'the event in Activity keeps the title'
);

-- Taking an entry off the site from the editor that holds its lock.
insert into public.cms_entries (id, type) values ('00000000-0000-4000-8000-000000001910', 'scratch');
insert into public.cms_page_published (page_id, locale, content, published_at) values
  ('00000000-0000-4000-8000-000000001910', 'xa', '{"title": "Taken off from the editor"}', '2026-11-20T10:00:00Z');

select pg_temp.act('00000000-0000-4000-8000-0000000019e1');
set local role authenticated;
select set_config('t.token_editor2', public.cms_entry_lock_acquire('scratch', '00000000-0000-4000-8000-000000001910')::text, true);
select throws_ok(
  format($$ select public.cms_entry_take_off('scratch', '00000000-0000-4000-8000-000000001910', %L) $$, current_setting('t.token_editor2')),
  '42501', null, 'an editor cannot take an entry off the site'
);
select public.cms_entry_lock_release('scratch', '00000000-0000-4000-8000-000000001910', current_setting('t.token_editor2')::uuid);

select pg_temp.act('00000000-0000-4000-8000-0000000019a1');
set local role authenticated;
select set_config('t.token_take', public.cms_entry_lock_acquire('scratch', '00000000-0000-4000-8000-000000001910')::text, true);
select throws_ok(
  $$ select public.cms_entry_archive('scratch', '00000000-0000-4000-8000-000000001910') $$,
  'CMSLK', null, 'archive is refused while the entry is open in the editor'
);
select throws_ok(
  $$ select public.cms_entry_take_off('scratch', '00000000-0000-4000-8000-000000001910', '00000000-0000-4000-8000-000000000000') $$,
  'CMSLL', null, 'taking off needs the lock of the editing session'
);
select lives_ok(
  format($$ select public.cms_entry_take_off('scratch', '00000000-0000-4000-8000-000000001910', %L) $$, current_setting('t.token_take')),
  'the editor that holds the lock takes the entry off the site'
);
reset role;
select isnt(
  (select archived_at from public.cms_entries where id = '00000000-0000-4000-8000-000000001910'),
  null,
  'it is off the site'
);
select is(
  (select count(*)::int from public.cms_activity where action = 'archive' and entity_id = '00000000-0000-4000-8000-000000001910'),
  1,
  'with the event archive writes'
);

-- Put back from the list while the entry is still open in the editor: refused,
-- like archive (an entry being edited or deleted does not go back on the site).
select pg_temp.act('00000000-0000-4000-8000-0000000019a1');
set local role authenticated;
select throws_ok(
  $$ select public.cms_entry_unarchive('scratch', '00000000-0000-4000-8000-000000001910') $$,
  'CMSLK', null, 'unarchive is refused while the entry is open in the editor'
);
select public.cms_entry_lock_release('scratch', '00000000-0000-4000-8000-000000001910', current_setting('t.token_take')::uuid);
select lives_ok(
  $$ select public.cms_entry_unarchive('scratch', '00000000-0000-4000-8000-000000001910') $$,
  'and allowed once the editor is closed'
);
reset role;
select is(
  (select archived_at from public.cms_entries where id = '00000000-0000-4000-8000-000000001910'),
  null,
  'it is on the site again'
);

-- 3. Admin list -----------------------------------------------------------------------------

select set_config('t.version_now', public.cms_entry_order_version('job'), true);
select pg_temp.act('00000000-0000-4000-8000-0000000019e1');
set local role authenticated;

-- Updated: the last save or publication, not when the row was created (the
-- fixtures were inserted now and published days ago).
select is(
  (select updated_at from public.cms_entries_admin_list('job', null, false, 'manual') where id = '00000000-0000-4000-8000-000000001904'),
  '2026-11-22T10:00:00Z'::timestamptz,
  'updated is the last publication or save, not the creation of the row'
);

select results_eq(
  $$ select right(id::text, 4), title, slug, status from public.cms_entries_admin_list('job', null, false, 'manual') $$,
  $$ values
       ('1904'::text, 'Analyst'::text, 'analyst'::text, 'published'::text),
       ('1903', 'Draft job', null, 'draft'),
       ('1902', 'Writer 50% _off_ (edited)', 'writer', 'changed'),
       ('1901', 'Designer', 'designer', 'published') $$,
  'manual order, the draft title over the published one, and the four statuses'
);

select is(
  (select array_agg(distinct total) from public.cms_entries_admin_list('job', null, false, 'manual', 2, 0)),
  array[4::bigint],
  'total counts every match, not the page'
);
select results_eq(
  $$ select right(id::text, 4) from public.cms_entries_admin_list('job', null, false, 'manual', 2, 2) $$,
  $$ values ('1902'::text), ('1901') $$,
  'paging'
);
select results_eq(
  $$ select right(id::text, 4) from public.cms_entries_admin_list('job', null, false, 'newest') $$,
  $$ values ('1903'::text), ('1904'), ('1902'), ('1901') $$,
  'newest first, never published on top'
);
select results_eq(
  $$ select right(id::text, 4) from public.cms_entries_admin_list('job', null, false, 'title') $$,
  $$ values ('1904'::text), ('1901'), ('1903'), ('1902') $$,
  'by title'
);
select results_eq(
  $$ select right(id::text, 4) from public.cms_entries_admin_list('job', 'DESIGN', false, 'manual') $$,
  $$ values ('1901'::text) $$,
  'search ignores case'
);
select results_eq(
  $$ select right(id::text, 4) from public.cms_entries_admin_list('job', '50%', false, 'manual') $$,
  $$ values ('1902'::text) $$,
  'search takes % literally'
);
select is_empty(
  $$ select 1 from public.cms_entries_admin_list('job', 'r_ter', false, 'manual') $$,
  'search takes _ literally'
);
select is(
  (select order_version from public.cms_entries_admin_list('job', null, false, 'manual') limit 1),
  current_setting('t.version_now'),
  'the list carries the order version for the next reorder'
);
select throws_ok(
  $$ select * from public.cms_entries_admin_list('job', null, false, 'random') $$,
  '23514', null, 'an unknown sort is refused'
);

reset role;
update public.cms_entries set archived_at = now() where id = '00000000-0000-4000-8000-000000001904';
select pg_temp.act('00000000-0000-4000-8000-0000000019e1');
set local role authenticated;

select results_eq(
  $$ select right(id::text, 4), status from public.cms_entries_admin_list('job', null, true, 'manual') $$,
  $$ values ('1904'::text, 'archived'::text) $$,
  'the archive filter lists archived entries only'
);
select is(
  (select count(*)::int from public.cms_entries_admin_list('job', null, false, 'manual')),
  3,
  'the default list leaves them out'
);
select results_eq(
  $$ select right(id::text, 4), status from public.cms_entries_admin_list('job', null, null, 'manual') $$,
  $$ select right(id::text, 4), case when archived_at is not null then 'archived' when id = '00000000-0000-4000-8000-000000001903' then 'draft' when id = '00000000-0000-4000-8000-000000001902' then 'changed' else 'published' end
       from public.cms_entries where type = 'job' order by sort_order, id $$,
  'all: in the order of the site, the entry off the site in its place'
);
select results_eq(
  $$ select right(id::text, 4) from public.cms_entries_admin_list('job', null, null, 'manual', 50, 0, null, array['archived']) $$,
  $$ values ('1904'::text) $$,
  'filtered by status'
);
select is(
  (select count(*)::int from public.cms_entries_admin_list('job', null, null, 'manual', 50, 0, null, array['published']))
    + (select count(*)::int from public.cms_entries_admin_list('job', null, null, 'manual', 50, 0, null, array['draft']))
    + (select count(*)::int from public.cms_entries_admin_list('job', null, null, 'manual', 50, 0, null, array['changed']))
    + (select count(*)::int from public.cms_entries_admin_list('job', null, null, 'manual', 50, 0, null, array['archived'])),
  (select count(*)::int from public.cms_entries_admin_list('job', null, null, 'manual')),
  'every entry has exactly one status'
);
select is(
  (select count(*)::int from public.cms_entries_admin_list('job', null, null, 'manual', 50, 0, null, array['archived', 'draft'])),
  (select count(*)::int from public.cms_entries_admin_list('job', null, null, 'manual', 50, 0, null, array['archived']))
    + (select count(*)::int from public.cms_entries_admin_list('job', null, null, 'manual', 50, 0, null, array['draft'])),
  'several statuses: the entries of any of them'
);
select is(
  (select count(*)::int from public.cms_entries_admin_list('job', null, null, 'manual', 50, 0, null, array[]::text[])),
  (select count(*)::int from public.cms_entries_admin_list('job', null, null, 'manual')),
  'no status chosen: every entry'
);
select throws_ok(
  $$ select * from public.cms_entries_admin_list('job', null, null, 'manual', 50, 0, null, array['hidden']) $$,
  '23514', null, 'an unknown status is refused'
);

select results_eq(
  $$ select right(id::text, 4), type, title, archived, published_locales
       from public.cms_entries_status(array['00000000-0000-4000-8000-000000001901', '00000000-0000-4000-8000-000000001903',
                                            '00000000-0000-4000-8000-000000001904', '00000000-0000-4000-8000-0000000019ff']::uuid[])
       order by 1 $$,
  $$ values
       ('1901'::text, 'job'::text, 'Designer'::text, false, array['xa', 'xb']),
       ('1903', 'job', 'Draft job', false, '{}'::text[]),
       ('1904', 'job', 'Analyst', true, array['xa']) $$,
  'status of chosen entries: published languages, archive, missing ones left out'
);

select pg_temp.act('00000000-0000-4000-8000-0000000019c1');

select throws_ok(
  $$ select * from public.cms_entries_admin_list('job') $$,
  '42501', null, 'a site user cannot list entries for the admin'
);
select throws_ok(
  $$ select * from public.cms_entries_status(array['00000000-0000-4000-8000-000000001901']::uuid[]) $$,
  '42501', null, 'nor read their status'
);

reset role;

select ok(
  not has_function_privilege('anon', 'public.cms_entries_admin_list(text, text, boolean, text, integer, integer, text, text[])', 'execute')
    and not has_function_privilege('anon', 'public.cms_entry_reorder(text, uuid[], text)', 'execute')
    and not has_function_privilege('anon', 'public.cms_entry_archive(text, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.cms_entry_order_version(text)', 'execute')
    and not has_function_privilege('authenticated', 'public.cms_media_references(uuid[])', 'execute'),
  'anon calls none of them; internals for nobody'
);

-- 4. Media in use ----------------------------------------------------------------------------

insert into public.cms_media (id, storage_path, display_name, mime, size) values
  ('00000000-0000-4000-8000-0000000019d1', '00000000-0000-4000-8000-0000000019d1.jpg', 'entry-draft.jpg', 'image/jpeg', 1),
  ('00000000-0000-4000-8000-0000000019d2', '00000000-0000-4000-8000-0000000019d2.jpg', 'entry-published.jpg', 'image/jpeg', 1),
  ('00000000-0000-4000-8000-0000000019d3', '00000000-0000-4000-8000-0000000019d3.jpg', 'archived-entry.jpg', 'image/jpeg', 1),
  ('00000000-0000-4000-8000-0000000019d4', '00000000-0000-4000-8000-0000000019d4.jpg', 'page.jpg', 'image/jpeg', 1),
  ('00000000-0000-4000-8000-0000000019d5', '00000000-0000-4000-8000-0000000019d5.jpg', 'unused.jpg', 'image/jpeg', 1);

-- d1 only in a draft of an entry, d2 only in a publication of a translation,
-- d3 only in an archived entry, d4 only on a page.
update public.cms_page_draft set content = content || '{"logo": {"mediaId": "00000000-0000-4000-8000-0000000019d1"}}'
  where page_id = '00000000-0000-4000-8000-000000001903';
update public.cms_page_published set content = content || '{"logo.alt": "x", "photo": {"mediaId": "00000000-0000-4000-8000-0000000019d2"}}'
  where page_id = '00000000-0000-4000-8000-000000001901' and locale = 'xb';
update public.cms_page_published set content = content || '{"logo": {"mediaId": "00000000-0000-4000-8000-0000000019d3"}}'
  where page_id = '00000000-0000-4000-8000-000000001904' and locale = 'xa';
insert into public.cms_pages (id, key) values ('00000000-0000-4000-8000-0000000019b0', 'manage-media-page');
insert into public.cms_page_published (page_id, locale, content) values
  ('00000000-0000-4000-8000-0000000019b0', 'xa', '{"hero": {"image": {"mediaId": "00000000-0000-4000-8000-0000000019d4"}}}');

select pg_temp.act('00000000-0000-4000-8000-0000000019a1');
set local role authenticated;

select results_eq(
  $$ select right(media_id::text, 4), source, page_key, locale, is_draft, right(entry_id::text, 4), entry_type, entry_title
       from public.cms_media_usage(array['00000000-0000-4000-8000-0000000019d1', '00000000-0000-4000-8000-0000000019d2',
                                         '00000000-0000-4000-8000-0000000019d3', '00000000-0000-4000-8000-0000000019d4']::uuid[]) $$,
  $$ values
       ('19d1'::text, 'entry'::text, null::text, 'xa'::text, true, '1903'::text, 'job'::text, 'Draft job'::text),
       ('19d2', 'entry', null, 'xb', false, '1901', 'job', 'Designer'),
       ('19d3', 'entry', null, 'xa', false, '1904', 'job', 'Analyst'),
       ('19d4', 'page', 'manage-media-page', 'xa', false, null, null, null) $$,
  'usage lists entries (draft, translation, archived) with type and title, and pages as before'
);

select throws_ok($$ select public.cms_media_delete('00000000-0000-4000-8000-0000000019d1') $$, 'CMSMU', null,
  'media used only in an entry draft cannot be deleted');
select throws_ok($$ select public.cms_media_delete('00000000-0000-4000-8000-0000000019d2') $$, 'CMSMU', null,
  'media used only in a published translation of an entry cannot be deleted');
select throws_ok($$ select public.cms_media_delete('00000000-0000-4000-8000-0000000019d3') $$, 'CMSMU', null,
  'media used only by an archived entry cannot be deleted');
select throws_ok($$ select public.cms_media_delete('00000000-0000-4000-8000-0000000019d4') $$, 'CMSMU', null,
  'media used only on a page cannot be deleted');
select lives_ok($$ select public.cms_media_delete('00000000-0000-4000-8000-0000000019d5') $$, 'unused media is deleted');

reset role;

select is(
  (select count(*)::int from public.cms_media
     where id in ('00000000-0000-4000-8000-0000000019d1', '00000000-0000-4000-8000-0000000019d2',
                  '00000000-0000-4000-8000-0000000019d3', '00000000-0000-4000-8000-0000000019d4')
       and deleted_at is null),
  4,
  'refused deletes leave the media live'
);

-- Once the entry no longer uses it, it can go.
update public.cms_page_draft set content = content - 'logo' where page_id = '00000000-0000-4000-8000-000000001903';
select pg_temp.act('00000000-0000-4000-8000-0000000019a1');
set local role authenticated;
select lives_ok($$ select public.cms_media_delete('00000000-0000-4000-8000-0000000019d1') $$, 'media no longer used is deleted');

-- Deleting the entry frees its media.
reset role;
delete from public.cms_entries where id = '00000000-0000-4000-8000-000000001904';
select pg_temp.act('00000000-0000-4000-8000-0000000019a1');
set local role authenticated;
select lives_ok($$ select public.cms_media_delete('00000000-0000-4000-8000-0000000019d3') $$, 'media of a deleted entry is free');

reset role;

select is(
  (select count(*)::int from public.cms_activity where action = 'delete' and entity_type = 'media'
     and entity_id in ('00000000-0000-4000-8000-0000000019d1', '00000000-0000-4000-8000-0000000019d2',
                       '00000000-0000-4000-8000-0000000019d3', '00000000-0000-4000-8000-0000000019d4',
                       '00000000-0000-4000-8000-0000000019d5')),
  3,
  'only the deletes that happened are in Activity'
);

select * from finish();

rollback;
