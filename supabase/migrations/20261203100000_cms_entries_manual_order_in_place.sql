-- 014 (after the author's review of the lists): in the manual order an entry
-- taken off the site keeps its place; only its status changes. So:
--   * the admin list in the order of the site no longer puts entries off the
--     site last;
--   * Unarchive no longer moves the entry to the top: it comes back where it was;
--   * reorder saves the order of the live entries in the places live entries
--     occupy, and renumbers the whole list: an entry off the site keeps its
--     place between them. The contract is the same: `ids` are the live entries,
--     the version is the order of the live ones.

create or replace function public.cms_entry_unarchive(entry_type text, entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event record;
begin
  perform public.cms_require_permission('pages.publish');
  perform public.cms_entry_lock_row(entry_type, entry_id);

  update public.cms_entries e
    set archived_at = null
    where e.id = entry_id
      and e.archived_at is not null;

  if found then
    select * into event from public.cms_document_event(entry_id);
    perform public.cms_activity_log('unarchive', 'entry', entry_id::text, event.entity_label, null, null, event.details);
  end if;
end;
$$;

create or replace function public.cms_entry_reorder(entry_type text, ids uuid[], expected_version text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.cms_require_permission('pages.publish');

  if ids is null or cardinality(ids) > 500 then
    raise exception 'The order is a list of up to 500 entries'
      using errcode = '23514';
  end if;

  -- Every row of the type: the entries off the site are renumbered too, and a
  -- concurrent reorder, archive or unarchive waits.
  perform 1
    from public.cms_entries e
    where e.type = entry_type
    order by e.id
    for update;

  if expected_version is distinct from public.cms_entry_order_version(entry_type) then
    raise exception 'The order changed meanwhile'
      using errcode = 'CMSCF';
  end if;

  if cardinality(ids) <> (select count(distinct x) from unnest(ids) x)
    or cardinality(ids) <> (select count(*) from public.cms_entries e where e.type = entry_type and e.archived_at is null)
    or exists (
      select 1
        from unnest(ids) x
        where not exists (
          select 1 from public.cms_entries e where e.id = x and e.type = entry_type and e.archived_at is null
        )
    ) then
    raise exception 'The order must list every live entry of the type once'
      using errcode = 'CMSCF';
  end if;

  -- The places of the live entries, in order; the new order fills them one by
  -- one. Entries off the site stay in theirs. Everything is renumbered 0…n-1.
  update public.cms_entries e
    set sort_order = f.position - 1
    from (
      select o.id, o.position
        from (
          select x.id, x.archived, row_number() over (order by x.sort_order, x.id)::integer as position
            from (
              select c.id, c.sort_order, c.archived_at is not null as archived
                from public.cms_entries c
                where c.type = entry_type
            ) x
        ) o
        where o.archived
      union all
      select n.id, s.position
        from unnest(ids) with ordinality as n (id, nth)
        join (
          select o.position, row_number() over (order by o.position)::integer as nth
            from (
              select x.archived, row_number() over (order by x.sort_order, x.id)::integer as position
                from (
                  select c.sort_order, c.id, c.archived_at is not null as archived
                    from public.cms_entries c
                    where c.type = entry_type
                ) x
            ) o
            where not o.archived
        ) s on s.nth = n.nth
    ) f
    where e.id = f.id
      and e.sort_order is distinct from f.position - 1;

  perform public.cms_activity_log('reorder', 'entry', null, entry_type, null, null, jsonb_build_object('type', entry_type));

  return public.cms_entry_order_version(entry_type);
end;
$$;

create or replace function public.cms_entries_admin_list(
  entry_type text,
  search text default null,
  archived boolean default false,
  sort text default 'manual',
  page_limit integer default 50,
  page_offset integer default 0,
  bootstrap_locale text default null,
  status_filter text[] default null
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

  if exists (select 1 from unnest(status_filter) as s(value)
             where s.value is null or s.value not in ('draft', 'published', 'changed', 'archived')) then
    raise exception 'Unknown status in %', status_filter
      using errcode = '23514';
  end if;

  return query
    with rows as (
      select
        e.id,
        coalesce(public.cms_entry_title_of(d.content), public.cms_entry_title_of(pub.content)) as title,
        -- The address on the site once published (the list links to it), else the draft's.
        coalesce(pub.content ->> 'slug', d.content ->> 'slug') as slug,
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
        and (archived is null or (e.archived_at is not null) = archived)
    )
    select r.id, r.title, r.slug, r.status, r.updated_at, r.published_at, r.first_published_at, r.archived_at, r.sort_order,
           count(*) over (),
           public.cms_entry_order_version(entry_type)
      from rows r
      where (search is null or btrim(search) = '' or r.title ilike pattern escape '\')
        and (coalesce(cardinality(status_filter), 0) = 0 or r.status = any (status_filter))
      order by
        -- The whole list in the order of the site: an entry taken off the site
        -- keeps its place and only its status changes.
        case when sort = 'manual' then r.sort_order end,
        case when sort = 'newest' then r.first_published_at end desc nulls first,
        case when sort = 'title' then lower(r.title) end,
        case when sort = 'updated' then r.updated_at end desc,
        r.id
      limit least(greatest(coalesce(page_limit, 50), 1), 500)
      offset greatest(coalesce(page_offset, 0), 0);
end;
$$;

