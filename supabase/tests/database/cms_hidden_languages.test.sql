-- Who reads a disabled language (C-83): `npm run test:db`.
-- The public — anon and a signed-in site user without CMS access, which is the
-- same `authenticated` role — sees active languages only; CMS users see every
-- language, because the editor translates a hidden one. Self-contained: own
-- users and page, one transaction, rolled back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

-- Fixture, written as the migration owner -------------------------------------

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-00000000d1a1', 'owner-hidden@example.test'),
  ('00000000-0000-4000-8000-00000000d1e1', 'editor-hidden@example.test'),
  ('00000000-0000-4000-8000-00000000d1d1', 'disabled-hidden@example.test'),
  ('00000000-0000-4000-8000-00000000d1c1', 'customer-hidden@example.test');

insert into public.cms_users (user_id, role, status)
values
  ('00000000-0000-4000-8000-00000000d1a1', 'owner', 'active'),
  ('00000000-0000-4000-8000-00000000d1e1', 'editor', 'active'),
  ('00000000-0000-4000-8000-00000000d1d1', 'owner', 'disabled');

-- A known language set: `xa` is the original, `xb` is live, `xc` is hidden.
delete from public.cms_site_settings_translations;
delete from public.cms_site_texts;
delete from public.cms_languages;

insert into public.cms_languages (code, name, native_name, is_default, active, sort_order)
values
  ('xa', 'Original', 'Original', true, true, 0),
  ('xb', 'Live', 'Live', false, true, 1),
  ('xc', 'Hidden', 'Hidden', false, false, 2);

insert into public.cms_pages (id, key) values ('00000000-0000-4000-8000-00000000d100', 'hidden-fixture');

insert into public.cms_page_published (page_id, locale, content)
values
  ('00000000-0000-4000-8000-00000000d100', 'xa', '{"title": "Original"}'),
  ('00000000-0000-4000-8000-00000000d100', 'xb', '{"title": "Live"}'),
  ('00000000-0000-4000-8000-00000000d100', 'xc', '{"title": "Secret"}');

insert into public.cms_site_settings_translations (locale, site_name)
values ('xb', 'Live name'), ('xc', 'Secret name');

create function pg_temp.sign_in(user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
end;
$$;

create function pg_temp.published_locales()
returns text
language sql
as $$
  select string_agg(locale::text, ',' order by locale::text)
    from public.cms_page_published
    where page_id = '00000000-0000-4000-8000-00000000d100';
$$;

create function pg_temp.site_name_locales()
returns text
language sql
as $$
  select coalesce(string_agg(locale::text, ',' order by locale::text), '')
    from public.cms_site_settings_translations;
$$;

-- anon ------------------------------------------------------------------------

set local role anon;

select is(pg_temp.published_locales(), 'xa,xb', 'anon reads published content of active languages only');
select is(pg_temp.site_name_locales(), 'xb', 'anon reads the site name of active languages only');

reset role;

-- A signed-in site user without CMS access is the public ---------------------

set local role authenticated;

select pg_temp.sign_in('00000000-0000-4000-8000-00000000d1c1');
select is(pg_temp.published_locales(), 'xa,xb', 'a site user without CMS access does not read a hidden language');
select is(pg_temp.site_name_locales(), 'xb', 'a site user without CMS access does not read the site name of a hidden language');
select is(
  (select published from public.cms_page_get_editable('hidden-fixture', 'xc', null)),
  null::jsonb,
  'a site user without CMS access gets nothing of a hidden language from the editable read'
);
select is(
  (select published ->> 'title' from public.cms_page_get_editable('hidden-fixture', 'xb', null)),
  'Live',
  'a site user still reads a live language as the public does'
);

select pg_temp.sign_in('00000000-0000-4000-8000-00000000d1d1');
select is(pg_temp.published_locales(), 'xa,xb', 'a disabled CMS user does not read a hidden language');
select is(pg_temp.site_name_locales(), 'xb', 'a disabled CMS user does not read the site name of a hidden language');

-- CMS users work on a hidden language -----------------------------------------

select pg_temp.sign_in('00000000-0000-4000-8000-00000000d1e1');
select is(pg_temp.published_locales(), 'xa,xb,xc', 'an editor reads a hidden language');
select is(pg_temp.site_name_locales(), 'xb,xc', 'an editor reads the site name of a hidden language');
select is(
  (select published ->> 'title' from public.cms_page_get_editable('hidden-fixture', 'xc', null)),
  'Secret',
  'Edit Mode of a hidden language still loads its published translation'
);

select pg_temp.sign_in('00000000-0000-4000-8000-00000000d1a1');
select is(pg_temp.published_locales(), 'xa,xb,xc', 'the owner reads a hidden language');
select is(pg_temp.site_name_locales(), 'xb,xc', 'the owner reads the site name of a hidden language');

-- The public read never serves a hidden language, whoever asks -----------------

select pg_temp.sign_in('00000000-0000-4000-8000-00000000d1c1');
select is(
  (select translation from public.cms_page_get_localized('hidden-fixture', 'xc', null)),
  null::jsonb,
  'the localized read gives a site user no translation of a hidden language'
);

reset role;

-- Bootstrap: no languages yet, every locale is served ------------------------

delete from public.cms_site_settings_translations;
delete from public.cms_languages;

set local role authenticated;
select pg_temp.sign_in('00000000-0000-4000-8000-00000000d1c1');
select is(pg_temp.published_locales(), 'xa,xb,xc', 'without languages a site user reads every locale, like anon');

reset role;
set local role anon;
select is(pg_temp.published_locales(), 'xa,xb,xc', 'without languages anon reads every locale');

reset role;

select * from finish();

rollback;
