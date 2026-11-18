-- The Texts screen writes texts only, whatever the field registry says (010d,
-- after review): `npm run test:db`. One transaction, rolled back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-000000002103', 'editor-text-only@example.test');

insert into public.cms_users (user_id, role, status)
values ('00000000-0000-4000-8000-000000002103', 'editor', 'active');

delete from public.cms_site_texts;
delete from public.cms_site_settings_translations;
delete from public.cms_page_locks where page_id is not null;
delete from public.cms_languages;
insert into public.cms_languages (code, name, native_name, active, is_default, sort_order)
values ('en', 'English', 'English', true, true, 0), ('uk', 'Ukrainian', 'Українська', true, false, 1);

-- The editor opens the page (creates it) and registers, beside the real
-- fields, entries that are not texts: a forged or an outdated registry.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000002103", "role": "authenticated"}', true);
select set_config('cms_test.token', public.cms_page_lock_acquire('text-only-fixture')::text, true);

select public.cms_page_register_fields('text-only-fixture', '/', $json$[
  { "address": "hero.title", "kind": "text" },
  { "address": "hero.cta", "kind": "button" },
  { "address": "hero.image", "kind": "image" },
  { "address": "services.a.title", "kind": "text" },
  { "address": "work.code.title", "kind": "text" },
  { "address": "hero.cta.href", "kind": "text" },
  { "address": "hero.cta.newTab", "kind": "text" },
  { "address": "hero.image.mediaId", "kind": "text" },
  { "address": "hero.image.focal", "kind": "text" },
  { "address": "quote.visibility.hidden", "kind": "text" },
  { "address": "services.a.id", "kind": "text" },
  { "address": "about.photo", "kind": "text" },
  { "address": "about.body.type", "kind": "text" },
  { "address": "hero.title.x", "kind": "text" }
]$json$::jsonb);

select public.cms_page_lock_release('text-only-fixture', current_setting('cms_test.token')::uuid);

-- The original as Edit Mode saved it.
reset role;
insert into public.cms_page_draft (page_id, locale, content)
select p.id, 'en', $json${
  "hero": {
    "title": "Hello",
    "cta": { "label": "Start", "href": "/start" },
    "image": { "mediaId": "00000000-0000-4000-8000-000000000001", "alt": "Studio" }
  },
  "about": {
    "body": { "type": "doc", "content": [] },
    "photo": { "mediaId": "00000000-0000-4000-8000-000000000003", "alt": "Team" }
  },
  "services": [{ "id": "a", "title": "One", "href": "/one" }]
}$json$::jsonb
  from public.cms_pages p where p.key = 'text-only-fixture';
set local role authenticated;

-- Texts are written: a text, a label, an alt, a stored item, an item from code.
select lives_ok(
  $$ select public.cms_page_set_texts('text-only-fixture', 'en', $json${
    "hero.title": "Hi", "hero.cta.label": "Go", "hero.image.alt": "Office",
    "services.a.title": "First", "work.code.title": "From code"
  }$json$) $$,
  'texts of the original are written'
);

select lives_ok(
  $$ select public.cms_page_set_texts('text-only-fixture', 'uk', '{"hero.title": "Привіт", "hero.cta.label": "Почати"}') $$,
  'texts of a translation are written'
);

-- Everything the forged entries point at is refused, for the original…
select throws_ok(format($$ select public.cms_page_set_texts('text-only-fixture', 'en', %L) $$, entry), '23514', null, message)
  from (values
    ('{"hero.cta.href": "https://example.com"}', 'a link target is not a text'),
    ('{"hero.cta.newTab": "true"}', 'a link switch is not a text'),
    ('{"hero.image.mediaId": "00000000-0000-4000-8000-000000000002"}', 'a media id is not a text'),
    ('{"hero.image.focal": "x"}', 'a focal point is not a text'),
    ('{"quote.visibility.hidden": "yes"}', 'the switch of an optional block is not a text, even unstored'),
    ('{"services.a.id": "b"}', 'an item id is not a text'),
    ('{"about.photo": "Team"}', 'a whole image value is not replaced by a string (outdated registry)'),
    ('{"about.body.type": "x"}', 'the inside of a rich text document is not a text'),
    ('{"hero.title.x": "x"}', 'a text has no children')
  ) as cases (entry, message);

-- …and for a translation, checked against the original it translates.
select throws_ok(
  $$ select public.cms_page_set_texts('text-only-fixture', 'uk', '{"about.photo": "Команда"}') $$,
  '23514', null, 'a translation cannot replace a value of the original with a string'
);

select throws_ok(
  $$ select public.cms_page_set_texts('text-only-fixture', 'uk', '{"quote.visibility.hidden": "так"}') $$,
  '23514', null, 'a translation cannot carry a switch'
);

reset role;

select results_eq(
  $$
    select d.content
      from public.cms_page_draft d join public.cms_pages p on p.id = d.page_id
      where p.key = 'text-only-fixture' and d.locale = 'en'
  $$,
  $$ values ($json${
    "hero": {
      "title": "Hi",
      "cta": { "label": "Go", "href": "/start" },
      "image": { "mediaId": "00000000-0000-4000-8000-000000000001", "alt": "Office" }
    },
    "about": {
      "body": { "type": "doc", "content": [] },
      "photo": { "mediaId": "00000000-0000-4000-8000-000000000003", "alt": "Team" }
    },
    "services": [{ "id": "a", "title": "First", "href": "/one" }],
    "work": { "code": { "title": "From code" } }
  }$json$::jsonb) $$,
  'only the texts changed: href, media and structure are as Edit Mode saved them'
);

select ok(
  not has_function_privilege('authenticated', 'public.cms_page_text_target(jsonb, text)', 'execute'),
  'clients cannot call the helper'
);

select * from finish();

rollback;
