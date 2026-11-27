-- CMS Core migration: managing entries and media in use (014, stage 2c).
--
-- 1. Archive / Unarchive (C-53 for entries): the record leaves the public site
--    and comes back. Content, publications, addresses and history stay as they
--    are: the archive is a flag, not a copy. An entry open in the editor
--    (a live lock) is not archived under the editor's hands.
-- 2. Manual order (014 §8.1): one save of the complete order of a type,
--    checked against the version the screen showed (md5 of the ordered ids),
--    so nobody silently overwrites another order; it applies at once (order
--    is identity metadata, not content) and writes one Activity event.
-- 3. The admin list of a type and the status of chosen entries.
-- 4. Media in use (author's decision, 2c; changes C-77): an item that any
--    content uses (pages, entries, archived ones included, Brand) cannot be
--    deleted. Usage counts drafts and publications, not revisions (C-72).
--    A save that adds a reference and a delete cannot pass each other: the
--    delete locks the media row FOR UPDATE, a draft write takes FOR KEY SHARE
--    on the media it references.

-- Archive / Unarchive ---------------------------------------------------------------

-- Refused while the entry is open in the editor (a live lock). Archiving an
-- archived entry, or unarchiving a live one, changes nothing and writes nothing.
create function public.cms_entry_archive(entry_type text, entry_id uuid)
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

  if public.cms_page_open_in_editor(entry_id) then
    raise exception 'The entry is open in the editor'
      using errcode = 'CMSLK';
  end if;

  update public.cms_entries e
    set archived_at = now()
    where e.id = entry_id
      and e.archived_at is null;

  if found then
    select * into event from public.cms_document_event(entry_id);
    perform public.cms_activity_log('archive', 'entry', entry_id::text, event.entity_label, null, null, event.details);
  end if;
end;
$$;

-- Back first in the manual order: its old position may be taken meanwhile.
create function public.cms_entry_unarchive(entry_type text, entry_id uuid)
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
    set archived_at = null,
        sort_order = coalesce(
          (select min(o.sort_order) from public.cms_entries o where o.type = entry_type and o.archived_at is null), 1
        ) - 1
    where e.id = entry_id
      and e.archived_at is not null;

  if found then
    select * into event from public.cms_document_event(entry_id);
    perform public.cms_activity_log('unarchive', 'entry', entry_id::text, event.entity_label, null, null, event.details);
  end if;
end;
$$;

-- Manual order ----------------------------------------------------------------------

-- Version of the order of a type: the ordered ids of its live entries.
create function public.cms_entry_order_version(entry_type text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select md5(coalesce(string_agg(e.id::text, ',' order by e.sort_order, e.id), ''))
    from public.cms_entries e
    where e.type = entry_type
      and e.archived_at is null;
$$;

-- Saves the complete order of the live entries of a type. `ids` must be
-- exactly that set, and the order must still be the one the screen read
-- (`expected_version`); otherwise CMSCF and nothing changes.
create function public.cms_entry_reorder(entry_type text, ids uuid[], expected_version text)
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

  -- The rows of the type: a concurrent reorder, archive or unarchive waits.
  perform 1
    from public.cms_entries e
    where e.type = entry_type
      and e.archived_at is null
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

  update public.cms_entries e
    set sort_order = p.position::integer - 1
    from unnest(ids) with ordinality as p (id, position)
    where e.id = p.id
      and e.sort_order is distinct from p.position::integer - 1;

  perform public.cms_activity_log('reorder', 'entry', null, entry_type, null, null, jsonb_build_object('type', entry_type));

  return public.cms_entry_order_version(entry_type);
end;
$$;

-- Admin list and status ---------------------------------------------------------------

-- A page of the entries of a type for the admin (014 §8). Title and slug: the
-- draft of the original, else its publication. Status: archived, draft (never
-- published in the original), changed (published, with a draft in any
-- language), published. `search`: in the title, as typed (no patterns).
create function public.cms_entries_admin_list(
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
        greatest(
          (select max(x.updated_at) from public.cms_page_draft x where x.page_id = e.id),
          (select max(x.published_at) from public.cms_page_published x where x.page_id = e.id),
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

-- What Edit Mode needs to explain chosen entries (014 §7): which exist, of
-- which type, archived or not, in which languages published.
create function public.cms_entries_status(ids uuid[])
returns table (id uuid, type text, title text, archived boolean, published_locales text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.cms_require_permission('pages.edit');

  if cardinality(ids) > 500 then
    raise exception 'Up to 500 entries'
      using errcode = '23514';
  end if;

  return query
    select e.id,
           e.type,
           (select ev.entity_label from public.cms_document_event(e.id) ev),
           e.archived_at is not null,
           array(select pub.locale::text from public.cms_page_published pub where pub.page_id = e.id order by pub.locale)
      from public.cms_entries e
      where e.id = any (ids);
end;
$$;

revoke all on function public.cms_entry_order_version(text) from public, anon, authenticated;
revoke all on function public.cms_entry_archive(text, uuid) from public, anon;
revoke all on function public.cms_entry_unarchive(text, uuid) from public, anon;
revoke all on function public.cms_entry_reorder(text, uuid[], text) from public, anon;
revoke all on function public.cms_entries_admin_list(text, text, boolean, text, integer, integer, text) from public, anon;
revoke all on function public.cms_entries_status(uuid[]) from public, anon;
grant execute on function public.cms_entry_archive(text, uuid) to authenticated;
grant execute on function public.cms_entry_unarchive(text, uuid) to authenticated;
grant execute on function public.cms_entry_reorder(text, uuid[], text) to authenticated;
grant execute on function public.cms_entries_admin_list(text, text, boolean, text, integer, integer, text) to authenticated;
grant execute on function public.cms_entries_status(uuid[]) to authenticated;

-- Media in use ----------------------------------------------------------------------

-- Every place content references a media item: drafts and publications of
-- documents (pages and entries), and Brand. Revisions do not count (C-72).
create function public.cms_media_references(media_ids uuid[])
returns table (media_id uuid, source text, document_id uuid, locale text, is_draft boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with refs as (
    select pub.page_id as document_id, pub.locale::text as locale, false as is_draft, ref #>> '{}' as ref
      from public.cms_page_published pub,
      lateral jsonb_path_query(pub.content, 'lax $.**.mediaId') as ref
      where jsonb_typeof(ref) = 'string'
    union
    select d.page_id, d.locale::text, true, ref #>> '{}'
      from public.cms_page_draft d,
      lateral jsonb_path_query(d.content, 'lax $.**.mediaId') as ref
      where jsonb_typeof(ref) = 'string'
  ),
  wanted as (
    select m.id
      from public.cms_media m
      where m.deleted_at is null
        and (media_ids is null or m.id = any (media_ids))
  )
  select wanted.id, doc.kind, refs.document_id, refs.locale, refs.is_draft
    from refs
    join wanted on wanted.id::text = refs.ref
    join public.cms_documents doc on doc.id = refs.document_id
  union all
  select wanted.id, 'brand.logo', null, null, false
    from public.cms_site_settings s
    join wanted on wanted.id = s.logo_media_id
  union all
  select wanted.id, 'brand.favicon', null, null, false
    from public.cms_site_settings s
    join wanted on wanted.id = s.favicon_media_id;
$$;

revoke all on function public.cms_media_references(uuid[]) from public, anon, authenticated;

-- Usage for the library: pages by key, entries by type, id and title.
drop function public.cms_media_usage(uuid[]);

create function public.cms_media_usage(media_ids uuid[] default null)
returns table (
  media_id uuid,
  source text,
  page_key text,
  locale text,
  is_draft boolean,
  entry_id uuid,
  entry_type text,
  entry_title text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.cms_require_permission('media.edit');

  return query
    select r.media_id,
           r.source,
           p.key,
           r.locale,
           r.is_draft,
           e.id,
           e.type,
           case when e.id is not null then (select ev.entity_label from public.cms_document_event(e.id) ev) end
      from public.cms_media_references(media_ids) r
      left join public.cms_pages p on r.source = 'page' and p.id = r.document_id
      left join public.cms_entries e on r.source = 'entry' and e.id = r.document_id
      order by 1, 2, 3, 6, 4, 5;
end;
$$;

revoke all on function public.cms_media_usage(uuid[]) from public, anon;
grant execute on function public.cms_media_usage(uuid[]) to authenticated;

-- A media item in use cannot be deleted (CMSMU).
create or replace function public.cms_media_delete(media_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  media_name text;
begin
  perform public.cms_require_permission('media.delete');

  -- Waits for a draft write that references the item (FOR KEY SHARE there).
  select m.display_name
    into media_name
    from public.cms_media m
    where m.id = media_id
      and m.deleted_at is null
    for update;

  if not found then
    raise exception 'Media % does not exist', media_id
      using errcode = 'P0002';
  end if;

  if exists (select 1 from public.cms_media_references(array[media_id])) then
    raise exception 'The file is used on the site'
      using errcode = 'CMSMU';
  end if;

  update public.cms_media m
    set deleted_at = now()
    where m.id = media_id;

  perform public.cms_activity_log('delete', 'media', media_id::text, media_name);
end;
$$;

-- A draft write holds the media it references until it commits, so a delete
-- either sees the reference or happens before it (C-77, 2c).
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

  perform 1
    from public.cms_media m
    where m.deleted_at is null
      and m.id::text in (
        select ref #>> '{}'
          from jsonb_path_query(next_content, 'lax $.**.mediaId') as ref
          where jsonb_typeof(ref) = 'string'
      )
    order by m.id
    for key share;

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
