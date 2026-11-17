-- CMS Core migration: Media (009).
--
-- A media row is the CMS identity of a file; the file itself lives in Storage
-- (bucket cms-media). Content stores the media id, never a URL (MASTER_PLAN
-- C-14), so Replace changes the file under the same id and every place that
-- uses it follows.
--
-- Upload (C-71): the browser puts the file into the bucket directly, then
-- registers it with cms_media_create. The bucket limits type and size; the
-- function reads mime and size from the stored object, not from the client.
-- Width and height come from the browser: harmless if wrong, they only size
-- the <img>.
--
-- Usage (C-72) is computed from content: no registry to keep in sync.
-- Delete is soft: revisions may still reference the id, and the file stays.

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

-- Media -------------------------------------------------------------------------

-- A focal point is {x, y} in percent of the image. CASE keeps the casts from
-- running on a value that is not a number.
create function public.cms_is_focal(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(value) <> 'object' then false
    when jsonb_typeof(value -> 'x') <> 'number' or jsonb_typeof(value -> 'y') <> 'number' then false
    else (value ->> 'x')::numeric between 0 and 100
      and (value ->> 'y')::numeric between 0 and 100
  end;
$$;

create table public.cms_media (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  -- Object name in the cms-media bucket: a random uuid and the extension of
  -- the type. Replace writes a new object, so no cache serves the old file.
  storage_path text not null,
  mime text not null,
  size integer not null,
  -- Null for an SVG without intrinsic size.
  width integer,
  height integer,
  default_alt text not null default '',
  default_focal jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  constraint cms_media_storage_path_unique unique (storage_path),
  constraint cms_media_storage_path_format
    check (storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|svg)$'),
  constraint cms_media_display_name_length
    check (char_length(btrim(display_name)) between 1 and 200),
  constraint cms_media_mime
    check (mime in ('image/jpeg', 'image/png', 'image/webp', 'image/svg+xml')),
  constraint cms_media_size
    check (size > 0 and size <= 5242880),
  constraint cms_media_dimensions
    check (
      (width is null and height is null)
      or (width between 1 and 50000 and height between 1 and 50000)
    ),
  constraint cms_media_default_alt_length
    check (char_length(default_alt) <= 1000),
  constraint cms_media_default_focal
    check (default_focal is null or public.cms_is_focal(default_focal))
);

comment on table public.cms_media is
  'Files of the media library. Content references a row by id; deleted_at marks a soft delete.';

create index cms_media_created_at
  on public.cms_media (created_at desc)
  where deleted_at is null;

create trigger cms_media_touch_updated_at
  before update on public.cms_media
  for each row
  execute function public.cms_touch_updated_at();

alter table public.cms_media enable row level security;

-- Images are public site content. A deleted row disappears for every client:
-- the public site falls back to the code default, the library hides it.
create policy "cms_media_select_live"
  on public.cms_media
  for select
  to anon, authenticated
  using (deleted_at is null);

-- Read only for clients, and without created_by. Writes go through the
-- functions below.
revoke all on table public.cms_media from anon, authenticated;
grant select (
  id, display_name, storage_path, mime, size, width, height,
  default_alt, default_focal, created_at, updated_at, deleted_at
) on table public.cms_media to anon, authenticated;

-- Storage -----------------------------------------------------------------------
-- Created here, not only in config.toml, so a cloud project gets the same bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cms-media',
  'cms-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A file a media row points to, live or soft-deleted: removing it would
-- break the site, or a revision that still uses the deleted media. Only
-- paths without a row are removable: a replaced file, a failed registration.
-- Cleaning up deleted media is a later, deliberate job (TODO, 015).
create function public.cms_media_path_in_use(path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.cms_media
      where storage_path = path
  );
$$;

revoke all on function public.cms_media_path_in_use(text) from public, anon, authenticated;
-- Policies run as the caller.
grant execute on function public.cms_media_path_in_use(text) to authenticated;

-- Public files are served by URL without a policy. Reading rows is needed by
-- the Storage API around insert and delete.
create policy "cms_media_objects_select"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'cms-media' and public.cms_can('media.edit'));

-- Only names the library registers: a uuid and the extension of the type,
-- the same format as cms_media.storage_path. No folders, no other names.
create policy "cms_media_objects_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'cms-media'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|svg)$'
    and public.cms_can('media.upload')
  );

-- Removes a replaced file, or an upload whose registration failed. A file
-- that a media row uses cannot be removed this way.
create policy "cms_media_objects_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'cms-media'
    and public.cms_can('media.edit')
    and not public.cms_media_path_in_use(name)
  );

-- Internal helpers --------------------------------------------------------------

-- The uploaded object behind a new storage path: it must exist in the bucket,
-- belong to the caller and match the extension of the path.
create function public.cms_media_object(path text)
returns table (mime text, size integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  object_owner text;
  object_metadata jsonb;
  object_mime text;
  expected_mime text;
begin
  select o.owner_id, o.metadata
    into object_owner, object_metadata
    from storage.objects o
    where o.bucket_id = 'cms-media'
      and o.name = path;

  if object_metadata is null then
    raise exception 'No uploaded file at "%"', path
      using errcode = 'P0002';
  end if;

  if object_owner is distinct from auth.uid()::text then
    raise exception 'The file at "%" was uploaded by another user', path
      using errcode = '42501';
  end if;

  object_mime := object_metadata ->> 'mimetype';
  -- The type the extension (everything after the last dot) stands for.
  expected_mime := case regexp_replace(path, '^.*[.]', '')
    when 'jpg' then 'image/jpeg'
    when 'png' then 'image/png'
    when 'webp' then 'image/webp'
    when 'svg' then 'image/svg+xml'
  end;

  if object_mime is distinct from expected_mime then
    raise exception 'The file type "%" does not match "%"', object_mime, path
      using errcode = '23514';
  end if;

  return query select object_mime, (object_metadata ->> 'size')::integer;
end;
$$;

-- Media rows of the ids found anywhere in a content document ($.**.mediaId).
-- Runs as the caller: RLS hides deleted rows. Only well-formed ids are cast,
-- so hand-edited content cannot fail the read, and the lookup uses the key.
create function public.cms_media_of(content jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'display_name', m.display_name,
        'storage_path', m.storage_path,
        'mime', m.mime,
        'size', m.size,
        'width', m.width,
        'height', m.height,
        'default_alt', m.default_alt,
        'default_focal', m.default_focal,
        'created_at', m.created_at,
        'updated_at', m.updated_at
      )
    ),
    '[]'::jsonb
  )
  from public.cms_media m
  where m.id = any (array(
    select (ref #>> '{}')::uuid
      from jsonb_path_query(content, 'lax $.**.mediaId') as ref
      where jsonb_typeof(ref) = 'string'
        and ref #>> '{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z'
  ));
$$;

revoke all on function public.cms_media_object(text) from public, anon, authenticated;
revoke all on function public.cms_media_of(jsonb) from public, anon, authenticated;
grant execute on function public.cms_media_of(jsonb) to anon, authenticated;

-- Library -----------------------------------------------------------------------

create function public.cms_media_create(
  storage_path text,
  display_name text,
  width integer default null,
  height integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  object record;
  media_id uuid;
begin
  perform public.cms_require_permission('media.upload');
  select * into object from public.cms_media_object(storage_path);

  insert into public.cms_media (display_name, storage_path, mime, size, width, height, created_by)
    values (btrim(display_name), storage_path, object.mime, object.size, width, height, auth.uid())
    returning id into media_id;

  return media_id;
end;
$$;

-- Name and the defaults every usage starts from (C-74).
create function public.cms_media_update(
  media_id uuid,
  display_name text,
  default_alt text,
  default_focal jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.cms_require_permission('media.edit');

  update public.cms_media m
    set display_name = btrim(cms_media_update.display_name),
        default_alt = cms_media_update.default_alt,
        default_focal = cms_media_update.default_focal
    where m.id = media_id
      and m.deleted_at is null;

  if not found then
    raise exception 'Media % does not exist', media_id
      using errcode = 'P0002';
  end if;
end;
$$;

-- Points the media at a newly uploaded file. Returns the old storage path:
-- nothing uses it any more, so the caller removes the old object.
create function public.cms_media_replace(
  media_id uuid,
  storage_path text,
  width integer default null,
  height integer default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  object record;
  previous_path text;
begin
  perform public.cms_require_permission('media.edit');
  select * into object from public.cms_media_object(storage_path);

  select m.storage_path
    into previous_path
    from public.cms_media m
    where m.id = media_id
      and m.deleted_at is null
    for update;

  if previous_path is null then
    raise exception 'Media % does not exist', media_id
      using errcode = 'P0002';
  end if;

  update public.cms_media m
    set storage_path = cms_media_replace.storage_path,
        mime = object.mime,
        size = object.size,
        width = cms_media_replace.width,
        height = cms_media_replace.height
    where m.id = media_id;

  return previous_path;
end;
$$;

-- Soft delete. Content that still uses the media renders the code default.
create function public.cms_media_delete(media_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.cms_require_permission('media.delete');

  update public.cms_media m
    set deleted_at = now()
    where m.id = media_id
      and m.deleted_at is null;

  if not found then
    raise exception 'Media % does not exist', media_id
      using errcode = 'P0002';
  end if;
end;
$$;

-- Brand -------------------------------------------------------------------------

alter table public.cms_site_settings
  add column logo_media_id uuid,
  add column favicon_media_id uuid,
  add constraint cms_site_settings_logo_media_fkey
    foreign key (logo_media_id) references public.cms_media (id) on delete set null,
  add constraint cms_site_settings_favicon_media_fkey
    foreign key (favicon_media_id) references public.cms_media (id) on delete set null;

grant update (logo_media_id, favicon_media_id)
  on table public.cms_site_settings
  to authenticated;

-- Usage -------------------------------------------------------------------------

-- Where live media are used: published and draft page content, and Brand.
-- Null media_ids means every media row. Draft content is visible to CMS users
-- only, so the function is too.
create function public.cms_media_usage(media_ids uuid[] default null)
returns table (media_id uuid, source text, page_key text, locale text, is_draft boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.cms_require_permission('media.edit');

  return query
    with refs as (
      select p.key as page_key, pub.locale::text as locale, false as is_draft, ref #>> '{}' as ref
        from public.cms_page_published pub
        join public.cms_pages p on p.id = pub.page_id,
        lateral jsonb_path_query(pub.content, 'lax $.**.mediaId') as ref
        where jsonb_typeof(ref) = 'string'
      union
      select p.key, d.locale::text, true, ref #>> '{}'
        from public.cms_page_draft d
        join public.cms_pages p on p.id = d.page_id,
        lateral jsonb_path_query(d.content, 'lax $.**.mediaId') as ref
        where jsonb_typeof(ref) = 'string'
    ),
    live as (
      select m.id
        from public.cms_media m
        where m.deleted_at is null
          and (media_ids is null or m.id = any (media_ids))
    )
    select live.id, 'page'::text, refs.page_key, refs.locale, refs.is_draft
      from refs
      join live on live.id::text = refs.ref
    union all
    select live.id, 'brand.logo'::text, null::text, null::text, false
      from public.cms_site_settings s
      join live on live.id = s.logo_media_id
    union all
    select live.id, 'brand.favicon'::text, null::text, null::text, false
      from public.cms_site_settings s
      join live on live.id = s.favicon_media_id
    order by 1, 2, 3, 4, 5;
end;
$$;

-- Page reads with media -------------------------------------------------------------
-- One request returns the document and the media it references (C-76), so
-- images render on the server without a request per image.

create function public.cms_page_get_published(page_key text, page_locale text)
returns table (locale text, content jsonb, published_at timestamptz, media jsonb)
language sql
stable
set search_path = ''
as $$
  select pub.locale::text, pub.content, pub.published_at, public.cms_media_of(pub.content)
    from public.cms_page_published pub
    join public.cms_pages p on p.id = pub.page_id
    where p.key = page_key
      and pub.locale = page_locale;
$$;

-- Runs as the caller: RLS on cms_page_draft admits pages.edit only.
create function public.cms_page_get_draft(page_key text, page_locale text)
returns table (locale text, content jsonb, updated_at timestamptz, media jsonb)
language sql
stable
set search_path = ''
as $$
  select d.locale::text, d.content, d.updated_at, public.cms_media_of(d.content)
    from public.cms_page_draft d
    join public.cms_pages p on p.id = d.page_id
    where p.key = page_key
      and d.locale = page_locale;
$$;

revoke all on function public.cms_is_focal(jsonb) from public, anon, authenticated;
revoke all on function public.cms_media_create(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.cms_media_update(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.cms_media_replace(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.cms_media_delete(uuid) from public, anon, authenticated;
revoke all on function public.cms_media_usage(uuid[]) from public, anon, authenticated;
revoke all on function public.cms_page_get_published(text, text) from public, anon, authenticated;
revoke all on function public.cms_page_get_draft(text, text) from public, anon, authenticated;

grant execute on function public.cms_media_create(text, text, integer, integer) to authenticated;
grant execute on function public.cms_media_update(uuid, text, text, jsonb) to authenticated;
grant execute on function public.cms_media_replace(uuid, text, integer, integer) to authenticated;
grant execute on function public.cms_media_delete(uuid) to authenticated;
grant execute on function public.cms_media_usage(uuid[]) to authenticated;
grant execute on function public.cms_page_get_published(text, text) to anon, authenticated;
grant execute on function public.cms_page_get_draft(text, text) to authenticated;
