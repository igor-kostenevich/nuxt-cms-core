-- 014 review (X-3): the public list by ids takes at most 100 ids, checked on the
-- server. The ids are matched per row (`array_position`), so an unbounded array
-- from anon was a cheap way to load the database. 100 is also the largest page.
-- Same signature, so the grants of 20261128100000 stay; plpgsql only for the check.

create or replace function public.cms_entries_get_published(
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
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
begin
  if cardinality(ids) > 100 then
    raise exception 'Up to 100 entries can be read by id'
      using errcode = '23514';
  end if;

  return query
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
end;
$$;
