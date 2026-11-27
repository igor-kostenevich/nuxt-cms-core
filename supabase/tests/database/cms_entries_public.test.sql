-- Public reads of entries (014, stage 3): `npm run test:db`. One transaction, rolled back.
--
-- The site reads an entry by its address and lists of a type. Every check runs
-- as anon, as a site user without CMS access and as a signed-in editor: the
-- editor gets exactly what the public gets (no draft, no archive, no hidden
-- language), although RLS would let them see more.

begin;

create extension if not exists pgtap with schema extensions;

select plan(40);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-0000000021e1', 'editor-014-public@example.test'),
  ('00000000-0000-4000-8000-0000000021c1', 'customer-014-public@example.test');

insert into public.cms_users (user_id, role, status)
values ('00000000-0000-4000-8000-0000000021e1', 'editor', 'active');

delete from public.cms_site_settings_translations;
delete from public.cms_site_texts;
delete from public.cms_languages;

insert into public.cms_languages (code, name, native_name, is_default, active, sort_order)
values
  ('xa', 'Original', 'Original', true, true, 0),
  ('xb', 'Live', 'Live', false, true, 1),
  ('xc', 'Hidden', 'Hidden', false, false, 2);

insert into public.cms_media (id, storage_path, display_name, mime, size) values
  ('00000000-0000-4000-8000-0000000021d1', '00000000-0000-4000-8000-0000000021d1.jpg', 'cover.jpg', 'image/jpeg', 1);

-- K1 kava: own xb address `kava-xb`, published xa + xb, older.
-- K2 chai: newer, only the original (xb by fallback).
-- K3 archived, K4 draft only (with an address in its draft), K5 published only in hidden xc.
insert into public.cms_entries (id, type, first_published_at) values
  ('00000000-0000-4000-8000-000000002101', 'post', '2026-11-20T10:00:00Z'),
  ('00000000-0000-4000-8000-000000002102', 'post', '2026-11-22T10:00:00Z'),
  ('00000000-0000-4000-8000-000000002103', 'post', '2026-11-23T10:00:00Z'),
  ('00000000-0000-4000-8000-000000002104', 'post', null),
  ('00000000-0000-4000-8000-000000002105', 'post', null),
  ('00000000-0000-4000-8000-0000000021f1', 'other', '2026-11-24T10:00:00Z');
update public.cms_entries set archived_at = now() where id = '00000000-0000-4000-8000-000000002103';

insert into public.cms_page_published (page_id, locale, content, published_at) values
  ('00000000-0000-4000-8000-000000002101', 'xa', '{"title": "Kava", "slug": "kava", "cover": {"mediaId": "00000000-0000-4000-8000-0000000021d1"}}', '2026-11-20T10:00:00Z'),
  ('00000000-0000-4000-8000-000000002101', 'xb', '{"title": "Kava xb", "slug": "kava-xb"}', '2026-11-20T11:00:00Z'),
  ('00000000-0000-4000-8000-000000002102', 'xa', '{"title": "Chai", "slug": "chai"}', '2026-11-22T10:00:00Z'),
  ('00000000-0000-4000-8000-000000002103', 'xa', '{"title": "Old", "slug": "old"}', '2026-11-23T10:00:00Z'),
  ('00000000-0000-4000-8000-000000002105', 'xc', '{"title": "Hidden", "slug": "hidden"}', '2026-11-23T10:00:00Z'),
  ('00000000-0000-4000-8000-0000000021f1', 'xa', '{"title": "Other", "slug": "kava"}', '2026-11-24T10:00:00Z');

insert into public.cms_page_draft (page_id, locale, content) values
  ('00000000-0000-4000-8000-000000002101', 'xa', '{"title": "Kava (unpublished edit)", "slug": "kava"}'),
  ('00000000-0000-4000-8000-000000002104', 'xa', '{"title": "Draft only", "slug": "draft-only"}');

insert into public.cms_entry_slugs (entry_id, locale, type, slug) values
  ('00000000-0000-4000-8000-000000002101', 'xa', 'post', 'kava'),
  ('00000000-0000-4000-8000-000000002101', 'xb', 'post', 'kava-xb'),
  ('00000000-0000-4000-8000-000000002102', 'xa', 'post', 'chai'),
  ('00000000-0000-4000-8000-000000002103', 'xa', 'post', 'old'),
  ('00000000-0000-4000-8000-000000002105', 'xc', 'post', 'hidden'),
  ('00000000-0000-4000-8000-0000000021f1', 'xa', 'other', 'kava');

create function pg_temp.act(user_id text)
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- What the site gets for an address, as `title / translation title / first published`.
create function pg_temp.one(slug text, locale text)
returns text
language sql
as $$
  select coalesce(
    (select concat_ws(' / ', base ->> 'title', translation ->> 'title', right(id::text, 4))
       from public.cms_entry_get_localized('post', slug, locale, 'xa')),
    'none'
  )
$$;

-- A list as ids, in the order returned.
create function pg_temp.list(locale text, ids uuid[] default null, sort text default 'newest', page_limit integer default 20, page_offset integer default 0)
returns text
language sql
as $$
  select coalesce(string_agg(right(id::text, 4), ',' order by ordinality), '')
    from public.cms_entries_get_published('post', locale, ids, sort, page_limit, page_offset, 'xa') with ordinality
$$;

grant execute on function pg_temp.one(text, text) to anon, authenticated;
grant execute on function pg_temp.list(text, uuid[], text, integer, integer) to anon, authenticated;

-- The same expectations for every role -----------------------------------------------------

create function pg_temp.expectations(role_name text)
returns setof text
language plpgsql
as $$
begin
  return next is(pg_temp.one('kava', 'xa'), 'Kava / 2101', role_name || ': the original by its address, the publication not the draft');
  return next is(pg_temp.one('kava-xb', 'xb'), 'Kava / Kava xb / 2101', role_name || ': a translation by its own address');
  return next is(pg_temp.one('kava', 'xb'), 'none', role_name || ': the original address does not lead there in a language with its own');
  return next is(pg_temp.one('chai', 'xb'), 'Chai / 2102', role_name || ': fallback: no own address, no translation');
  return next is(pg_temp.one('old', 'xa'), 'none', role_name || ': an archived entry is a 404');
  return next is(pg_temp.one('draft-only', 'xa'), 'none', role_name || ': a draft-only entry is a 404');
  return next is(pg_temp.one('hidden', 'xc'), 'none', role_name || ': a hidden language is a 404');
  return next is(pg_temp.list('xa'), '2102,2101', role_name || ': the list: published, not archived, newest first');
  return next is(
    pg_temp.list('xa', array['00000000-0000-4000-8000-000000002101', '00000000-0000-4000-8000-000000002103', '00000000-0000-4000-8000-0000000021ff', '00000000-0000-4000-8000-000000002102']::uuid[]),
    '2101,2102',
    role_name || ': chosen ids keep their order; archived and missing ones are left out'
  );
end;
$$;

grant execute on function pg_temp.expectations(text) to anon, authenticated;

set local role anon;
select * from pg_temp.expectations('anon');
reset role;

select pg_temp.act('00000000-0000-4000-8000-0000000021c1');
set local role authenticated;
select * from pg_temp.expectations('site user');
reset role;

select pg_temp.act('00000000-0000-4000-8000-0000000021e1');
set local role authenticated;
select * from pg_temp.expectations('editor');
reset role;

-- Details --------------------------------------------------------------------------------

set local role anon;

select is(
  (select slugs from public.cms_entry_get_localized('post', 'kava', 'xa', 'xa')),
  '{"xa": "kava", "xb": "kava-xb"}'::jsonb,
  'slugs: the address in every active language (none for the hidden one)'
);
select is(
  (select jsonb_array_length(media) from public.cms_entry_get_localized('post', 'kava', 'xa', 'xa')),
  1,
  'the entry comes with the media it uses'
);
select is(
  (select first_published_at from public.cms_entry_get_localized('post', 'kava', 'xa', 'xa')),
  '2026-11-20T10:00:00Z'::timestamptz,
  'and its first publication'
);
select is(
  (select array_agg(distinct total) from public.cms_entries_get_published('post', 'xa', null, 'newest', 1, 0, 'xa')),
  array[2::bigint],
  'total counts every match, not the page'
);
select is(pg_temp.list('xa', null, 'newest', 1, 1), '2101', 'paging');
select is(pg_temp.list('xa', null, 'title'), '2102,2101', 'by title');
select is(
  (select slug from public.cms_entries_get_published('post', 'xb', null, 'newest', 20, 0, 'xa') where id = '00000000-0000-4000-8000-000000002102'),
  'chai',
  'a list carries the effective address of the language'
);
select is(pg_temp.list('xc'), '', 'a hidden language lists nothing');
select is(
  (select count(*)::int from public.cms_entry_get_localized('other', 'kava', 'xa', 'xa')),
  1,
  'addresses are per type'
);
-- 014 review X-3: a list by ids takes at most 100 ids.
select lives_ok(
  $$ select * from public.cms_entries_get_published('post', 'xa', array(select gen_random_uuid() from generate_series(1, 100)), 'newest', 100, 0, 'xa') $$,
  'a list by 100 ids is read'
);
select throws_ok(
  $$ select * from public.cms_entries_get_published('post', 'xa', array(select gen_random_uuid() from generate_series(1, 101)), 'newest', 100, 0, 'xa') $$,
  '23514',
  null,
  'more than 100 ids is refused on the server'
);

reset role;

-- Unpublishing the original takes the entry off the site.
delete from public.cms_page_published where page_id = '00000000-0000-4000-8000-000000002102' and locale = 'xa';
set local role anon;
select is(pg_temp.one('chai', 'xa'), 'none', 'an entry without a publication in the original is a 404');
reset role;

select ok(
  has_function_privilege('anon', 'public.cms_entry_get_localized(text, text, text, text)', 'execute')
    and has_function_privilege('anon', 'public.cms_entries_get_published(text, text, uuid[], text, integer, integer, text)', 'execute')
    and not (select prosecdef from pg_proc where oid = 'public.cms_entry_get_localized(text, text, text, text)'::regprocedure)
    and not (select prosecdef from pg_proc where oid = 'public.cms_entries_get_published(text, text, uuid[], text, integer, integer, text)'::regprocedure),
  'public reads: callable by anon, running with the caller''s rights'
);

select * from finish();

rollback;
