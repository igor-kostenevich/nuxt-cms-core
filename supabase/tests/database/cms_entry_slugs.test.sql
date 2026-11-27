-- Addresses of entries (014, stage 2b): `npm run test:db`. One transaction, rolled back.
--
-- Languages: xa (the original), xb (active), xc (hidden). Every publish goes
-- the real way (lock, save, publish, release) as an admin; a refused one
-- rolls back as a whole. After every scenario the invariant holds: in every
-- (type, language) an effective slug leads to one entry.

begin;

create extension if not exists pgtap with schema extensions;

select plan(65);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-0000000017a1', 'admin-014-slug@example.test'),
  ('00000000-0000-4000-8000-0000000017b1', 'owner-014-slug@example.test'),
  ('00000000-0000-4000-8000-0000000017c1', 'customer-014-slug@example.test');

insert into public.cms_users (user_id, role, status)
values
  ('00000000-0000-4000-8000-0000000017a1', 'admin', 'active'),
  ('00000000-0000-4000-8000-0000000017b1', 'owner', 'active');

delete from public.cms_site_settings_translations;
delete from public.cms_site_texts;
delete from public.cms_languages;

insert into public.cms_languages (code, name, native_name, is_default, active, sort_order)
values
  ('xa', 'Original', 'Original', true, true, 0),
  ('xb', 'Live', 'Live', false, true, 1),
  ('xc', 'Hidden', 'Hidden', false, false, 2);

-- P1…P9 posts, O1 of another type.
insert into public.cms_entries (id, type) values
  ('00000000-0000-4000-8000-000000001701', 'post'),
  ('00000000-0000-4000-8000-000000001702', 'post'),
  ('00000000-0000-4000-8000-000000001703', 'post'),
  ('00000000-0000-4000-8000-000000001704', 'post'),
  ('00000000-0000-4000-8000-000000001705', 'post'),
  ('00000000-0000-4000-8000-000000001706', 'post'),
  ('00000000-0000-4000-8000-000000001707', 'post'),
  ('00000000-0000-4000-8000-000000001708', 'post'),
  ('00000000-0000-4000-8000-000000001709', 'post'),
  ('00000000-0000-4000-8000-0000000017f1', 'other');

create function pg_temp.act(user_id text)
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- Publishes a content the real way; 'ok' or the SQLSTATE of the refusal.
create function pg_temp.pub(entry text, locale text, content jsonb, require_slug boolean default false, entry_type text default 'post')
returns text
language plpgsql
as $$
declare
  token uuid;
begin
  token := public.cms_entry_lock_acquire(entry_type, entry::uuid);
  perform public.cms_entry_save_draft(entry_type, entry::uuid, locale, content, token);
  perform public.cms_entry_publish(entry_type, entry::uuid, locale, token, require_slug);
  perform public.cms_entry_lock_release(entry_type, entry::uuid, token);
  return 'ok';
exception when others then
  return sqlstate;
end;
$$;

-- Effective slug of an entry in a language, read as the owner.
create function pg_temp.eff(entry text, locale text)
returns text
language sql
as $$
  select coalesce(
    (select s.slug from public.cms_entry_slugs s where s.entry_id = entry::uuid and s.locale = eff.locale),
    (select s.slug from public.cms_entry_slugs s where s.entry_id = entry::uuid and s.locale = 'xa')
  )
$$;

-- (type, language, slug) that lead to more than one entry, over every language.
create function pg_temp.duplicates()
returns integer
language sql
as $$
  select count(*)::int from (
    select e.type, l.code, coalesce(own.slug, original.slug) as slug
      from public.cms_entries e
      cross join public.cms_languages l
      left join public.cms_entry_slugs own on own.entry_id = e.id and own.locale = l.code
      left join public.cms_entry_slugs original on original.entry_id = e.id and original.locale = 'xa'
      where coalesce(own.slug, original.slug) is not null
      group by 1, 2, 3
      having count(*) > 1
  ) d
$$;

grant execute on function pg_temp.pub(text, text, jsonb, boolean, text) to authenticated;
grant execute on function pg_temp.eff(text, text) to authenticated;

select pg_temp.act('00000000-0000-4000-8000-0000000017a1');
set local role authenticated;

-- 1. Format ------------------------------------------------------------------------

select is(pg_temp.pub('00000000-0000-4000-8000-000000001709', 'xa', '{"title": "T", "slug": "Bad Slug"}'), '23514', 'spaces and capitals are refused');
select is(pg_temp.pub('00000000-0000-4000-8000-000000001709', 'xa', '{"title": "T", "slug": "-a"}'), '23514', 'a leading hyphen is refused');
select is(pg_temp.pub('00000000-0000-4000-8000-000000001709', 'xa', '{"title": "T", "slug": "a--b"}'), '23514', 'a double hyphen is refused');
select is(pg_temp.pub('00000000-0000-4000-8000-000000001709', 'xa', '{"title": "T", "slug": ""}'), '23514', 'an empty address is refused');
select is(pg_temp.pub('00000000-0000-4000-8000-000000001709', 'xa', jsonb_build_object('title', 'T', 'slug', repeat('a', 81))), '23514', 'more than 80 characters is refused');
select is(pg_temp.pub('00000000-0000-4000-8000-000000001709', 'xa', '{"title": "T", "slug": 7}'), '23514', 'an address is a string');

-- 2. The original -------------------------------------------------------------------

select is(pg_temp.pub('00000000-0000-4000-8000-000000001701', 'xa', '{"title": "Kava", "slug": "kava"}'), 'ok', 'P1 takes kava');
select is(
  array[pg_temp.eff('00000000-0000-4000-8000-000000001701', 'xa'), pg_temp.eff('00000000-0000-4000-8000-000000001701', 'xb'), pg_temp.eff('00000000-0000-4000-8000-000000001701', 'xc')],
  array['kava', 'kava', 'kava'],
  'the address of the original is the address in every language'
);
select is(pg_temp.pub('00000000-0000-4000-8000-000000001702', 'xa', '{"title": "Also kava", "slug": "kava"}'), 'CMSSL', 'P2 cannot take kava in the original');

reset role;

select is(
  (select count(*)::int from public.cms_page_published where page_id = '00000000-0000-4000-8000-000000001702')
    + (select count(*)::int from public.cms_page_revisions where page_id = '00000000-0000-4000-8000-000000001702')
    + (select count(*)::int from public.cms_entry_slugs where entry_id = '00000000-0000-4000-8000-000000001702')
    + (select count(*)::int from public.cms_activity where entity_id = '00000000-0000-4000-8000-000000001702' and action = 'publish'),
  0,
  'a refused publish leaves no publication, revision, address or event'
);

select pg_temp.act('00000000-0000-4000-8000-0000000017a1');
set local role authenticated;

select is(pg_temp.pub('00000000-0000-4000-8000-0000000017f1', 'xa', '{"title": "Other kava", "slug": "kava"}', false, 'other'), 'ok', 'another type may use kava');
select is(pg_temp.pub('00000000-0000-4000-8000-000000001702', 'xa', '{"title": "Chai", "slug": "chai"}'), 'ok', 'P2 takes chai');

-- 3. Translations and the fallback ----------------------------------------------------

select is(pg_temp.pub('00000000-0000-4000-8000-000000001702', 'xb', '{"title": "Kava xb", "slug": "kava"}'), 'CMSSL',
  'a translation cannot take an address another entry has there by fallback');
select is(pg_temp.pub('00000000-0000-4000-8000-000000001701', 'xb', '{"title": "Kava xb", "slug": "kava-xb"}'), 'ok', 'P1 gets its own xb address');
select is(pg_temp.pub('00000000-0000-4000-8000-000000001702', 'xb', '{"title": "Kava xb", "slug": "kava"}'), 'ok', 'now kava in xb is free for P2');
select is(
  array[pg_temp.eff('00000000-0000-4000-8000-000000001702', 'xa'), pg_temp.eff('00000000-0000-4000-8000-000000001702', 'xb'), pg_temp.eff('00000000-0000-4000-8000-000000001702', 'xc')],
  array['chai', 'kava', 'chai'],
  'P2: its own address in xb, the original elsewhere'
);
select is(pg_temp.pub('00000000-0000-4000-8000-000000001702', 'xc', '{"title": "Zelenyi", "slug": "zelenyi"}'), 'ok', 'P2 gets an address in the hidden language');
select is(pg_temp.pub('00000000-0000-4000-8000-000000001703', 'xa', '{"title": "Green", "slug": "zelenyi"}'), 'CMSSL',
  'the original of P3 would collide in the hidden language: refused');
select is(pg_temp.pub('00000000-0000-4000-8000-000000001701', 'xa', '{"title": "Kava", "slug": "chai"}'), 'CMSSL', 'P1 cannot move onto chai');
select is(pg_temp.pub('00000000-0000-4000-8000-000000001701', 'xa', '{"title": "Kava", "slug": "kava-new"}'), 'ok', 'P1 moves its original to kava-new');
select is(
  array[pg_temp.eff('00000000-0000-4000-8000-000000001701', 'xa'), pg_temp.eff('00000000-0000-4000-8000-000000001701', 'xb'), pg_temp.eff('00000000-0000-4000-8000-000000001701', 'xc')],
  array['kava-new', 'kava-xb', 'kava-new'],
  'moving the original moves the languages without an own address only'
);
select is(pg_temp.pub('00000000-0000-4000-8000-000000001703', 'xa', '{"title": "Kava again", "slug": "kava"}'), 'CMSSL',
  'kava is free in xa, but in xb it is P2''s own: P3 by fallback would collide');
select is(pg_temp.pub('00000000-0000-4000-8000-000000001701', 'xb', '{"title": "Kava xb"}'), 'ok', 'P1 drops its own xb address');
select is(pg_temp.eff('00000000-0000-4000-8000-000000001701', 'xb'), 'kava-new', 'and falls back to the original there');

reset role;
select is(pg_temp.duplicates(), 0, 'invariant after translations and fallbacks');

-- 4. The archive keeps its addresses ------------------------------------------------------

update public.cms_entries set archived_at = now() where id = '00000000-0000-4000-8000-000000001702';

select pg_temp.act('00000000-0000-4000-8000-0000000017a1');
set local role authenticated;

select is(pg_temp.pub('00000000-0000-4000-8000-000000001704', 'xa', '{"title": "Chai 2", "slug": "chai"}'), 'CMSSL', 'an archived entry keeps its address');
select results_eq(
  $$ select status, holder_title, holder_archived from public.cms_entry_slug_check('post', null, 'xa', 'chai') $$,
  $$ values ('taken'::text, 'Chai'::text, true) $$,
  'the check names the archived holder'
);

reset role;
update public.cms_entries set archived_at = null where id = '00000000-0000-4000-8000-000000001702';
select is(pg_temp.duplicates(), 0, 'unarchiving cannot break an address');

-- 5. Restore of an old address ------------------------------------------------------------

select pg_temp.act('00000000-0000-4000-8000-0000000017a1');
set local role authenticated;

select is(pg_temp.pub('00000000-0000-4000-8000-000000001705', 'xa', '{"title": "Tea", "slug": "tea"}'), 'ok', 'P5 publishes tea');
select is(pg_temp.pub('00000000-0000-4000-8000-000000001705', 'xa', '{"title": "Tea", "slug": "tea-2"}'), 'ok', 'then moves to tea-2');
select is(pg_temp.pub('00000000-0000-4000-8000-000000001706', 'xa', '{"title": "Tea", "slug": "tea"}'), 'ok', 'P6 takes the freed tea');

select set_config('t.token', public.cms_entry_lock_acquire('post', '00000000-0000-4000-8000-000000001705')::text, true);

reset role;
select set_config('t.revision', (
  select r.id::text from public.cms_page_revisions r
    where r.page_id = '00000000-0000-4000-8000-000000001705' and r.locale = 'xa' and r.content ->> 'slug' = 'tea'
), true);
select pg_temp.act('00000000-0000-4000-8000-0000000017a1');
set local role authenticated;

select lives_ok(
  format($$ select public.cms_entry_restore('post', '00000000-0000-4000-8000-000000001705', 'xa', %L, %L, true) $$,
         current_setting('t.revision'), current_setting('t.token')),
  'the revision with the old address restores into the draft'
);
select throws_ok(
  format($$ select public.cms_entry_publish('post', '00000000-0000-4000-8000-000000001705', 'xa', %L) $$, current_setting('t.token')),
  'CMSSL', null,
  'publishing it is refused: the address is someone else''s now'
);
select is(pg_temp.eff('00000000-0000-4000-8000-000000001705', 'xa'), 'tea-2', 'P5 keeps its current address');
select lives_ok(
  format($$ select public.cms_entry_lock_release('post', '00000000-0000-4000-8000-000000001705', %L) $$, current_setting('t.token')),
  'release'
);

-- 6. A required address, and removing one --------------------------------------------------

select is(pg_temp.pub('00000000-0000-4000-8000-000000001707', 'xa', '{"title": "No address"}', true), '23514', 'a type with a route needs an address');
select is(pg_temp.pub('00000000-0000-4000-8000-000000001707', 'xa', '{"title": "Kofe", "slug": "kofe"}', true), 'ok', 'with one it publishes');
select is(pg_temp.pub('00000000-0000-4000-8000-000000001707', 'xb', '{"title": "Kofe xb"}', true), 'ok', 'a translation is addressed through the fallback');
select is(pg_temp.pub('00000000-0000-4000-8000-000000001707', 'xa', '{"title": "Kofe"}'), 'ok', 'without the requirement the address can be removed');
select is(pg_temp.eff('00000000-0000-4000-8000-000000001707', 'xa'), null, 'P7 has no address any more');
select is(pg_temp.pub('00000000-0000-4000-8000-000000001704', 'xa', '{"title": "Kofe 2", "slug": "kofe"}'), 'ok', 'the removed address is free');

-- 7. Lookups ----------------------------------------------------------------------------

select is(public.cms_entry_find('post', 'xa', 'kava-new')::text, '00000000-0000-4000-8000-000000001701', 'find: the original');
select is(public.cms_entry_find('post', 'xc', 'kava-new')::text, '00000000-0000-4000-8000-000000001701', 'find: a language without an own address falls back');
select is(public.cms_entry_find('post', 'xb', 'kava')::text, '00000000-0000-4000-8000-000000001702', 'find: an own translated address');
select is(public.cms_entry_find('post', 'xa', 'kava'), null, 'find: kava leads nowhere in xa any more');
select is(public.cms_entry_find('other', 'xa', 'kava')::text, '00000000-0000-4000-8000-0000000017f1', 'find: per type');

select lives_ok(
  $$ select public.cms_entry_save_draft('post', '00000000-0000-4000-8000-000000001708', 'xa', '{"title": "Draft", "slug": "draft-only"}',
       public.cms_entry_lock_acquire('post', '00000000-0000-4000-8000-000000001708')) $$,
  'a draft-only entry with an address'
);
select is(public.cms_entry_find('post', 'xa', 'draft-only'), null, 'find: drafts are not addresses');

select is((select status from public.cms_entry_slug_check('post', null, 'xa', 'Not Valid')), 'invalid', 'check: invalid');
select is((select status from public.cms_entry_slug_check('post', null, 'xa', 'brand-new')), 'ok', 'check: free');
select is((select status from public.cms_entry_slug_check('post', '00000000-0000-4000-8000-000000001701', 'xa', 'kava-new')), 'ok', 'check: an entry''s own address is free for it');
select is((select status from public.cms_entry_slug_check('post', '00000000-0000-4000-8000-000000001704', 'xa', 'kava-new')), 'taken', 'check: another entry''s address');
select is((select status from public.cms_entry_slug_check('post', null, 'xa', 'kava')), 'taken', 'check: the original is checked against every language');
select is((select status from public.cms_entry_slug_check('post', null, 'xb', 'kava-new')), 'taken', 'check: a translation against fallbacks');

reset role;

-- 8. Languages ----------------------------------------------------------------------------

insert into public.cms_languages (code, name, native_name, is_default, active, sort_order) values ('xd', 'Later', 'Later', false, true, 3);
select is(pg_temp.duplicates(), 0, 'a language added later creates no conflict');

delete from public.cms_page_locks;
select pg_temp.act('00000000-0000-4000-8000-0000000017b1');
set local role authenticated;
select lives_ok($$ select public.cms_language_delete('xb') $$, 'the owner deletes xb');
reset role;

select is((select count(*)::int from public.cms_entry_slugs where locale = 'xb'), 0, 'its own addresses go with it');
select is(pg_temp.duplicates(), 0, 'invariant after deleting a language');

-- 9. Backstop, access and the final invariant ------------------------------------------------

select throws_ok(
  $$ insert into public.cms_entry_slugs (entry_id, locale, type, slug) values ('00000000-0000-4000-8000-000000001703', 'xa', 'post', 'kava-new') $$,
  '23505', null,
  'the database refuses a repeated own address of a language'
);

select ok(
  not has_function_privilege('anon', 'public.cms_entry_slug_check(text, uuid, text, text)', 'execute')
    and not has_function_privilege('anon', 'public.cms_entry_find(text, text, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.cms_entry_slug_conflict(text, uuid, text, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.cms_entry_publish_slug(uuid, text)', 'execute'),
  'lookups are for signed-in users; the conflict and publish internals for nobody'
);

select ok(
  not has_table_privilege('authenticated', 'public.cms_entry_slugs', 'insert')
    and not has_table_privilege('authenticated', 'public.cms_entry_slugs', 'update')
    and not has_table_privilege('authenticated', 'public.cms_entry_slugs', 'delete'),
  'no direct writes to addresses'
);

select pg_temp.act('00000000-0000-4000-8000-0000000017c1');
set local role authenticated;

select throws_ok(
  $$ select * from public.cms_entry_slug_check('post', null, 'xa', 'kava-new') $$,
  '42501', null,
  'a site user cannot probe addresses'
);
select is(public.cms_entry_find('post', 'xa', 'kava-new'), null, 'nor find entries by address');

reset role;

update public.cms_entries set archived_at = now() where id = '00000000-0000-4000-8000-000000001706';
set local role anon;
select is(
  (select array_agg(right(entry_id::text, 4) order by entry_id) from public.cms_entry_slugs
     where entry_id in ('00000000-0000-4000-8000-000000001701', '00000000-0000-4000-8000-000000001706', '00000000-0000-4000-8000-000000001708')),
  array['1701'],
  'anon sees addresses of public entries only (not archived, not draft-only)'
);
reset role;

select is(pg_temp.duplicates(), 0, 'final invariant: every address leads to one entry');

select * from finish();

rollback;
