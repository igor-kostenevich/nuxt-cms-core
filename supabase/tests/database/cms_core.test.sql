-- Smoke test for the Core migrations: `npm run test:db` (supabase test db).
-- Runs against the local database in one transaction and rolls back, so it
-- neither needs nor changes seed data.

begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

-- Every Core table is protected by RLS. A future cms_ table without it fails here.
select is_empty(
  $$
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname like 'cms\_%'
      and not c.relrowsecurity
  $$,
  'every public.cms_ table has row level security enabled'
);

-- Fixture, written as the migration owner.
insert into public.cms_pages (id, key)
values ('00000000-0000-4000-8000-000000000005', 'smoke-fixture');

insert into public.cms_page_published (page_id, locale, content)
values ('00000000-0000-4000-8000-000000000005', 'en', '{"title": "Smoke"}');

-- Check constraints.
select throws_ok(
  $$ insert into public.cms_pages (key) values ('Not A Key') $$,
  '23514',
  null,
  'page key must be lowercase kebab-case'
);

select throws_ok(
  $$
    insert into public.cms_page_published (page_id, locale)
    values ('00000000-0000-4000-8000-000000000005', 'English')
  $$,
  '23514',
  null,
  'locale must look like a BCP 47 tag'
);

select throws_ok(
  $$
    insert into public.cms_page_published (page_id, locale)
    values ('00000000-0000-4000-8000-000000000005', 'en-gb')
  $$,
  '23514',
  null,
  'locale must use canonical casing (en-GB, not en-gb)'
);

select throws_ok(
  $$
    insert into public.cms_page_published (page_id, locale, content)
    values ('00000000-0000-4000-8000-000000000005', 'uk', '[]')
  $$,
  '23514',
  null,
  'page content must be a JSON object'
);

-- anon: reads published content, writes nothing.
set local role anon;

select results_eq(
  $$
    select p.key, pp.content ->> 'title'
    from public.cms_page_published pp
    join public.cms_pages p on p.id = pp.page_id
    where p.key = 'smoke-fixture' and pp.locale = 'en'
  $$,
  $$ values ('smoke-fixture', 'Smoke') $$,
  'anon reads published page content'
);

select throws_ok(
  $$ insert into public.cms_pages (key) values ('anon-page') $$,
  '42501',
  null,
  'anon cannot insert pages'
);

select throws_ok(
  $$
    insert into public.cms_page_published (page_id, locale)
    values ('00000000-0000-4000-8000-000000000005', 'uk')
  $$,
  '42501',
  null,
  'anon cannot insert published content'
);

select throws_ok(
  $$ update public.cms_pages set key = 'renamed' where key = 'smoke-fixture' $$,
  '42501',
  null,
  'anon cannot update pages'
);

select throws_ok(
  $$ delete from public.cms_page_published $$,
  '42501',
  null,
  'anon cannot delete published content'
);

select throws_ok(
  $$ insert into public.cms_site_settings (id) values (2) $$,
  '42501',
  null,
  'anon cannot insert site settings'
);

reset role;

-- authenticated: a signed-in CMS user still writes pages only through
-- functions that arrive with Draft / Publish (007).
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}',
  true
);

select throws_ok(
  $$ insert into public.cms_pages (key) values ('signed-in-page') $$,
  '42501',
  null,
  'authenticated cannot insert pages'
);

select throws_ok(
  $$
    insert into public.cms_page_published (page_id, locale)
    values ('00000000-0000-4000-8000-000000000005', 'uk')
  $$,
  '42501',
  null,
  'authenticated cannot insert published content'
);

select throws_ok(
  $$ update public.cms_page_published set content = '{}' $$,
  '42501',
  null,
  'authenticated cannot update published content'
);

select throws_ok(
  $$ delete from public.cms_pages $$,
  '42501',
  null,
  'authenticated cannot delete pages'
);

reset role;

select * from finish();

rollback;
