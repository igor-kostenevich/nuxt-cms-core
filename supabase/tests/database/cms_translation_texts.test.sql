-- A translation changes texts only (C-78, audit of 006–012): `npm run test:db`.
-- cms_page_save_draft refuses translation leaves that would change structure,
-- visibility, link behaviour, media or the type of a value; the original is
-- free. Self-contained: own users and page, one transaction, rolled back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

-- Fixture, written as the migration owner -------------------------------------

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-00000000f0e1', 'editor-texts@example.test');

insert into public.cms_users (user_id, role, status)
values ('00000000-0000-4000-8000-00000000f0e1', 'editor', 'active');

delete from public.cms_site_settings_translations;
delete from public.cms_site_texts;
delete from public.cms_languages;

insert into public.cms_languages (code, name, native_name, is_default, active, sort_order)
values ('xa', 'Original', 'Original', true, true, 0), ('xb', 'Translation', 'Translation', false, true, 1);

-- The same base and cases as tests/fixtures/translation-fits.json: SQL and JS must agree.
select set_config('cms_test.base', $json$
{
  "hero": {
    "title": "Hi",
    "cta": { "label": "Go", "href": "/about", "newTab": false },
    "image": { "mediaId": "00000000-0000-4000-8000-000000000001", "alt": "Studio" },
    "lead": { "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Lead" }] }] }
  },
  "services": { "items": [{ "id": "a1", "title": "One" }, { "id": "b2", "title": "Two" }] },
  "quote": { "visibility": { "hidden": true } }
}
$json$, true);

select set_config('cms_test.cases', $json$
[
  { "address": "hero.title", "value": "Привіт", "fits": true },
  { "address": "hero.cta.label", "value": "Вперед", "fits": true },
  { "address": "hero.image.alt", "value": "Студія", "fits": true },
  { "address": "hero.lead", "value": { "type": "doc", "content": [] }, "fits": true },
  { "address": "services.items.b2.title", "value": "Два", "fits": true },
  { "address": "services.items.default-0.title", "value": "З коду", "fits": true },
  { "address": "about.title", "value": "Текст з коду", "fits": true },
  { "address": "about.body", "value": { "type": "doc", "content": [] }, "fits": true },
  { "address": "about.cta.label", "value": "Кнопка з коду", "fits": true },
  { "address": "hero.title", "value": null, "fits": true },
  { "address": "hero.lead", "value": null, "fits": true },

  { "address": "quote.visibility.hidden", "value": "x", "fits": false },
  { "address": "hero.cta.newTab", "value": "false", "fits": false },
  { "address": "hero.cta.href", "value": "/x", "fits": false },
  { "address": "hero.image.mediaId", "value": "x", "fits": false },
  { "address": "hero.image.focal", "value": "x", "fits": false },
  { "address": "hero.image.decorative", "value": "x", "fits": false },
  { "address": "services.items.b2.id", "value": "x", "fits": false },
  { "address": "about.cta.hidden", "value": "x", "fits": false },
  { "address": "quote.visibility", "value": "x", "fits": false },
  { "address": "hero.cta", "value": "Go!", "fits": false },
  { "address": "services.items", "value": "x", "fits": false },
  { "address": "hero.lead.type", "value": "x", "fits": false },
  { "address": "hero.lead.content", "value": "x", "fits": false },
  { "address": "hero.lead", "value": "flat", "fits": false },
  { "address": "hero.title", "value": { "type": "doc", "content": [] }, "fits": false },
  { "address": "hero.title.deep", "value": "x", "fits": false },
  { "address": "quote.visibility", "value": null, "fits": false }
]
$json$, true);

insert into public.cms_pages (id, key) values ('00000000-0000-4000-8000-00000000f000', 'texts-fixture');

insert into public.cms_page_published (page_id, locale, content)
values ('00000000-0000-4000-8000-00000000f000', 'xa', current_setting('cms_test.base')::jsonb);

-- The rule ----------------------------------------------------------------------

select is_empty(
  $$
    select c ->> 'address'
      from jsonb_array_elements(current_setting('cms_test.cases')::jsonb) as c
      where public.cms_page_text_fits(current_setting('cms_test.base')::jsonb, c ->> 'address', c -> 'value')
        is distinct from (c ->> 'fits')::boolean
  $$,
  'cms_page_text_fits agrees with translationFits on every fixture case'
);

select is_empty(
  $$
    select c ->> 'address'
      from jsonb_array_elements(current_setting('cms_test.cases')::jsonb) as c
      where public.cms_page_text_target(current_setting('cms_test.base')::jsonb, c ->> 'address')
        is distinct from public.cms_page_text_fits(current_setting('cms_test.base')::jsonb, c ->> 'address', '""')
  $$,
  'the Texts screen rule is the same rule for a text'
);

select ok(
  not has_function_privilege('authenticated', 'public.cms_page_text_fits(jsonb, text, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.cms_page_text_fits(jsonb, text, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.cms_page_check_translation(uuid, text, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.cms_page_check_translation(uuid, text, jsonb)', 'execute'),
  'clients cannot call the translation checks'
);

-- Saves through Edit Mode's RPC, as an editor holding the lock ------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000f0e1", "role": "authenticated"}', true);
select set_config('cms_test.token', public.cms_page_lock_acquire('texts-fixture')::text, true);

create function pg_temp.save(page_locale text, content jsonb)
returns timestamptz
language sql
as $$
  select public.cms_page_save_draft('texts-fixture', page_locale, content, current_setting('cms_test.token')::uuid);
$$;

select lives_ok(
  $$ select pg_temp.save('xb', '{
    "hero.title": "Привіт",
    "hero.cta.label": "Вперед",
    "hero.image.alt": "Студія",
    "hero.lead": { "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Вступ" }] }] },
    "services.items.b2.title": "Два",
    "about.title": "Текст з коду",
    "about.cta.label": "Кнопка з коду"
  }') $$,
  'a translation of texts, labels, alt, rich text, collection items and fields from code is saved'
);

select throws_ok($$ select pg_temp.save('xb', '{"quote.visibility.hidden": "x"}') $$,
  '22023', null, 'a translation cannot hide a block');
select throws_ok($$ select pg_temp.save('xb', '{"hero.cta.newTab": "false"}') $$,
  '22023', null, 'a translation cannot change how a link opens');
select throws_ok($$ select pg_temp.save('xb', '{"quote.visibility": "x"}') $$,
  '22023', null, 'a translation cannot replace an optional value with a string');
select throws_ok($$ select pg_temp.save('xb', '{"hero.cta": "Go!"}') $$,
  '22023', null, 'a translation cannot replace a link value with a string');
select throws_ok($$ select pg_temp.save('xb', '{"services.items": "x"}') $$,
  '22023', null, 'a translation cannot replace a collection');
select throws_ok($$ select pg_temp.save('xb', '{"hero.lead.type": "x"}') $$,
  '22023', null, 'a translation cannot write inside a rich text document');
select throws_ok($$ select pg_temp.save('xb', '{"hero.lead": "flat"}') $$,
  '22023', null, 'a translation cannot turn rich text into a plain string');
select throws_ok($$ select pg_temp.save('xb', '{"hero.title": {"type": "doc", "content": []}}') $$,
  '22023', null, 'a translation cannot turn a text into a document');
select throws_ok($$ select pg_temp.save('xb', '{"hero.image.focal": "x"}') $$,
  '22023', null, 'a translation cannot change image settings');
select throws_ok($$ select pg_temp.save('xb', '{"hero.title": "Привіт", "quote.visibility.hidden": "x"}') $$,
  '22023', null, 'one forged leaf refuses the whole save');

select is(
  (select content from public.cms_page_draft
    where page_id = '00000000-0000-4000-8000-00000000f000' and locale = 'xb') ->> 'hero.title',
  'Привіт',
  'a refused save leaves the saved translation as it was'
);

select lives_ok(
  $$ select pg_temp.save('xa', '{"quote": {"visibility": {"hidden": false}}, "hero": {"cta": {"newTab": true, "label": "Go"}}}') $$,
  'the original is free: structure and switches are edited in the default language'
);

reset role;

-- A leaf stored before, which the original changed under, does not block a save.
-- The original now holds `hero.lead` as plain text; the draft translation still
-- holds the rich text it had.
update public.cms_page_draft
  set content = jsonb_build_object('hero', jsonb_build_object('title', 'Hi', 'lead', 'Plain lead'))
  where page_id = '00000000-0000-4000-8000-00000000f000' and locale = 'xa';
update public.cms_page_draft
  set content = '{"hero.title": "Привіт", "hero.lead": {"type": "doc", "content": []}}'
  where page_id = '00000000-0000-4000-8000-00000000f000' and locale = 'xb';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000f0e1", "role": "authenticated"}', true);

select lives_ok(
  $$ select pg_temp.save('xb', '{"hero.title": "Вітаю", "hero.lead": {"type": "doc", "content": []}}') $$,
  'an unchanged leaf that no longer fits does not block saving the other texts'
);

select throws_ok(
  $$ select pg_temp.save('xb', '{"hero.title": "Вітаю", "hero.lead": {"type": "doc", "content": [{"type": "paragraph"}]}}') $$,
  '22023', null, 'a changed leaf is checked against the current original'
);

select lives_ok(
  $$ select pg_temp.save('xb', '{"hero.title": "Вітаю", "hero.lead": "Простий вступ"}') $$,
  'the translation follows the new type of the field'
);

reset role;

select is(
  (select content from public.cms_page_draft
    where page_id = '00000000-0000-4000-8000-00000000f000' and locale = 'xb'),
  '{"hero.title": "Вітаю", "hero.lead": "Простий вступ"}'::jsonb,
  'the saved translation holds texts only'
);

select * from finish();

rollback;
