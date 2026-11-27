-- CMS Core migration: public reads of entries (014, stage 3).
--
-- What the site shows of an entry: its publication in the language of the
-- original, with the translation of the requested language applied by the
-- client (C-78), and the media both reference (C-76). One request per page
-- (an entry) or per list.
--
-- Both functions run as the caller (RLS is the second layer) and filter
-- explicitly in their body: published in the original, not archived, an
-- active language. A signed-in editor looking at the site passes the
-- `pages.edit` branch of RLS, so without this filter they would see archived
-- and never-published entries in public lists. Drafts are never read here.
--
-- Addresses: an entry is found by its effective slug in the requested
-- language (own, else the original's, 014 §6); `slugs` gives the effective
-- slug of every active language, for language links and hreflang.

-- Effective slugs of an entry in the active languages (the original in the
-- bootstrap state without languages).
create function public.cms_entry_public_slugs(entry_id uuid, bootstrap_locale text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with lang as (
    select coalesce(public.cms_default_locale(bootstrap_locale), bootstrap_locale) as code
  ),
  langs as (
    select l.code::text as code from public.cms_languages l where l.active
    union
    select lang.code from lang where not exists (select 1 from public.cms_languages)
  )
  select coalesce(jsonb_object_agg(langs.code, coalesce(own.slug, original.slug)) filter (where coalesce(own.slug, original.slug) is not null), '{}'::jsonb)
    from langs
    cross join lang
    left join public.cms_entry_slugs own on own.entry_id = cms_entry_public_slugs.entry_id and own.locale = langs.code
    left join public.cms_entry_slugs original on original.entry_id = cms_entry_public_slugs.entry_id and original.locale = lang.code;
$$;

-- One entry of a type by its address in a language. No row: no such public
-- entry (the page is a 404).
create function public.cms_entry_get_localized(entry_type text, slug text, entry_locale text, bootstrap_locale text)
returns table (
  id uuid,
  default_locale text,
  base jsonb,
  base_published_at timestamptz,
  translation jsonb,
  translation_published_at timestamptz,
  first_published_at timestamptz,
  media jsonb,
  slugs jsonb
)
language sql
stable
set search_path = ''
as $$
  with lang as (
    select coalesce(public.cms_default_locale(bootstrap_locale), bootstrap_locale) as code
  ),
  requested as (
    select coalesce(entry_locale, lang.code) as code from lang
  ),
  entry as (
    select e.id, e.first_published_at
      from public.cms_entries e
      cross join lang
      cross join requested
      left join public.cms_entry_slugs own on own.entry_id = e.id and own.locale = requested.code
      left join public.cms_entry_slugs original on original.entry_id = e.id and original.locale = lang.code
      where e.type = entry_type
        and e.archived_at is null
        and coalesce(own.slug, original.slug) = cms_entry_get_localized.slug
        and (requested.code = lang.code or public.cms_locale_is_active(requested.code, bootstrap_locale))
      limit 1
  ),
  base as (
    select pub.content, pub.published_at
      from public.cms_page_published pub, entry, lang
      where pub.page_id = entry.id
        and pub.locale = lang.code
  ),
  tr as (
    select pub.content, pub.published_at
      from public.cms_page_published pub, entry, lang, requested
      where pub.page_id = entry.id
        and pub.locale = requested.code
        and requested.code <> lang.code
  )
  select
    entry.id,
    lang.code,
    base.content,
    base.published_at,
    tr.content,
    tr.published_at,
    entry.first_published_at,
    public.cms_media_of(jsonb_build_array(base.content, tr.content)),
    public.cms_entry_public_slugs(entry.id, bootstrap_locale)
  from entry
  cross join lang
  join base on true
  left join tr on true;
$$;

-- Published entries of a type in a language: by ids (Manual: their order,
-- missing and hidden ones left out) or a page of the type (Automatic), with
-- the media of every entry. `total`: every match, not only this page.
create function public.cms_entries_get_published(
  entry_type text,
  entry_locale text,
  ids uuid[] default null,
  sort text default 'newest',
  page_limit integer default 20,
  page_offset integer default 0,
  bootstrap_locale text default null
)
returns table (
  id uuid,
  default_locale text,
  base jsonb,
  base_published_at timestamptz,
  translation jsonb,
  translation_published_at timestamptz,
  first_published_at timestamptz,
  slug text,
  media jsonb,
  total bigint
)
language sql
stable
set search_path = ''
as $$
  with lang as (
    select coalesce(public.cms_default_locale(bootstrap_locale), bootstrap_locale) as code
  ),
  requested as (
    select coalesce(entry_locale, lang.code) as code from lang
  ),
  matched as (
    select
      e.id,
      lang.code as default_locale,
      e.sort_order,
      e.first_published_at,
      base.content as base,
      base.published_at as base_published_at,
      tr.content as translation,
      tr.published_at as translation_published_at,
      coalesce(own.slug, original.slug) as slug,
      array_position(ids, e.id) as picked
    from public.cms_entries e
    cross join lang
    cross join requested
    join public.cms_page_published base on base.page_id = e.id and base.locale = lang.code
    left join public.cms_page_published tr on tr.page_id = e.id and tr.locale = requested.code and requested.code <> lang.code
    left join public.cms_entry_slugs own on own.entry_id = e.id and own.locale = requested.code
    left join public.cms_entry_slugs original on original.entry_id = e.id and original.locale = lang.code
    where e.type = entry_type
      and e.archived_at is null
      and (requested.code = lang.code or public.cms_locale_is_active(requested.code, bootstrap_locale))
      and (ids is null or e.id = any (ids))
  )
  select
    r.id,
    r.default_locale,
    r.base,
    r.base_published_at,
    r.translation,
    r.translation_published_at,
    r.first_published_at,
    r.slug,
    public.cms_media_of(jsonb_build_array(r.base, r.translation)),
    count(*) over ()
  from matched r
  order by
    r.picked,
    case when sort = 'manual' then r.sort_order end,
    case when sort = 'newest' then r.first_published_at end desc nulls last,
    case when sort = 'title' then lower(coalesce(r.translation ->> 'title', r.base ->> 'title')) end,
    r.id
  limit least(greatest(coalesce(page_limit, 20), 1), 100)
  offset greatest(coalesce(page_offset, 0), 0);
$$;

revoke all on function public.cms_entry_public_slugs(uuid, text) from public;
revoke all on function public.cms_entry_get_localized(text, text, text, text) from public;
revoke all on function public.cms_entries_get_published(text, text, uuid[], text, integer, integer, text) from public;

-- Invoker functions read with the caller's rights: the helper is executed by
-- anon too, and sees only what RLS lets through.
grant execute on function public.cms_entry_public_slugs(uuid, text) to anon, authenticated;
grant execute on function public.cms_entry_get_localized(text, text, text, text) to anon, authenticated;
grant execute on function public.cms_entries_get_published(text, text, uuid[], text, integer, integer, text) to anon, authenticated;
