-- Visibility of entries (014, stage 2a): `npm run test:db`. One transaction, rolled back.
--
-- Roles: anon, a signed-in site user without CMS access (the public too),
-- an editor and an admin. Documents: a page, a published entry, an archived
-- one, a draft-only one and one published only in a hidden language.
-- Checked through direct SELECT (what PostgREST exposes) and the invoker RPC;
-- policies of cms_entries and cms_page_published refer to each other only
-- through security definer helpers, so no query recurses.

begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-0000000015a1', 'admin-014-rls@example.test'),
  ('00000000-0000-4000-8000-0000000015e1', 'editor-014-rls@example.test'),
  ('00000000-0000-4000-8000-0000000015c1', 'customer-014-rls@example.test');

insert into public.cms_users (user_id, role, status)
values
  ('00000000-0000-4000-8000-0000000015a1', 'admin', 'active'),
  ('00000000-0000-4000-8000-0000000015e1', 'editor', 'active');

delete from public.cms_site_settings_translations;
delete from public.cms_site_texts;
delete from public.cms_languages;

insert into public.cms_languages (code, name, native_name, is_default, active, sort_order)
values
  ('xa', 'Original', 'Original', true, true, 0),
  ('xb', 'Live', 'Live', false, true, 1),
  ('xc', 'Hidden', 'Hidden', false, false, 2);

-- 1500 page · 1501 published · 1502 archived · 1503 draft only · 1504 hidden language only
insert into public.cms_pages (id, key) values ('00000000-0000-4000-8000-000000001500', 'rls-page-fixture');
insert into public.cms_entries (id, type) values
  ('00000000-0000-4000-8000-000000001501', 'job'),
  ('00000000-0000-4000-8000-000000001502', 'job'),
  ('00000000-0000-4000-8000-000000001503', 'job'),
  ('00000000-0000-4000-8000-000000001504', 'job');
update public.cms_entries set archived_at = now() where id = '00000000-0000-4000-8000-000000001502';

insert into public.cms_page_published (page_id, locale, content) values
  ('00000000-0000-4000-8000-000000001500', 'xa', '{"title": "Page"}'),
  ('00000000-0000-4000-8000-000000001501', 'xa', '{"title": "Live"}'),
  ('00000000-0000-4000-8000-000000001501', 'xb', '{"title": "Live xb"}'),
  ('00000000-0000-4000-8000-000000001501', 'xc', '{"title": "Live xc"}'),
  ('00000000-0000-4000-8000-000000001502', 'xa', '{"title": "Archived"}'),
  ('00000000-0000-4000-8000-000000001504', 'xc', '{"title": "Hidden only"}');

insert into public.cms_page_draft (page_id, locale, content) values
  ('00000000-0000-4000-8000-000000001501', 'xa', '{"title": "Live, edited"}'),
  ('00000000-0000-4000-8000-000000001503', 'xa', '{"title": "Draft only"}');

insert into public.cms_page_revisions (page_id, locale, content) values
  ('00000000-0000-4000-8000-000000001501', 'xa', '{"title": "Live"}');

create function pg_temp.act(user_id text)
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- Fixture rows a role sees, as `id-suffix:locale` (published) or `id-suffix` (entries).
create function pg_temp.published_seen()
returns text[]
language sql
as $$
  select coalesce(array_agg(right(page_id::text, 4) || ':' || locale order by page_id, locale), '{}')
    from public.cms_page_published
    where page_id::text like '00000000-0000-4000-8000-0000000015%'
$$;

create function pg_temp.entries_seen()
returns text[]
language sql
as $$
  select coalesce(array_agg(right(id::text, 4) order by id), '{}')
    from public.cms_entries
    where id::text like '00000000-0000-4000-8000-0000000015%'
$$;

grant execute on function pg_temp.published_seen() to anon, authenticated;
grant execute on function pg_temp.entries_seen() to anon, authenticated;

-- anon ------------------------------------------------------------------------------

set local role anon;

select is(pg_temp.entries_seen(), array['1501'], 'anon sees only the published, live entry');
select is(
  pg_temp.published_seen(),
  array['1500:xa', '1501:xa', '1501:xb'],
  'anon sees published content of the page and the live entry in active languages only'
);
select throws_ok($$ select * from public.cms_page_draft $$, '42501', null, 'anon cannot read drafts');
select throws_ok($$ select * from public.cms_page_revisions $$, '42501', null, 'anon cannot read revisions');
select throws_ok($$ select * from public.cms_documents $$, '42501', null, 'anon cannot read documents');
select throws_ok($$ select created_by from public.cms_entries $$, '42501', null, 'anon cannot read who created an entry');
select lives_ok(
  $$ select e.id, pub.locale from public.cms_entries e join public.cms_page_published pub on pub.page_id = e.id $$,
  'anon: entries joined to publications do not recurse'
);
select throws_ok(
  $$ select * from public.cms_entry_get_editable('job', '00000000-0000-4000-8000-000000001501', null, null) $$,
  '42501', null,
  'anon cannot call the editing read'
);

reset role;

-- A signed-in site user without CMS access is the public ------------------------------

select pg_temp.act('00000000-0000-4000-8000-0000000015c1');
set local role authenticated;

select is(pg_temp.entries_seen(), array['1501'], 'a site user sees only the live entry');
select is(
  pg_temp.published_seen(),
  array['1500:xa', '1501:xa', '1501:xb'],
  'a site user sees the same publications as anon'
);
select is(
  (select count(*)::int from public.cms_page_draft where page_id::text like '00000000-0000-4000-8000-0000000015%'),
  0,
  'a site user sees no draft'
);
select is(
  (select count(*)::int from public.cms_page_revisions where page_id::text like '00000000-0000-4000-8000-0000000015%'),
  0,
  'a site user sees no revision'
);
select is(
  (select count(*)::int from public.cms_documents where id::text like '00000000-0000-4000-8000-0000000015%'),
  0,
  'a site user sees no document'
);
select throws_ok(
  $$ select * from public.cms_entry_get_editable('job', '00000000-0000-4000-8000-000000001503', null, null) $$,
  'P0002', null,
  'through the editing read, a draft-only entry does not exist for a site user'
);
select is(
  (select coalesce(draft::text, 'none') || ' / ' || (published ->> 'title')
     from public.cms_entry_get_editable('job', '00000000-0000-4000-8000-000000001501', null, null)),
  'none / Live',
  'through the editing read, a site user gets the publication and no draft'
);
select throws_ok(
  $$ select * from public.cms_entry_get_editable('job', '00000000-0000-4000-8000-000000001502', null, null) $$,
  'P0002', null,
  'through the editing read, an archived entry does not exist for a site user'
);
select lives_ok(
  $$ select e.id, pub.locale from public.cms_entries e join public.cms_page_published pub on pub.page_id = e.id $$,
  'site user: entries joined to publications do not recurse'
);

reset role;

-- Editor and admin: everything, for editing --------------------------------------------

select pg_temp.act('00000000-0000-4000-8000-0000000015e1');
set local role authenticated;

select is(pg_temp.entries_seen(), array['1501', '1502', '1503', '1504'], 'an editor sees every entry');
select is(
  pg_temp.published_seen(),
  array['1500:xa', '1501:xa', '1501:xb', '1501:xc', '1502:xa', '1504:xc'],
  'an editor sees every publication, archived and hidden ones included'
);
select is(
  (select count(*)::int from public.cms_page_draft where page_id::text like '00000000-0000-4000-8000-0000000015%'),
  2,
  'an editor sees the drafts'
);
select is(
  (select draft ->> 'title' from public.cms_entry_get_editable('job', '00000000-0000-4000-8000-000000001503', null, null)),
  'Draft only',
  'an editor reads a draft-only entry'
);
select lives_ok(
  $$ select e.id, pub.locale from public.cms_entries e join public.cms_page_published pub on pub.page_id = e.id $$,
  'editor: entries joined to publications do not recurse'
);

reset role;

select pg_temp.act('00000000-0000-4000-8000-0000000015a1');
set local role authenticated;

select is(pg_temp.entries_seen(), array['1501', '1502', '1503', '1504'], 'an admin sees every entry');
select is(
  (select count(*)::int from public.cms_documents where id::text like '00000000-0000-4000-8000-0000000015%'),
  5,
  'an admin sees the documents (for the admin joins)'
);

reset role;

-- The archive and the publication decide, as they change ------------------------------

update public.cms_entries set archived_at = now() where id = '00000000-0000-4000-8000-000000001501';
set local role anon;
select is(pg_temp.entries_seen(), '{}'::text[], 'archiving hides the entry from anon');
select is(pg_temp.published_seen(), array['1500:xa'], 'and its publications too');
reset role;

update public.cms_entries set archived_at = null where id = '00000000-0000-4000-8000-000000001501';
update public.cms_languages set active = true where code = 'xc';
set local role anon;
select is(pg_temp.entries_seen(), array['1501', '1504'], 'enabling the language shows the entry published only in it');
reset role;

update public.cms_languages set active = false where code = 'xc';
delete from public.cms_page_published where page_id = '00000000-0000-4000-8000-000000001501';
set local role anon;
select is(pg_temp.entries_seen(), '{}'::text[], 'an entry without publications is not public');
reset role;

-- The page is unaffected by entries.
set local role anon;
select is(pg_temp.published_seen(), array['1500:xa'], 'the page stays public throughout');
reset role;

select ok(
  (select bool_and(not has_table_privilege(role_name, 'public.cms_page_published', privilege))
     from unnest(array['anon', 'authenticated']) role_name,
          unnest(array['insert', 'update', 'delete']) privilege),
  'clients have no direct writes to publications'
);

select * from finish();

rollback;
