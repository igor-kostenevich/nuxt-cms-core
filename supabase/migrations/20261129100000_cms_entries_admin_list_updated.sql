-- CMS Core migration: the admin list shows when an entry last changed (014, stage 4).
--
-- `updated_at` of cms_entries_admin_list is the last draft save or publication;
-- the creation time only while there is neither. It took the latest of the
-- three, so an entry added later (seeded, imported) showed its creation as its
-- last change. Only that expression changes.

create or replace function public.cms_entries_admin_list(
  entry_type text,
  search text default null,
  archived boolean default false,
  sort text default 'manual',
  page_limit integer default 50,
  page_offset integer default 0,
  bootstrap_locale text default null
)
returns table (
  id uuid,
  title text,
  slug text,
  status text,
  updated_at timestamptz,
  published_at timestamptz,
  first_published_at timestamptz,
  archived_at timestamptz,
  sort_order integer,
  total bigint,
  order_version text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lang text := public.cms_default_locale(bootstrap_locale);
  pattern text := '%' || replace(replace(replace(coalesce(btrim(search), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  perform public.cms_require_permission('pages.edit');

  if sort not in ('manual', 'newest', 'title', 'updated') then
    raise exception 'Unknown sort "%"', sort
      using errcode = '23514';
  end if;

  return query
    with rows as (
      select
        e.id,
        coalesce(public.cms_entry_title_of(d.content), public.cms_entry_title_of(pub.content)) as title,
        coalesce(d.content ->> 'slug', pub.content ->> 'slug') as slug,
        case
          when e.archived_at is not null then 'archived'
          when pub.page_id is null then 'draft'
          when exists (select 1 from public.cms_page_draft any_draft where any_draft.page_id = e.id) then 'changed'
          else 'published'
        end as status,
        coalesce(
          greatest(
            (select max(x.updated_at) from public.cms_page_draft x where x.page_id = e.id),
            (select max(x.published_at) from public.cms_page_published x where x.page_id = e.id)
          ),
          e.created_at
        ) as updated_at,
        pub.published_at,
        e.first_published_at,
        e.archived_at,
        e.sort_order
      from public.cms_entries e
      left join public.cms_page_draft d on d.page_id = e.id and d.locale = lang
      left join public.cms_page_published pub on pub.page_id = e.id and pub.locale = lang
      where e.type = entry_type
        and (e.archived_at is not null) = coalesce(archived, false)
    )
    select r.id, r.title, r.slug, r.status, r.updated_at, r.published_at, r.first_published_at, r.archived_at, r.sort_order,
           count(*) over (),
           public.cms_entry_order_version(entry_type)
      from rows r
      where search is null or btrim(search) = '' or r.title ilike pattern escape '\'
      order by
        case when sort = 'manual' then r.sort_order end,
        case when sort = 'newest' then r.first_published_at end desc nulls first,
        case when sort = 'title' then lower(r.title) end,
        case when sort = 'updated' then r.updated_at end desc,
        r.id
      limit least(greatest(coalesce(page_limit, 50), 1), 500)
      offset greatest(coalesce(page_offset, 0), 0);
end;
$$;
