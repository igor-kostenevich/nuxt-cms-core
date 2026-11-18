-- CMS Core migration: Localization (010).
--
-- Languages live in the database: a new language needs no migration and no
-- deploy (MASTER_PLAN C-15). A language is hidden while it is translated and
-- can be deleted together with its translations (C-83).
-- Exactly one language is the default, and it is always active.
--
-- Page content per locale (C-41) gets two roles (C-78):
--   default locale   the base: the full document, structure, media, hrefs,
--                    switches and the texts of that language
--   any other locale a translation: a flat object of translated leaves keyed
--                    by field address, { "hero.title": "…", "hero.cta.label": "…" }
-- A locale reads as the base with its translation applied; an untranslated
-- leaf shows the default locale. Draft / Publish / Revisions stay per
-- (page, locale) and are unchanged: a translation is just another object.
--
-- Until the first language is added the table is empty, and the site has one
-- language: `defaultLocale` from cms.config.ts. Functions that need the
-- default take it as `bootstrap_locale` for that case.

-- Permissions -------------------------------------------------------------------
-- Keep the matrix identical to app/auth/permissions.ts
-- (tests/permissions-sync.test.ts reads the newest definition).

create or replace function public.cms_can(requested text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case requested
        when 'settings.update' then role in ('owner', 'admin')
        when 'users.manage' then role = 'owner'
        when 'languages.manage' then role = 'owner'
        when 'pages.edit' then role in ('owner', 'admin', 'editor')
        when 'pages.publish' then role in ('owner', 'admin')
        when 'pages.unlock' then role in ('owner', 'admin')
        when 'media.upload' then role in ('owner', 'admin', 'editor')
        when 'media.edit' then role in ('owner', 'admin', 'editor')
        when 'media.delete' then role in ('owner', 'admin')
        else false
      end
      from public.cms_users
      where user_id = auth.uid()
        and status = 'active'
    ),
    false
  );
$$;

-- Languages ---------------------------------------------------------------------

create table public.cms_languages (
  code public.cms_locale primary key,
  -- English name and the name in the language itself: "Ukrainian", "Українська".
  name text not null,
  native_name text not null,
  active boolean not null default true,
  is_default boolean not null default false,
  -- Order of language switchers.
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint cms_languages_default_active check (not is_default or active),
  constraint cms_languages_name_length check (char_length(btrim(name)) between 1 and 100),
  constraint cms_languages_native_name_length check (char_length(btrim(native_name)) between 1 and 100)
);

comment on table public.cms_languages is
  'Languages of the site content. Hidden while translated; deleting one deletes its translations. Exactly one default, always active.';

-- At most one default; the functions below keep it at exactly one.
create unique index cms_languages_single_default
  on public.cms_languages (is_default)
  where is_default;

alter table public.cms_languages enable row level security;

-- The public site sees active languages. CMS users who edit pages see the
-- hidden ones too: a hidden language is one being translated (C-83).
-- Two policies: anon may not execute cms_can().
create policy "cms_languages_select_active"
  on public.cms_languages
  for select
  to anon
  using (active);

create policy "cms_languages_select_cms"
  on public.cms_languages
  for select
  to authenticated
  using (active or public.cms_can('pages.edit'));

-- Read only for clients. Writes go through the functions below.
revoke all on table public.cms_languages from anon, authenticated;
grant select on table public.cms_languages to anon, authenticated;

-- The default locale; `bootstrap_locale` while no language exists yet.
-- Runs as the caller: the default is active, so every client sees it.
create function public.cms_default_locale(bootstrap_locale text)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select l.code::text from public.cms_languages l where l.is_default),
    bootstrap_locale
  );
$$;

-- Whether content in a locale is served: an active language, or the
-- bootstrap locale while no language exists yet.
create function public.cms_locale_is_active(target_locale text, bootstrap_locale text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when exists (select 1 from public.cms_languages) then exists (
      select 1 from public.cms_languages l where l.code = target_locale and l.active
    )
    else target_locale = bootstrap_locale
  end;
$$;

-- Adds a language at the end of the order. A new language starts hidden from
-- the site: editors translate it first, then the owner shows it. The first
-- language of a site must be added as its default (`make_default`), active:
-- it is the language the existing content is written in. Later ones are not;
-- the default changes through cms_language_set_default, which converts the content.
create function public.cms_language_add(
  code text,
  name text,
  native_name text,
  make_default boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_first boolean;
begin
  perform public.cms_require_permission('languages.manage');

  -- Serializes concurrent adds, so two "first" languages cannot both become default.
  lock table public.cms_languages in share row exclusive mode;

  is_first := not exists (select 1 from public.cms_languages);

  if make_default <> is_first then
    raise exception 'Only the first language is added as the default'
      using errcode = '23514';
  end if;

  if exists (select 1 from public.cms_languages l where l.code = cms_language_add.code) then
    raise exception 'Language "%" already exists', code
      using errcode = 'CMSCF';
  end if;

  insert into public.cms_languages (code, name, native_name, active, is_default, sort_order)
    values (
      code,
      btrim(name),
      btrim(native_name),
      make_default,
      make_default,
      coalesce((select max(l.sort_order) + 1 from public.cms_languages l), 0)
    );
end;
$$;

create function public.cms_language_update(code text, name text, native_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.cms_require_permission('languages.manage');

  update public.cms_languages l
    set name = btrim(cms_language_update.name),
        native_name = btrim(cms_language_update.native_name)
    where l.code = cms_language_update.code;

  if not found then
    raise exception 'Language "%" does not exist', code
      using errcode = 'P0002';
  end if;
end;
$$;

-- Disables or re-enables a language. Its content stays: a disabled language
-- is only not served. The default language cannot be disabled.
create function public.cms_language_set_active(code text, active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_is_default boolean;
begin
  perform public.cms_require_permission('languages.manage');

  select l.is_default
    into target_is_default
    from public.cms_languages l
    where l.code = cms_language_set_active.code
    for update;

  if target_is_default is null then
    raise exception 'Language "%" does not exist', code
      using errcode = 'P0002';
  end if;

  if target_is_default and not active then
    raise exception 'The default language cannot be disabled'
      using errcode = '23514';
  end if;

  update public.cms_languages l
    set active = cms_language_set_active.active
    where l.code = cms_language_set_active.code;
end;
$$;

-- Sets the order: languages in `codes` get its order, in front of the rest.
create function public.cms_language_reorder(codes text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.cms_require_permission('languages.manage');

  -- Every row. Supabase rejects UPDATE / DELETE without WHERE (safeupdate),
  -- inside functions too, hence the explicit condition.
  update public.cms_languages l
    set sort_order = coalesce(
      array_position(codes, l.code::text) - 1,
      cardinality(codes) + l.sort_order
    )
    where l.code is not null;
end;
$$;

-- Content addresses ---------------------------------------------------------------
-- The same rules as getAt / setAt in app/primitives/paths.ts and
-- applyTranslation in app/primitives/translation.ts: segments are separated
-- by dots, a segment after an array is the id of an item (C-48). Missing
-- objects are created, a missing item is not: the address is then stale.

-- Value at the address, or null when a segment is missing.
create function public.cms_content_get(doc jsonb, address text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  node jsonb := doc;
  segment text;
begin
  foreach segment in array string_to_array(address, '.') loop
    if jsonb_typeof(node) = 'array' then
      select e.item
        into node
        from jsonb_array_elements(node) as e (item)
        where jsonb_typeof(e.item -> 'id') = 'string'
          and e.item ->> 'id' = segment
        limit 1;
    elsif jsonb_typeof(node) = 'object' then
      node := node -> segment;
    else
      return null;
    end if;

    if node is null then
      return null;
    end if;
  end loop;

  return node;
end;
$$;

-- The document with `value` at the address, or null when it cannot be written.
create function public.cms_content_set(doc jsonb, segments text[], value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  head text := segments[1];
  rest text[] := segments[2:];
  item_index integer;
  next_node jsonb;
begin
  if cardinality(segments) = 0 or value is null then
    return null;
  end if;

  if cardinality(segments) = 1 then
    if jsonb_typeof(doc) <> 'object' then
      return null;
    end if;

    return jsonb_set(doc, array[head], value, true);
  end if;

  if jsonb_typeof(doc) = 'array' then
    select (e.ord - 1)::integer
      into item_index
      from jsonb_array_elements(doc) with ordinality as e (item, ord)
      where jsonb_typeof(e.item -> 'id') = 'string'
        and e.item ->> 'id' = head
      limit 1;

    if item_index is null then
      return null;
    end if;

    next_node := public.cms_content_set(doc -> item_index, rest, value);

    if next_node is null then
      return null;
    end if;

    return jsonb_set(doc, array[item_index::text], next_node);
  end if;

  if jsonb_typeof(doc) = 'object' then
    next_node := coalesce(doc -> head, '{}'::jsonb);

    if jsonb_typeof(next_node) not in ('object', 'array') then
      return null;
    end if;

    next_node := public.cms_content_set(next_node, rest, value);

    if next_node is null then
      return null;
    end if;

    return jsonb_set(doc, array[head], next_node, true);
  end if;

  return null;
end;
$$;

-- Addresses of a translation that may be written, in write order: shorter
-- first, then by code point (the order of applyTranslation).
create function public.cms_translation_addresses(translation jsonb)
returns setof text
language sql
immutable
set search_path = ''
as $$
  select t.key
    from jsonb_each(case when jsonb_typeof(translation) = 'object' then translation else '{}'::jsonb end) as t
    where t.key ~ '^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$'
      and not (string_to_array(t.key, '.') && array['__proto__', 'prototype', 'constructor'])
    order by cardinality(string_to_array(t.key, '.')), t.key collate "C";
$$;

-- The base with the translation applied.
create function public.cms_translation_apply(base jsonb, translation jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  result jsonb := case when jsonb_typeof(base) = 'object' then base else '{}'::jsonb end;
  address text;
  value jsonb;
  next_doc jsonb;
begin
  for address in select public.cms_translation_addresses(translation) loop
    value := translation -> address;

    if value is null or jsonb_typeof(value) = 'null' then
      continue;
    end if;

    next_doc := public.cms_content_set(result, string_to_array(address, '.'), value);

    if next_doc is not null then
      result := next_doc;
    end if;
  end loop;

  return result;
end;
$$;

-- What the base says at the addresses of a translation, as a translation.
create function public.cms_translation_extract(base jsonb, translation jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(s.address, s.value), '{}'::jsonb)
    from (
      select a.address, public.cms_content_get(base, a.address) as value
        from public.cms_translation_addresses(translation) as a (address)
    ) s
    where s.value is not null
      and jsonb_typeof(s.value) <> 'null';
$$;

-- Page reads ----------------------------------------------------------------------
-- The reads of 009 return one document; a locale now needs the base too.

drop function public.cms_page_get_published(text, text);
drop function public.cms_page_get_draft(text, text);

-- Published content of a page in a locale, for the public site: the base, the
-- translation (only for an active language other than the default), the media
-- of the base, and the active locales the page is published in (hreflang).
-- No row when the page does not exist.
create function public.cms_page_get_localized(page_key text, page_locale text, bootstrap_locale text)
returns table (
  default_locale text,
  base jsonb,
  base_published_at timestamptz,
  translation jsonb,
  translation_published_at timestamptz,
  media jsonb,
  locales text[]
)
language sql
stable
set search_path = ''
as $$
  with lang as (
    select public.cms_default_locale(bootstrap_locale) as code
  ),
  page as (
    select p.id from public.cms_pages p where p.key = page_key
  ),
  base as (
    select pub.content, pub.published_at
      from public.cms_page_published pub, page, lang
      where pub.page_id = page.id
        and pub.locale = lang.code
  ),
  tr as (
    select pub.content, pub.published_at
      from public.cms_page_published pub, page, lang
      where pub.page_id = page.id
        and pub.locale = page_locale
        and page_locale <> lang.code
        and public.cms_locale_is_active(page_locale, bootstrap_locale)
  )
  select
    lang.code,
    base.content,
    base.published_at,
    tr.content,
    tr.published_at,
    public.cms_media_of(coalesce(base.content, '{}'::jsonb)),
    case
      when exists (select 1 from public.cms_languages) then array(
        select l.code::text
          from public.cms_languages l
          join public.cms_page_published pub on pub.locale = l.code and pub.page_id = page.id
          where l.active
          order by l.sort_order, l.code
      )
      else array(
        select pub.locale::text
          from public.cms_page_published pub
          where pub.page_id = page.id
            and pub.locale = bootstrap_locale
      )
    end
  from page
  cross join lang
  left join base on true
  left join tr on true;
$$;

-- What Edit Mode loads for a locale (null: the default): its saved draft and published version,
-- and, for a translation, the base it applies to (draft ?? published of the
-- default locale). Runs as the caller: RLS on cms_page_draft admits
-- pages.edit only. Returns a row for a page that does not exist yet.
create function public.cms_page_get_editable(page_key text, page_locale text, bootstrap_locale text)
returns table (
  default_locale text,
  base jsonb,
  draft jsonb,
  draft_updated_at timestamptz,
  published jsonb,
  published_at timestamptz,
  media jsonb
)
language plpgsql
stable
set search_path = ''
as $$
declare
  lang text := public.cms_default_locale(bootstrap_locale);
  target_page uuid;
  base_content jsonb;
  draft_content jsonb;
  draft_time timestamptz;
  published_content jsonb;
  published_time timestamptz;
begin
  -- No locale: the default one.
  page_locale := coalesce(page_locale, lang);

  select p.id into target_page from public.cms_pages p where p.key = page_key;

  if target_page is not null then
    select d.content, d.updated_at
      into draft_content, draft_time
      from public.cms_page_draft d
      where d.page_id = target_page
        and d.locale = page_locale;

    select pub.content, pub.published_at
      into published_content, published_time
      from public.cms_page_published pub
      where pub.page_id = target_page
        and pub.locale = page_locale;

    if page_locale is distinct from lang then
      base_content := coalesce(
        (select d.content from public.cms_page_draft d where d.page_id = target_page and d.locale = lang),
        (select pub.content from public.cms_page_published pub where pub.page_id = target_page and pub.locale = lang)
      );
    end if;
  end if;

  return query select
    lang,
    base_content,
    draft_content,
    draft_time,
    published_content,
    published_time,
    public.cms_media_of(jsonb_build_array(base_content, draft_content, published_content));
end;
$$;

-- Per-locale state of a page for the language switcher: derived from the
-- rows, not kept by hand (Б9 §22). A locale without a row is not translated.
create function public.cms_page_locale_states(page_key text)
returns table (locale text, has_draft boolean, published_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select s.locale, bool_or(s.is_draft), max(s.published_at)
    from (
      select d.locale::text as locale, true as is_draft, null::timestamptz as published_at
        from public.cms_page_draft d
        join public.cms_pages p on p.id = d.page_id
        where p.key = page_key
      union all
      select pub.locale::text, false, pub.published_at
        from public.cms_page_published pub
        join public.cms_pages p on p.id = pub.page_id
        where p.key = page_key
    ) s
    group by s.locale
    order by s.locale;
$$;

-- Revisions -----------------------------------------------------------------------
-- A revision remembers whether it was a base or a translation. After the
-- default locale changes, a revision of the other role no longer fits the
-- locale and cannot be restored.

alter table public.cms_page_revisions
  add column base boolean not null default true;

create or replace function public.cms_page_publish(
  page_key text,
  page_locale text,
  lock_token uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  held_page_id uuid;
  draft_content jsonb;
  publication_time timestamptz := now();
  default_code text := public.cms_default_locale(null);
begin
  perform public.cms_require_permission('pages.publish');
  held_page_id := public.cms_page_held_lock(page_key, lock_token);

  delete from public.cms_page_draft
    where page_id = held_page_id
      and locale = page_locale
    returning content into draft_content;

  if draft_content is null then
    raise exception 'Page "%" has no draft to publish in locale "%"', page_key, page_locale
      using errcode = 'P0002';
  end if;

  insert into public.cms_page_revisions (page_id, locale, content, created_at, created_by, base)
    values (
      held_page_id,
      page_locale,
      draft_content,
      publication_time,
      auth.uid(),
      default_code is null or default_code = page_locale
    );

  insert into public.cms_page_published as pp (page_id, locale, content, published_at)
    values (held_page_id, page_locale, draft_content, publication_time)
    on conflict (page_id, locale) do update
      set content = excluded.content,
          published_at = excluded.published_at;

  return publication_time;
end;
$$;

create or replace function public.cms_page_restore(
  page_key text,
  page_locale text,
  revision_id uuid,
  lock_token uuid,
  replace_draft boolean default false
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  held_page_id uuid;
  revision_content jsonb;
  revision_base boolean;
  default_code text := public.cms_default_locale(null);
begin
  perform public.cms_require_permission('pages.edit');
  held_page_id := public.cms_page_held_lock(page_key, lock_token);

  select r.content, r.base
    into revision_content, revision_base
    from public.cms_page_revisions r
    where r.id = revision_id
      and r.page_id = held_page_id
      and r.locale = page_locale;

  if revision_content is null then
    raise exception 'Revision % does not belong to page "%" in locale "%"', revision_id, page_key, page_locale
      using errcode = 'P0002';
  end if;

  if revision_base is distinct from (default_code is null or default_code = page_locale) then
    raise exception 'Revision % was published before the default language changed', revision_id
      using errcode = 'CMSCF';
  end if;

  if not replace_draft and exists (
    select 1
      from public.cms_page_draft d
      where d.page_id = held_page_id
        and d.locale = page_locale
  ) then
    raise exception 'Page "%" already has a draft in locale "%"', page_key, page_locale
      using errcode = 'CMSCF';
  end if;

  return public.cms_page_write_draft(held_page_id, page_locale, revision_content);
end;
$$;

-- Site settings per language (D-30) --------------------------------------------------
-- Texts only; contacts are shared. The value of the default locale stays in
-- cms_site_settings, the same base / translation split as pages.

create table public.cms_site_settings_translations (
  locale public.cms_locale primary key references public.cms_languages (code),
  site_name text not null default '',
  updated_at timestamptz not null default now()
);

comment on table public.cms_site_settings_translations is
  'Texts of the site settings in a language other than the default. An empty value shows the default.';

create trigger cms_site_settings_translations_touch_updated_at
  before update on public.cms_site_settings_translations
  for each row
  execute function public.cms_touch_updated_at();

alter table public.cms_site_settings_translations enable row level security;

create policy "cms_site_settings_translations_select_all"
  on public.cms_site_settings_translations
  for select
  to anon, authenticated
  using (true);

create policy "cms_site_settings_translations_insert_cms"
  on public.cms_site_settings_translations
  for insert
  to authenticated
  with check (public.cms_can('settings.update'));

create policy "cms_site_settings_translations_update_cms"
  on public.cms_site_settings_translations
  for update
  to authenticated
  using (public.cms_can('settings.update'))
  with check (public.cms_can('settings.update'));

revoke all on table public.cms_site_settings_translations from anon, authenticated;
grant select on table public.cms_site_settings_translations to anon, authenticated;
-- An upsert updates every column it sends: locale needs the update grant too.
grant insert (locale, site_name), update (locale, site_name)
  on table public.cms_site_settings_translations
  to authenticated;

-- Change of the default language ---------------------------------------------------
-- The base moves to the new default: for every page, the translated leaves
-- of the new default go into the base, and the base values they replace
-- become the translation of the old default. Every locale shows exactly what
-- it showed before. Published and draft are converted separately; a draft
-- that ends up equal to its published version is removed (C-53).
--
-- Refused while a page is being edited: an open session holds a document in
-- the old roles. Stale locks are removed, so such a session cannot save
-- into the converted content later (it gets lock_lost).

create function public.cms_page_rebase_pair(
  target_page uuid,
  old_code text,
  new_code text,
  old_base jsonb,
  new_translation jsonb,
  is_draft boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_base jsonb := public.cms_translation_apply(old_base, new_translation);
  next_translation jsonb := public.cms_translation_extract(old_base, new_translation);
begin
  -- Defence in depth: it is revoked from clients, but a later grant by
  -- mistake must not open a way to write published content.
  perform public.cms_require_permission('languages.manage');

  if is_draft then
    insert into public.cms_page_draft (page_id, locale, content, updated_by)
      values (target_page, new_code, next_base, auth.uid())
      on conflict (page_id, locale) do update
        set content = excluded.content, updated_at = now(), updated_by = excluded.updated_by;

    if old_base is not null then
      insert into public.cms_page_draft (page_id, locale, content, updated_by)
        values (target_page, old_code, next_translation, auth.uid())
        on conflict (page_id, locale) do update
          set content = excluded.content, updated_at = now(), updated_by = excluded.updated_by;
    end if;
  else
    insert into public.cms_page_published (page_id, locale, content)
      values (target_page, new_code, next_base)
      on conflict (page_id, locale) do update set content = excluded.content;

    if old_base is not null then
      insert into public.cms_page_published (page_id, locale, content)
        values (target_page, old_code, next_translation)
        on conflict (page_id, locale) do update set content = excluded.content;
    end if;
  end if;
end;
$$;

create function public.cms_language_set_default(code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_code text;
  target_active boolean;
  page record;
  old_published jsonb;
  new_published jsonb;
  old_draft jsonb;
  new_draft jsonb;
begin
  perform public.cms_require_permission('languages.manage');

  lock table public.cms_languages in share row exclusive mode;

  select l.active
    into target_active
    from public.cms_languages l
    where l.code = cms_language_set_default.code;

  if target_active is null then
    raise exception 'Language "%" does not exist', code
      using errcode = 'P0002';
  end if;

  if not target_active then
    raise exception 'A disabled language cannot be the default'
      using errcode = '23514';
  end if;

  select l.code::text into old_code from public.cms_languages l where l.is_default;

  if old_code = code then
    return;
  end if;

  -- No page may be open in Edit Mode. Waits for a running save or publish.
  perform 1 from public.cms_page_locks for update;

  if exists (
    select 1
      from public.cms_page_locks
      where heartbeat_at > now() - public.cms_page_lock_ttl()
  ) then
    raise exception 'A page is being edited'
      using errcode = 'CMSCF';
  end if;

  -- Every lock (stale ones are left). WHERE for safeupdate, see cms_language_reorder.
  delete from public.cms_page_locks where page_id is not null;

  for page in select p.id from public.cms_pages p loop
    select pub.content into old_published
      from public.cms_page_published pub where pub.page_id = page.id and pub.locale = old_code;
    select pub.content into new_published
      from public.cms_page_published pub where pub.page_id = page.id and pub.locale = code;
    select d.content into old_draft
      from public.cms_page_draft d where d.page_id = page.id and d.locale = old_code;
    select d.content into new_draft
      from public.cms_page_draft d where d.page_id = page.id and d.locale = code;

    if old_published is not null or new_published is not null then
      perform public.cms_page_rebase_pair(page.id, old_code, code, old_published, new_published, false);
    end if;

    if old_draft is not null or new_draft is not null then
      perform public.cms_page_rebase_pair(
        page.id, old_code, code,
        coalesce(old_draft, old_published),
        coalesce(new_draft, new_published),
        true
      );
    end if;

    -- A draft equal to what is now published has nothing to publish.
    delete from public.cms_page_draft d
      using public.cms_page_published pub
      where d.page_id = page.id
        and pub.page_id = d.page_id
        and pub.locale = d.locale
        and pub.content = d.content;
  end loop;

  -- Site settings: the same swap for the texts.
  insert into public.cms_site_settings_translations (locale, site_name)
    select old_code, s.site_name from public.cms_site_settings s where s.id = 1
    on conflict (locale) do update set site_name = excluded.site_name;

  update public.cms_site_settings s
    set site_name = t.site_name
    from public.cms_site_settings_translations t
    where s.id = 1
      and t.locale = code
      and btrim(t.site_name) <> '';

  delete from public.cms_site_settings_translations t where t.locale = code;

  update public.cms_languages l set is_default = false where l.code = old_code;
  update public.cms_languages l set is_default = true where l.code = cms_language_set_default.code;
end;
$$;

-- Disabled languages are not served (C-83) -----------------------------------------
-- The public site reads published rows through the API too, so the filter is
-- in the policy, not only in cms_page_get_localized. Signed-in CMS users keep
-- seeing every language: the editor works on a disabled language as well.
-- While no language exists, every locale is served (the bootstrap state).

drop policy "cms_page_published_select_all" on public.cms_page_published;

create policy "cms_page_published_select_anon"
  on public.cms_page_published
  for select
  to anon
  using (
    not exists (select 1 from public.cms_languages)
    or exists (select 1 from public.cms_languages l where l.code = locale and l.active)
  );

create policy "cms_page_published_select_cms"
  on public.cms_page_published
  for select
  to authenticated
  using (true);

drop policy "cms_site_settings_translations_select_all" on public.cms_site_settings_translations;

create policy "cms_site_settings_translations_select_anon"
  on public.cms_site_settings_translations
  for select
  to anon
  using (
    exists (select 1 from public.cms_languages l where l.code = locale and l.active)
  );

create policy "cms_site_settings_translations_select_cms"
  on public.cms_site_settings_translations
  for select
  to authenticated
  using (true);

-- Shape of a saved draft ----------------------------------------------------------
-- A language other than the default holds a translation: a flat object of
-- text leaves keyed by field address (C-78). The server enforces that, so a
-- translation cannot carry hrefs, media ids, subtrees or addresses deep
-- enough to make the recursive helpers fail.

create function public.cms_page_check_draft_shape(target_locale text, next_content jsonb)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  default_code text;
  entry record;
  segments text[];
begin
  -- A malformed code is refused by the cms_locale domain (check violation).
  perform target_locale::public.cms_locale;

  if not exists (select 1 from public.cms_languages) then
    return;
  end if;

  if not exists (select 1 from public.cms_languages l where l.code = target_locale) then
    raise exception 'Locale "%" is not a language of this site', target_locale
      using errcode = '22023';
  end if;

  select l.code::text into default_code from public.cms_languages l where l.is_default;

  if target_locale = default_code then
    return;
  end if;

  -- Not an object: the table check refuses it.
  if jsonb_typeof(next_content) <> 'object' then
    return;
  end if;

  if (select count(*) from jsonb_object_keys(next_content)) > 1000 then
    raise exception 'A translation holds too many leaves' using errcode = '22023';
  end if;

  for entry in select e.key, e.value from jsonb_each(next_content) as e loop
    segments := string_to_array(entry.key, '.');

    if length(entry.key) > 200
      or cardinality(segments) > 12
      or entry.key !~ '^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$'
      or segments && array['__proto__', 'prototype', 'constructor']
      or segments[cardinality(segments)] in ('href', 'mediaId', 'id')
      -- A leaf is a text or a rich text document, never a subtree.
      or not (
        jsonb_typeof(entry.value) in ('string', 'null')
        or (jsonb_typeof(entry.value) = 'object' and coalesce(entry.value ->> 'type', '') = 'doc')
      )
    then
      raise exception 'Address "%" cannot be translated', left(entry.key, 80)
        using errcode = '22023';
    end if;
  end loop;
end;
$$;

create or replace function public.cms_page_write_draft(target_page_id uuid, target_locale text, next_content jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  published_content jsonb;
  saved_at timestamptz;
begin
  perform public.cms_page_check_draft_shape(target_locale, next_content);

  select content
    into published_content
    from public.cms_page_published
    where page_id = target_page_id
      and locale = target_locale;

  if published_content is not null and published_content = next_content then
    delete from public.cms_page_draft
      where page_id = target_page_id
        and locale = target_locale;

    return null;
  end if;

  insert into public.cms_page_draft (page_id, locale, content, updated_by)
    values (target_page_id, target_locale, next_content, auth.uid())
    on conflict (page_id, locale) do update
      set content = excluded.content,
          updated_at = now(),
          updated_by = excluded.updated_by
    returning updated_at into saved_at;

  return saved_at;
end;
$$;

-- Deleting a language ------------------------------------------------------------
-- Removes a language and everything written in it: drafts, published
-- translations, their revisions and the site name. Cannot be undone; the
-- admin asks first. The default language cannot be deleted: the other
-- languages are translations of it. Refused while a page is open in Edit
-- Mode, since that session could save into the language again; stale locks
-- are removed for the same reason.

create function public.cms_language_delete(code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_is_default boolean;
begin
  perform public.cms_require_permission('languages.manage');

  lock table public.cms_languages in share row exclusive mode;

  select l.is_default
    into target_is_default
    from public.cms_languages l
    where l.code = cms_language_delete.code;

  if target_is_default is null then
    raise exception 'Language "%" does not exist', code
      using errcode = 'P0002';
  end if;

  if target_is_default then
    raise exception 'The default language cannot be deleted'
      using errcode = '23514';
  end if;

  perform 1 from public.cms_page_locks where page_id is not null for update;

  if exists (
    select 1
      from public.cms_page_locks
      where heartbeat_at > now() - public.cms_page_lock_ttl()
  ) then
    raise exception 'A page is being edited'
      using errcode = 'CMSCF';
  end if;

  delete from public.cms_page_locks where page_id is not null;
  delete from public.cms_page_draft d where d.locale = code;
  delete from public.cms_page_published pub where pub.locale = code;
  delete from public.cms_page_revisions r where r.locale = code;
  delete from public.cms_site_settings_translations t where t.locale = code;
  delete from public.cms_languages l where l.code = cms_language_delete.code;
end;
$$;

-- Grants --------------------------------------------------------------------------

revoke all on function public.cms_default_locale(text) from public, anon, authenticated;
revoke all on function public.cms_locale_is_active(text, text) from public, anon, authenticated;
revoke all on function public.cms_language_add(text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.cms_language_update(text, text, text) from public, anon, authenticated;
revoke all on function public.cms_language_set_active(text, boolean) from public, anon, authenticated;
revoke all on function public.cms_language_reorder(text[]) from public, anon, authenticated;
revoke all on function public.cms_language_set_default(text) from public, anon, authenticated;
revoke all on function public.cms_language_delete(text) from public, anon, authenticated;
revoke all on function public.cms_content_get(jsonb, text) from public, anon, authenticated;
revoke all on function public.cms_content_set(jsonb, text[], jsonb) from public, anon, authenticated;
revoke all on function public.cms_translation_addresses(jsonb) from public, anon, authenticated;
revoke all on function public.cms_translation_apply(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.cms_translation_extract(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.cms_page_rebase_pair(uuid, text, text, jsonb, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.cms_page_check_draft_shape(text, jsonb) from public, anon, authenticated;
revoke all on function public.cms_page_get_localized(text, text, text) from public, anon, authenticated;
revoke all on function public.cms_page_get_editable(text, text, text) from public, anon, authenticated;
revoke all on function public.cms_page_locale_states(text) from public, anon, authenticated;

-- Helpers the caller-run reads use.
grant execute on function public.cms_default_locale(text) to anon, authenticated;
grant execute on function public.cms_locale_is_active(text, text) to anon, authenticated;
grant execute on function public.cms_language_add(text, text, text, boolean) to authenticated;
grant execute on function public.cms_language_update(text, text, text) to authenticated;
grant execute on function public.cms_language_set_active(text, boolean) to authenticated;
grant execute on function public.cms_language_reorder(text[]) to authenticated;
grant execute on function public.cms_language_set_default(text) to authenticated;
grant execute on function public.cms_language_delete(text) to authenticated;
grant execute on function public.cms_page_get_localized(text, text, text) to anon, authenticated;
grant execute on function public.cms_page_get_editable(text, text, text) to authenticated;
grant execute on function public.cms_page_locale_states(text) to authenticated;
