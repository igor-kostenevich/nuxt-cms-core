-- Localization (010): `npm run test:db`.
-- Self-contained: own users and page, one transaction, rolled back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select plan(52);

-- Fixture, written as the migration owner -------------------------------------

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000001001', 'owner-010@example.test'),
  ('00000000-0000-4000-8000-000000001002', 'admin-010@example.test'),
  ('00000000-0000-4000-8000-000000001003', 'editor-010@example.test');

insert into public.cms_users (user_id, role, status)
values
  ('00000000-0000-4000-8000-000000001001', 'owner', 'active'),
  ('00000000-0000-4000-8000-000000001002', 'admin', 'active'),
  ('00000000-0000-4000-8000-000000001003', 'editor', 'active');

-- Start from a site without languages, as after the migration. Locks of a
-- local Edit Mode session would block the change of the default language;
-- everything here is rolled back.
delete from public.cms_site_settings_translations;
delete from public.cms_site_texts;
delete from public.cms_languages;
delete from public.cms_page_locks where page_id is not null;

-- Internal helpers --------------------------------------------------------------

select ok(
  not has_function_privilege('authenticated', 'public.cms_content_set(jsonb, text[], jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.cms_content_remove(jsonb, text[])', 'execute'),
  'clients cannot call the content helpers'
);

-- The language of the original is fixed (010d, C-87): no conversion is left.
select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('cms_language_set_default', 'cms_page_rebase_pair', 'cms_translation_apply',
          'cms_translation_extract', 'cms_translation_addresses')
  ),
  'the change of the default language and its conversion helpers are gone'
);

-- applyTranslation in JS writes leaf by leaf with setAt; the Texts screen
-- writes the original with cms_content_set. Applied in the same order, both
-- must give the same document.
create function pg_temp.apply_leaves(base jsonb, leaves jsonb)
returns jsonb
language plpgsql
as $$
declare
  result jsonb := base;
  address text;
  next_doc jsonb;
begin
  for address in
    select t.key
      from jsonb_each(leaves) as t
      where t.key ~ '^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$'
        and not (string_to_array(t.key, '.') && array['__proto__', 'prototype', 'constructor'])
      order by cardinality(string_to_array(t.key, '.')), t.key collate "C"
  loop
    next_doc := public.cms_content_set(result, string_to_array(address, '.'), leaves -> address);

    if next_doc is not null then
      result := next_doc;
    end if;
  end loop;

  return result;
end;
$$;

-- The same fixture as tests/fixtures/translation.json: SQL and JS must agree.
select set_config('cms_test.base', $json$
{
  "hero": {
    "title": "Привіт",
    "cta": { "label": "Почати", "href": "/about" },
    "image": { "mediaId": "00000000-0000-4000-8000-000000000001", "alt": "Студія" }
  },
  "services": { "items": [{ "id": "a1", "title": "Один" }, { "id": "b2", "title": "Два" }] }
}
$json$, true);

select set_config('cms_test.translation', $json$
{
  "hero.title": "Hello",
  "hero.cta.label": "Start",
  "hero.image.alt": "Studio",
  "services.items.b2.title": "Two",
  "services.items.zz.title": "Gone",
  "about.lead": "Created",
  "hero.title.deep": "Not writable",
  "__proto__.polluted": "no",
  "bad key": "no"
}
$json$, true);

select is(
  pg_temp.apply_leaves(current_setting('cms_test.base')::jsonb, current_setting('cms_test.translation')::jsonb),
  $json$
  {
    "hero": {
      "title": "Hello",
      "cta": { "label": "Start", "href": "/about" },
      "image": { "mediaId": "00000000-0000-4000-8000-000000000001", "alt": "Studio" }
    },
    "services": { "items": [{ "id": "a1", "title": "Один" }, { "id": "b2", "title": "Two" }] },
    "about": { "lead": "Created" }
  }
  $json$::jsonb,
  'cms_content_set writes leaves like setAt / applyTranslation (fixture)'
);

select is(
  public.cms_content_remove(current_setting('cms_test.base')::jsonb, array['hero', 'cta', 'label']),
  $json$
  {
    "hero": {
      "title": "Привіт",
      "cta": { "href": "/about" },
      "image": { "mediaId": "00000000-0000-4000-8000-000000000001", "alt": "Студія" }
    },
    "services": { "items": [{ "id": "a1", "title": "Один" }, { "id": "b2", "title": "Два" }] }
  }
  $json$::jsonb,
  'cms_content_remove removes one leaf'
);

select is(
  public.cms_content_remove('{"hero": {"cta": {"label": "x"}}, "other": 1}', array['hero', 'cta', 'label']),
  '{"other": 1}'::jsonb,
  'cms_content_remove drops the objects it leaves empty'
);

select is(
  public.cms_content_remove(current_setting('cms_test.base')::jsonb, array['services', 'items', 'b2', 'title']),
  null,
  'cms_content_remove refuses an address through a stored list (no text from code behind it)'
);

-- Languages: who may change them ---------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000001002", "role": "authenticated"}', true);

select throws_ok(
  $$ select public.cms_language_add('uk', 'Ukrainian', 'Українська', true) $$,
  '42501', null, 'an admin cannot manage languages (owner only)'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000001001", "role": "authenticated"}', true);

select throws_ok(
  $$ select public.cms_language_add('uk', 'Ukrainian', 'Українська') $$,
  '23514', null, 'the first language must be added as the default'
);

select lives_ok(
  $$ select public.cms_language_add('uk', 'Ukrainian', 'Українська', true) $$,
  'the owner adds the first language as the default'
);

select throws_ok(
  $$ select public.cms_language_add('uk', 'Ukrainian', 'Українська') $$,
  'CMSCF', null, 'a language cannot be added twice'
);

select throws_ok(
  $$ select public.cms_language_add('en', 'English', 'English', true) $$,
  '23514', null, 'only the first language is added as the default'
);

select lives_ok(
  $$ select public.cms_language_add('en', 'English', 'English') $$,
  'the owner adds a second language'
);

select throws_ok(
  $$ select public.cms_language_add('en-gb', 'English', 'English') $$,
  '23514', null, 'a language code uses the canonical format'
);

select results_eq(
  $$ select code::text, is_default, active, sort_order from public.cms_languages order by sort_order $$,
  $$ values ('uk', true, true, 0), ('en', false, false, 1) $$,
  'the first language is the active default; a new one starts hidden, at the end'
);

select throws_ok(
  $$ select public.cms_language_set_active('uk', false) $$,
  '23514', null, 'the default language cannot be disabled'
);

select lives_ok(
  $$ select public.cms_language_reorder(array['en', 'uk']) $$,
  'the owner reorders languages'
);

select results_eq(
  $$ select code::text from public.cms_languages order by sort_order $$,
  $$ values ('en'), ('uk') $$,
  'the order follows the given codes'
);

select lives_ok(
  $$ select public.cms_language_set_active('en', false) $$,
  'the owner disables a language'
);

select results_eq(
  $$ select count(*)::int from public.cms_languages $$,
  $$ values (2) $$,
  'the owner sees disabled languages'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000001003", "role": "authenticated"}', true);

select results_eq(
  $$ select code::text from public.cms_languages where not active $$,
  $$ values ('en') $$,
  'an editor sees a hidden language: it is the one being translated'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000001001", "role": "authenticated"}', true);

reset role;
set local role anon;

select results_eq(
  $$ select code::text from public.cms_languages $$,
  $$ values ('uk') $$,
  'the public site sees active languages only'
);

select throws_ok(
  $$ insert into public.cms_languages (code, name, native_name) values ('de', 'German', 'Deutsch') $$,
  '42501', null, 'clients cannot write languages directly'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000001001", "role": "authenticated"}', true);
select public.cms_language_set_active('en', true);
select public.cms_language_reorder(array['uk', 'en']);

-- A page in two languages -----------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000001002", "role": "authenticated"}', true);
select set_config('cms_test.token', public.cms_page_lock_acquire('l10n-fixture')::text, true);

select isnt(
  public.cms_page_save_draft('l10n-fixture', 'uk', current_setting('cms_test.base')::jsonb, current_setting('cms_test.token')::uuid),
  null,
  'the base is saved in the default language'
);
select public.cms_page_publish('l10n-fixture', 'uk', current_setting('cms_test.token')::uuid);

select isnt(
  public.cms_page_save_draft(
    'l10n-fixture', 'en',
    '{"hero.title": "Hello", "hero.cta.label": "Start", "services.items.b2.title": "Two"}',
    current_setting('cms_test.token')::uuid
  ),
  null,
  'a translation is saved as a flat object of translated leaves'
);

select throws_ok(
  format($$ select public.cms_page_save_draft('l10n-fixture', 'en', '{"hero.cta.href": "/x"}', %L) $$, current_setting('cms_test.token')),
  '22023', null, 'a translation cannot carry an href'
);

select throws_ok(
  format($$ select public.cms_page_save_draft('l10n-fixture', 'en', '{"hero.image.mediaId": "x"}', %L) $$, current_setting('cms_test.token')),
  '22023', null, 'a translation cannot carry a media id'
);

select throws_ok(
  format($$ select public.cms_page_save_draft('l10n-fixture', 'en', '{"services": [{"id": "a1"}]}', %L) $$, current_setting('cms_test.token')),
  '22023', null, 'a translation cannot carry a subtree'
);

select throws_ok(
  format($$ select public.cms_page_save_draft('l10n-fixture', 'en', '{"hero": {"cta": {"href": "/x"}}}', %L) $$, current_setting('cms_test.token')),
  '22023', null, 'an object leaf must be a rich text document'
);

select throws_ok(
  format($$ select public.cms_page_save_draft('l10n-fixture', 'en', '["a"]', %L) $$, current_setting('cms_test.token')),
  '23514', null, 'a draft is an object (the table check)'
);

select throws_ok(
  format($$ select public.cms_page_save_draft('l10n-fixture', 'en', %L, %L) $$, '{"a.b.c.d.e.f.g.h.i.j.k.l.m": "x"}', current_setting('cms_test.token')),
  '22023', null, 'a translation address has a depth limit'
);

select throws_ok(
  format($$ select public.cms_page_save_draft('l10n-fixture', 'zz', '{"hero.title": "x"}', %L) $$, current_setting('cms_test.token')),
  '22023', null, 'a draft in an unknown language is refused'
);

-- The helpers are internal: call them as the owner of the schema.
reset role;
select lives_ok(
  $$ select public.cms_page_check_draft_shape('en', '{"hero.title": {"type": "doc", "content": []}, "hero.cta.label": "Start"}') $$,
  'a rich text leaf and a text leaf are accepted'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000001002", "role": "authenticated"}', true);

select results_eq(
  $$
    select d.draft ->> 'hero.title', d.base -> 'hero' ->> 'title', d.published
    from public.cms_page_get_editable('l10n-fixture', 'en', 'xx') d
  $$,
  $$ values ('Hello', 'Привіт', null::jsonb) $$,
  'the editor gets the translation draft and the base it applies to'
);

select public.cms_page_publish('l10n-fixture', 'en', current_setting('cms_test.token')::uuid);

select results_eq(
  $$
    select r.locale::text
    from public.cms_page_revisions r
    join public.cms_pages p on p.id = r.page_id
    where p.key = 'l10n-fixture'
    order by r.locale desc
  $$,
  $$ values ('uk'), ('en') $$,
  'each locale is published with its own revision'
);

select results_eq(
  $$ select locale, has_draft, published_at is not null from public.cms_page_locale_states('l10n-fixture') $$,
  $$ values ('en', false, true), ('uk', false, true) $$,
  'per-locale states are derived from the rows'
);

reset role;
set local role anon;

select results_eq(
  $$
    select default_locale, base -> 'hero' ->> 'title', translation ->> 'hero.title', locales
    from public.cms_page_get_localized('l10n-fixture', 'en', 'xx')
  $$,
  $$ values ('uk', 'Привіт', 'Hello', array['uk', 'en']) $$,
  'the public read returns the base, the translation and the published locales'
);

select results_eq(
  $$ select translation, locales from public.cms_page_get_localized('l10n-fixture', 'de', 'xx') $$,
  $$ values (null::jsonb, array['uk', 'en']) $$,
  'a locale without a translation reads the base only'
);

select results_eq(
  $$ select translation from public.cms_page_get_localized('l10n-fixture', null, 'xx') $$,
  $$ values (null::jsonb) $$,
  'no locale reads the default one'
);

select throws_ok(
  $$ select * from public.cms_page_get_editable('l10n-fixture', 'en', 'xx') $$,
  '42501', null, 'anon cannot read what the editor reads'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000001001", "role": "authenticated"}', true);
select public.cms_language_set_active('en', false);

reset role;
set local role anon;

select results_eq(
  $$ select translation, locales from public.cms_page_get_localized('l10n-fixture', 'en', 'xx') $$,
  $$ values (null::jsonb, array['uk']) $$,
  'a disabled language is not served, and not listed for hreflang'
);

select is_empty(
  $$ select 1 from public.cms_page_published where locale = 'en' $$,
  'the API does not return published rows of a disabled language either'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000001001", "role": "authenticated"}', true);
select public.cms_language_set_active('en', true);

-- Site settings per language --------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000001003", "role": "authenticated"}', true);

select throws_ok(
  $$ insert into public.cms_site_settings_translations (locale, site_name) values ('en', 'Studio') $$,
  '42501', null, 'an editor cannot write settings translations'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000001002", "role": "authenticated"}', true);

select lives_ok(
  $$ insert into public.cms_site_settings_translations (locale, site_name) values ('en', 'Studio EN') $$,
  'an admin writes the site name of another language'
);

-- What PostgREST sends for an upsert: every column is updated.
select lives_ok(
  $$
    insert into public.cms_site_settings_translations (locale, site_name) values ('en', 'Studio EN')
      on conflict (locale) do update set locale = excluded.locale, site_name = excluded.site_name
  $$,
  'an admin upserts the site name of another language the way the API does'
);

-- The language of the original cannot change, even past the RPCs -----------------

reset role;

select throws_ok(
  $$ update public.cms_languages set is_default = false where code = 'uk' $$,
  '23514', null, 'the default flag cannot be cleared, even directly'
);

select throws_ok(
  $$ update public.cms_languages set is_default = true where code = 'en' $$,
  '23514', null, 'another language cannot become the default, even directly'
);

select throws_ok(
  $$ delete from public.cms_languages where code = 'uk' $$,
  '23514', null, 'the default language row cannot be deleted while translations remain'
);

-- Deleting a language -------------------------------------------------------------

set local role authenticated;

select throws_ok(
  $$ select public.cms_language_delete('en') $$,
  '42501', null, 'an admin cannot delete a language (owner only)'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000001001", "role": "authenticated"}', true);

select throws_ok(
  $$ select public.cms_language_delete('uk') $$,
  '23514', null, 'the default language cannot be deleted'
);

select throws_ok(
  $$ select public.cms_language_delete('en') $$,
  'CMSCF', null, 'a language is not deleted while a page is open in Edit Mode'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000001002", "role": "authenticated"}', true);
select public.cms_page_lock_release('l10n-fixture', current_setting('cms_test.token')::uuid);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000001001", "role": "authenticated"}', true);

select lives_ok(
  $$ select public.cms_language_delete('en') $$,
  'the owner deletes a language'
);

reset role;

select results_eq(
  $$
    select
      (select count(*) from public.cms_languages where code = 'en')
      + (select count(*) from public.cms_page_draft where locale = 'en')
      + (select count(*) from public.cms_page_published where locale = 'en')
      + (select count(*) from public.cms_page_revisions where locale = 'en')
      + (select count(*) from public.cms_site_settings_translations where locale = 'en')
  $$,
  $$ values (0::bigint) $$,
  'deleting a language deletes everything written in it'
);

select * from finish();

rollback;
