-- Field registry, site texts, translating outside Edit Mode (010b): `npm run test:db`.
-- Self-contained: own users and page, one transaction, rolled back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select plan(44);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000002001', 'owner-010b@example.test'),
  ('00000000-0000-4000-8000-000000002002', 'admin-010b@example.test'),
  ('00000000-0000-4000-8000-000000002003', 'editor-010b@example.test');

insert into public.cms_users (user_id, role, status)
values
  ('00000000-0000-4000-8000-000000002001', 'owner', 'active'),
  ('00000000-0000-4000-8000-000000002002', 'admin', 'active'),
  ('00000000-0000-4000-8000-000000002003', 'editor', 'active');

-- A clean site: Ukrainian default, English active. Rolled back at the end.
delete from public.cms_site_texts;
delete from public.cms_site_settings_translations;
delete from public.cms_page_locks where page_id is not null;
delete from public.cms_languages;
insert into public.cms_languages (code, name, native_name, active, is_default, sort_order)
values ('uk', 'Ukrainian', 'Українська', true, true, 0), ('en', 'English', 'English', true, false, 1);

select ok(
  not has_function_privilege('authenticated', 'public.cms_page_promote_draft(uuid, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.cms_page_open_in_editor(uuid)', 'execute'),
  'clients cannot call the publishing helpers'
);

-- Field registry ------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000002003", "role": "authenticated"}', true);
select set_config('cms_test.token', public.cms_page_lock_acquire('texts-fixture')::text, true);

select lives_ok(
  $$
    select public.cms_page_register_fields('texts-fixture', '/', $json$[
      { "address": "hero.title", "kind": "text", "label": "Title", "defaultText": "Hello from code", "section": "Hero", "position": 0, "tag": "h1" },
      { "address": "hero.cta", "kind": "button", "defaultText": "Start" },
      { "address": "quote.text", "kind": "text", "defaultText": "A quote" }
    ]$json$::jsonb)
  $$,
  'an editor registers the fields of a page'
);

select results_eq(
  $$
    select f.address, f.default_text
      from public.cms_page_fields f join public.cms_pages p on p.id = f.page_id
      where p.key = 'texts-fixture' order by f.address
  $$,
  $$ values ('hero.cta', 'Start'), ('hero.title', 'Hello from code'), ('quote.text', 'A quote') $$,
  'the registry holds the fields with their texts from code'
);

select results_eq(
  $$
    select f.section, f.position, f.tag
      from public.cms_page_fields f join public.cms_pages p on p.id = f.page_id
      where p.key = 'texts-fixture' and f.address = 'hero.title'
  $$,
  $$ values ('Hero', 0, 'h1') $$,
  'the registry keeps where a field is: block, order, element'
);

select results_eq(
  $$ select edit_path from public.cms_pages where key = 'texts-fixture' $$,
  $$ values ('/') $$,
  'the page remembers where it was opened'
);

-- A second open: hero.cta is gone from the code, the quote block is hidden.
select lives_ok(
  $$
    select public.cms_page_register_fields('texts-fixture', '/', $json$[
      { "address": "hero.title", "kind": "text", "defaultText": "Hello again" }
    ]$json$::jsonb, array['quote'])
  $$,
  'registering again'
);

select results_eq(
  $$
    select f.address, f.default_text
      from public.cms_page_fields f join public.cms_pages p on p.id = f.page_id
      where p.key = 'texts-fixture' order by f.address
  $$,
  $$ values ('hero.title', 'Hello again'), ('quote.text', 'A quote') $$,
  'fields gone from the code are removed; fields of a hidden optional block stay'
);

select throws_ok(
  $$ select public.cms_page_register_fields('texts-fixture', '/', '[{ "address": "bad key", "kind": "text" }]') $$,
  '23514', null, 'a field address must be a field key'
);

reset role;
set local role anon;

select throws_ok(
  $$ select * from public.cms_page_fields $$,
  '42501', null, 'the registry is not public'
);

reset role;

-- Texts outside Edit Mode: one write for the original and translations (010d) ----

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000002003", "role": "authenticated"}', true);

select public.cms_page_register_fields('texts-fixture', '/', $json$[
  { "address": "hero.title", "kind": "text", "defaultText": "Hello from code" },
  { "address": "hero.cta", "kind": "button", "defaultText": "Start" },
  { "address": "about.body", "kind": "richText" },
  { "address": "services.design.title", "kind": "text", "defaultText": "Design" },
  { "address": "services.build.title", "kind": "text", "defaultText": "Build" },
  { "address": "services.gone.title", "kind": "text", "defaultText": "Gone" }
]$json$::jsonb, array['quote']);

select throws_ok(
  $$ select public.cms_page_set_texts('texts-fixture', 'en', '{"hero.title": "Hello"}') $$,
  'CMSLK', null, 'a page open in Edit Mode is not written from the Texts screen'
);

select public.cms_page_lock_release('texts-fixture', current_setting('cms_test.token')::uuid);

select isnt(
  public.cms_page_set_texts('texts-fixture', 'en', '{"hero.title": "Hello", "hero.cta.label": "Start"}'),
  null,
  'an editor translates into the draft of the language'
);

select lives_ok(
  $$ select public.cms_page_set_texts('texts-fixture', 'en', '{"hero.cta.label": null}') $$,
  'a null value removes a translation'
);

select results_eq(
  $$
    select d.content
      from public.cms_page_draft d join public.cms_pages p on p.id = d.page_id
      where p.key = 'texts-fixture' and d.locale = 'en'
  $$,
  $$ values ('{"hero.title": "Hello"}'::jsonb) $$,
  'the translation draft holds the merged leaves'
);

select throws_ok(
  $$ select public.cms_page_set_texts('texts-fixture', 'en', '{"hero.cta.href": "/x"}') $$,
  '23514', null, 'an href is not a text: refused'
);

select throws_ok(
  $$ select public.cms_page_set_texts('texts-fixture', 'uk', '{"about.body": "plain"}') $$,
  '23514', null, 'rich text is not written from the Texts screen'
);

select throws_ok(
  $$ select public.cms_page_set_texts('texts-fixture', 'uk', '{"nope.title": "x"}') $$,
  '23514', null, 'an address the registry does not hold is refused'
);

select throws_ok(
  $$ select public.cms_page_set_texts('texts-fixture', 'uk', '{"hero.title": {"type": "doc"}}') $$,
  '23514', null, 'a text is a string'
);

-- The original: written into the tree of its draft.

select lives_ok(
  $$ select public.cms_page_set_texts('texts-fixture', 'uk', '{"hero.title": "Новий заголовок", "services.design.title": "Дизайн"}') $$,
  'an editor changes texts of the original'
);

select results_eq(
  $$
    select d.content
      from public.cms_page_draft d join public.cms_pages p on p.id = d.page_id
      where p.key = 'texts-fixture' and d.locale = 'uk'
  $$,
  $$ values ('{"hero": {"title": "Новий заголовок"}, "services": {"design": {"title": "Дизайн"}}}'::jsonb) $$,
  'the original is a tree; an item from code gets an override by its id'
);

select lives_ok(
  $$ select public.cms_page_set_texts('texts-fixture', 'uk', '{"hero.title": null}') $$,
  'null returns a text of the original to its text from code'
);

select results_eq(
  $$
    select d.content
      from public.cms_page_draft d join public.cms_pages p on p.id = d.page_id
      where p.key = 'texts-fixture' and d.locale = 'uk'
  $$,
  $$ values ('{"services": {"design": {"title": "Дизайн"}}}'::jsonb) $$,
  'the leaf and the objects it leaves empty are gone'
);

-- A list the original stored (as Edit Mode does on its first change).
reset role;
update public.cms_page_draft d
  set content = '{"services": [{"id": "design", "title": "Дизайн", "href": "/d"}, {"id": "build", "title": "Build", "href": "/b"}]}'
  from public.cms_pages p
  where p.id = d.page_id and p.key = 'texts-fixture' and d.locale = 'uk';
set local role authenticated;

select lives_ok(
  $$ select public.cms_page_set_texts('texts-fixture', 'uk', '{"services.build.title": "Розробка"}') $$,
  'a text of a stored item is written'
);

select results_eq(
  $$
    select d.content
      from public.cms_page_draft d join public.cms_pages p on p.id = d.page_id
      where p.key = 'texts-fixture' and d.locale = 'uk'
  $$,
  $$ values ('{"services": [{"id": "design", "title": "Дизайн", "href": "/d"}, {"id": "build", "title": "Розробка", "href": "/b"}]}'::jsonb) $$,
  'the item with that id changes; the list stays a list, nothing is added beside it'
);

select throws_ok(
  $$ select public.cms_page_set_texts('texts-fixture', 'uk', '{"services.build.title": null}') $$,
  '23514', null, 'a stored item has no text from code to return to'
);

select throws_ok(
  $$ select public.cms_page_set_texts('texts-fixture', 'uk', '{"services.gone.title": "x"}') $$,
  '23514', null, 'an item that is no longer in the list is refused (stale address)'
);

reset role;
set local role anon;

select throws_ok(
  $$ select public.cms_page_set_texts('texts-fixture', 'en', '{"hero.title": "x"}') $$,
  '42501', null, 'anon cannot write texts'
);

reset role;
set local role authenticated;

-- Publishing chosen pages ---------------------------------------------------------

select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and (p.proname = 'cms_page_translate'
          or (p.proname = 'cms_language_publish' and p.pronargs = 1))
  ),
  'the old write and the publish of a whole language are gone'
);

-- A second page with a translation draft.
reset role;
insert into public.cms_pages (key) values ('texts-fixture-2');
insert into public.cms_page_draft (page_id, locale, content)
  select id, 'en', '{"hero.title": "Second"}' from public.cms_pages where key = 'texts-fixture-2';
set local role authenticated;

-- Version markers as the API returns them (JSON text, with microseconds).
create function pg_temp.marker(page_key text, page_locale text)
returns text
language sql
as $$
  select to_json(d.updated_at) #>> '{}'
    from public.cms_page_draft d join public.cms_pages p on p.id = d.page_id
    where p.key = page_key and d.locale = page_locale
$$;

select throws_ok(
  format($$ select * from public.cms_language_publish('en', '[{"key": "texts-fixture", "draftUpdatedAt": %s}]') $$,
    to_json(pg_temp.marker('texts-fixture', 'en'))),
  '42501', null, 'an editor cannot publish'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000002002", "role": "authenticated"}', true);

select results_eq(
  format($$ select published, skipped, skipped_keys from public.cms_language_publish('en', '[{"key": "texts-fixture", "draftUpdatedAt": "2020-01-01T00:00:00+00:00"}]') $$),
  $$ values (0, 1, array['texts-fixture']) $$,
  'a draft that changed since the screen read it is skipped'
);

select results_eq(
  format($$ select published, skipped from public.cms_language_publish('en', '[{"key": "texts-fixture", "draftUpdatedAt": %s}]') $$,
    to_json(pg_temp.marker('texts-fixture', 'en'))),
  $$ values (1, 0) $$,
  'the chosen page is published with the marker as the API returns it (microseconds kept)'
);

select results_eq(
  $$
    select p.key, d.locale::text
      from public.cms_page_draft d join public.cms_pages p on p.id = d.page_id
      where p.key like 'texts-fixture%' and d.locale = 'en'
  $$,
  $$ values ('texts-fixture-2', 'en') $$,
  'a page that was not chosen keeps its draft'
);

select results_eq(
  $$
    select pub.content, r.base
      from public.cms_page_published pub
      join public.cms_pages p on p.id = pub.page_id
      join public.cms_page_revisions r on r.page_id = pub.page_id and r.locale = pub.locale
      where p.key = 'texts-fixture' and pub.locale = 'en'
  $$,
  $$ values ('{"hero.title": "Hello"}'::jsonb, false) $$,
  'published with a revision of a translation'
);

select set_config('cms_test.token2', public.cms_page_lock_acquire('texts-fixture-2')::text, true);

select results_eq(
  format($$ select published, skipped from public.cms_language_publish('en', '[{"key": "texts-fixture-2", "draftUpdatedAt": %s}]') $$,
    to_json(pg_temp.marker('texts-fixture-2', 'en'))),
  $$ values (0, 1) $$,
  'a page open in Edit Mode is skipped'
);

select public.cms_page_lock_release('texts-fixture-2', current_setting('cms_test.token2')::uuid);

-- The original from the Texts screen, published: the translation falls back to it.
select results_eq(
  format($$ select published from public.cms_language_publish('uk', '[{"key": "texts-fixture", "draftUpdatedAt": %s}]') $$,
    to_json(pg_temp.marker('texts-fixture', 'uk'))),
  $$ values (1) $$,
  'the original is published the same way'
);

reset role;
set local role anon;

select results_eq(
  $$
    select base -> 'services' -> 1 ->> 'title', translation ->> 'hero.title', translation ? 'services.build.title'
      from public.cms_page_get_localized('texts-fixture', 'en', 'xx')
  $$,
  $$ values ('Розробка', 'Hello', false) $$,
  'the public read of the translation gets the new original where it has no text of its own'
);

reset role;
set local role authenticated;

-- Site texts ----------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000002003", "role": "authenticated"}', true);

select throws_ok(
  $$ insert into public.cms_site_texts (key, locale, value) values ('nav.about', 'uk', 'Про нас') $$,
  '42501', null, 'an editor cannot change site texts (they are live at once)'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000002002", "role": "authenticated"}', true);

select lives_ok(
  $$
    insert into public.cms_site_texts (key, locale, value)
    values ('nav.about', 'uk', 'Про нас'), ('nav.about', 'en', 'About us'), ('nav.work', 'uk', 'Роботи')
  $$,
  'an admin changes site texts'
);

-- What PostgREST sends for an upsert: every column is updated.
select lives_ok(
  $$
    insert into public.cms_site_texts (key, locale, value) values ('nav.about', 'uk', 'Про нас!')
      on conflict (key, locale) do update
        set key = excluded.key, locale = excluded.locale, value = excluded.value
  $$,
  'an admin upserts a site text the way the API does'
);

select results_eq(
  $$ select value from public.cms_site_texts where key = 'nav.about' and locale = 'uk' $$,
  $$ values ('Про нас!') $$,
  'the upsert changed the value'
);

update public.cms_site_texts set value = 'Про нас' where key = 'nav.about' and locale = 'uk';

select throws_ok(
  $$ insert into public.cms_site_texts (key, locale, value) values ('bad key', 'uk', 'x') $$,
  '23514', null, 'a site text key is a dotted key'
);

reset role;
set local role anon;

select is(
  public.cms_site_texts_for('en', 'uk'),
  '{"nav.about": "About us", "nav.work": "Роботи"}'::jsonb,
  'the public site gets the language with the default language behind it'
);

reset role;
update public.cms_languages set active = false where code = 'en';
set local role anon;

select is(
  public.cms_site_texts_for('en', 'uk'),
  '{"nav.about": "Про нас", "nav.work": "Роботи"}'::jsonb,
  'a hidden language is not served: the default language shows'
);

reset role;
update public.cms_languages set active = true where code = 'en';

-- Deleting a language deletes its site texts ----------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000002001", "role": "authenticated"}', true);

select lives_ok(
  $$ select public.cms_language_delete('en') $$,
  'the owner deletes a language'
);

reset role;

select results_eq(
  $$ select count(*)::int from public.cms_site_texts where locale = 'en' $$,
  $$ values (0) $$,
  'its site texts are gone'
);

select * from finish();

rollback;
