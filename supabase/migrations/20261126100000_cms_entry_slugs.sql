-- CMS Core migration: addresses of entries (014, stage 2b).
--
-- A type with a route (`/blog/[slug]`) addresses its entries by slug. The
-- slug is the text leaf `slug` of the document: drafts, Undo, translation,
-- revisions and Restore need nothing new. What is published is copied here,
-- per language: cms_entry_slugs holds the published own slugs.
--
-- Effective slug of entry E in language L: E's own slug in L, else E's slug in
-- the language of the original (fallback). An entry published in the original
-- has an address in every language, translated or not.
--
-- Invariant: the actual URL leads to one entry. For every (type, language) the
-- effective slugs of different entries differ. Across languages they may
-- repeat: /uk/blog/kava and /en/blog/kava can be two entries.
--
-- Checked on every publish of an entry (inside cms_page_promote_draft, so no
-- publish path can skip it), for every language whose effective slug the
-- publish changes: the original changes all languages where E has no own
-- slug, a translation only its own. Archived entries keep their addresses,
-- so Unarchive can never break another entry's URL. Publishes of one type are
-- serialized by an advisory lock: two of them cannot both pass the check.
--
-- A language added later gets the slugs of the original, unique there: no
-- conflict. Deleting a language removes its own slugs. No history and no
-- redirects (014 §6): only current slugs are kept.

-- Format ----------------------------------------------------------------------------

create function public.cms_entry_slug_valid(slug text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80;
$$;

-- The slug leaf of a content (original or translation): null when absent.
-- A present slug that is not a valid string is refused.
create function public.cms_entry_slug_of(content jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if content is null or not (content ? 'slug') then
    return null;
  end if;

  if jsonb_typeof(content -> 'slug') is distinct from 'string' or not public.cms_entry_slug_valid(content ->> 'slug') then
    raise exception 'An address is lowercase letters, digits and single hyphens, up to 80 characters'
      using errcode = '23514';
  end if;

  return content ->> 'slug';
end;
$$;

-- Published slugs -------------------------------------------------------------------

create table public.cms_entry_slugs (
  entry_id uuid not null references public.cms_entries (id) on delete cascade,
  locale public.cms_locale not null,
  -- The type of the entry, copied for the per-type lookups.
  type text not null,
  slug text not null check (public.cms_entry_slug_valid(slug)),
  primary key (entry_id, locale)
);

comment on table public.cms_entry_slugs is
  'Published own slugs of entries per language (014). The effective slug of a language falls back to the slug of the original.';

-- A backstop of the invariant: own slugs of one language never repeat within a type.
create unique index cms_entry_slugs_unique on public.cms_entry_slugs (type, locale, slug);
create index cms_entry_slugs_type_slug on public.cms_entry_slugs (type, slug);

alter table public.cms_entry_slugs enable row level security;

create policy cms_entry_slugs_select_anon
  on public.cms_entry_slugs
  for select
  to anon
  using (public.cms_entry_public(entry_id));

create policy cms_entry_slugs_select_cms
  on public.cms_entry_slugs
  for select
  to authenticated
  using (public.cms_entry_public(entry_id) or public.cms_can('pages.edit'));

revoke all on table public.cms_entry_slugs from anon, authenticated;
grant select on table public.cms_entry_slugs to anon, authenticated;

-- Conflicts -------------------------------------------------------------------------

-- Where the address `new_slug` in `slug_locale` for entry `entry_id` (null: a
-- new entry) would lead to another entry of the type: the first such language
-- and the entry there. `new_slug` null removes the own slug of that language.
-- Every language counts, hidden ones included: enabling one must not create a
-- conflict. Archived entries count: they keep their addresses.
create function public.cms_entry_slug_conflict(entry_type text, entry_id uuid, slug_locale text, new_slug text)
returns table (conflict_locale text, holder uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select coalesce(public.cms_default_locale(null), slug_locale) as code
  ),
  langs as (
    select l.code::text as code from public.cms_languages l
    union
    select base.code from base
  ),
  -- The entry's own slugs after the change.
  mine as (
    select s.locale::text as locale, s.slug
      from public.cms_entry_slugs s
      where s.entry_id = cms_entry_slug_conflict.entry_id
        and s.locale <> slug_locale
    union all
    select slug_locale, new_slug where new_slug is not null
  ),
  mine_effective as (
    select langs.code,
           coalesce(
             (select m.slug from mine m where m.locale = langs.code),
             (select m.slug from mine m, base where m.locale = base.code)
           ) as slug
      from langs
  ),
  others_effective as (
    select e.id, langs.code, coalesce(own.slug, original.slug) as slug
      from public.cms_entries e
      cross join langs
      cross join base
      left join public.cms_entry_slugs own on own.entry_id = e.id and own.locale = langs.code
      left join public.cms_entry_slugs original on original.entry_id = e.id and original.locale = base.code
      where e.type = entry_type
        and e.id is distinct from cms_entry_slug_conflict.entry_id
        -- Only entries that hold one of the candidate slugs somewhere.
        and exists (
          select 1 from public.cms_entry_slugs s
            where s.entry_id = e.id
              and s.slug in (select me.slug from mine_effective me where me.slug is not null)
        )
  )
  select me.code, oe.id
    from mine_effective me
    join others_effective oe on oe.code = me.code and oe.slug = me.slug
    where me.slug is not null
    order by me.code
    limit 1;
$$;

-- After a publish of `target_locale`: the published slug goes into
-- cms_entry_slugs, under the type lock, unless it would take another entry's
-- address. Raised as CMSSL (the address is taken): the publish rolls back.
create function public.cms_entry_publish_slug(target uuid, target_locale text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_type text;
  published_slug text;
  conflict record;
begin
  select e.type into entry_type from public.cms_entries e where e.id = target;

  if entry_type is null then
    return;
  end if;

  -- One publish of the type at a time checks and writes addresses.
  perform pg_advisory_xact_lock(hashtext('cms_entry_slug:' || entry_type));

  published_slug := public.cms_entry_slug_of(
    (select pub.content from public.cms_page_published pub where pub.page_id = target and pub.locale = target_locale)
  );

  select * into conflict from public.cms_entry_slug_conflict(entry_type, target, target_locale, published_slug);

  if conflict.holder is not null then
    raise exception 'The address "%" is taken in locale "%"', published_slug, conflict.conflict_locale
      using errcode = 'CMSSL',
            detail = conflict.holder::text;
  end if;

  if published_slug is null then
    delete from public.cms_entry_slugs s where s.entry_id = target and s.locale = target_locale;
  else
    insert into public.cms_entry_slugs as s (entry_id, locale, type, slug)
      values (target, target_locale, entry_type, published_slug)
      on conflict (entry_id, locale) do update set slug = excluded.slug;
  end if;
end;
$$;

revoke all on function public.cms_entry_slug_valid(text) from public, anon, authenticated;
revoke all on function public.cms_entry_slug_of(jsonb) from public, anon, authenticated;
revoke all on function public.cms_entry_slug_conflict(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.cms_entry_publish_slug(uuid, text) from public, anon, authenticated;

-- Publishing ------------------------------------------------------------------------

create or replace function public.cms_page_promote_draft(target_page uuid, target_locale text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  draft_content jsonb;
  publication_time timestamptz := now();
  new_revision uuid;
  event record;
  lang text := public.cms_default_locale(null);
begin
  delete from public.cms_page_draft
    where page_id = target_page
      and locale = target_locale
    returning content into draft_content;

  if draft_content is null then
    return null;
  end if;

  insert into public.cms_page_revisions (page_id, locale, content, created_at, created_by)
    values (target_page, target_locale, draft_content, publication_time, auth.uid())
    returning id into new_revision;

  insert into public.cms_page_published as pp (page_id, locale, content, published_at)
    values (target_page, target_locale, draft_content, publication_time)
    on conflict (page_id, locale) do update
      set content = excluded.content,
          published_at = excluded.published_at;

  -- An entry: its address follows the publication (or the publish fails).
  perform public.cms_entry_publish_slug(target_page, target_locale);

  if lang is null or target_locale = lang then
    update public.cms_entries e
      set first_published_at = publication_time
      where e.id = target_page
        and e.first_published_at is null;
  end if;

  select * into event from public.cms_document_event(target_page);

  perform public.cms_activity_log(
    'publish', event.entity_type, target_page::text, event.entity_label,
    target_locale, new_revision, event.details
  );

  return publication_time;
end;
$$;

-- A draft carries a valid address or none.
create or replace function public.cms_entry_save_draft(entry_type text, entry_id uuid, entry_locale text, content jsonb, lock_token uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  held uuid;
begin
  perform public.cms_require_permission('pages.edit');
  held := public.cms_entry_held_lock(entry_type, entry_id, lock_token);
  perform public.cms_entry_check_title(entry_locale, content);
  perform public.cms_entry_slug_of(content);
  perform public.cms_page_check_translation(held, entry_locale, content);
  return public.cms_page_write_draft(held, entry_locale, content);
end;
$$;

-- `require_slug`: the type has a route (cms.content.ts, known to the client):
-- the published entry must have an address in this language.
drop function public.cms_entry_publish(text, uuid, text, uuid);

create function public.cms_entry_publish(entry_type text, entry_id uuid, entry_locale text, lock_token uuid, require_slug boolean default false)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  publication_time timestamptz;
  lang text := public.cms_default_locale(null);
begin
  perform public.cms_require_permission('pages.publish');
  publication_time := public.cms_page_promote_draft(
    public.cms_entry_held_lock(entry_type, entry_id, lock_token), entry_locale
  );

  if publication_time is null then
    raise exception 'The entry has no draft to publish in locale "%"', entry_locale
      using errcode = 'P0002';
  end if;

  if require_slug and not exists (
    select 1 from public.cms_entry_slugs s
      where s.entry_id = cms_entry_publish.entry_id
        and s.locale in (entry_locale, coalesce(lang, entry_locale))
  ) then
    raise exception 'The entry needs an address to be published'
      using errcode = '23514';
  end if;

  return publication_time;
end;
$$;

revoke all on function public.cms_entry_publish(text, uuid, text, uuid, boolean) from public, anon;
grant execute on function public.cms_entry_publish(text, uuid, text, uuid, boolean) to authenticated;

-- Create keeps a valid address or none in the first draft.
create or replace function public.cms_entry_create(
  entry_type text,
  content jsonb,
  take_lock boolean,
  entry_id uuid,
  bootstrap_locale text default null
)
returns table (id uuid, draft_updated_at timestamptz, lock_token uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  lang text := public.cms_default_locale(bootstrap_locale);
  existing record;
  created uuid;
  saved_at timestamptz;
  token uuid;
begin
  perform public.cms_require_permission('pages.edit');

  if entry_type is null or entry_type !~ '^[a-z][a-z0-9-]{0,39}$' then
    raise exception 'Invalid entry type'
      using errcode = '23514';
  end if;

  if entry_id is null then
    raise exception 'The entry id is chosen by the client'
      using errcode = '23514';
  end if;

  if lang is null then
    raise exception 'The site has no language of the original'
      using errcode = '23514';
  end if;

  if jsonb_typeof(content) is distinct from 'object' or public.cms_entry_title_of(content) is null then
    raise exception 'An entry needs a title'
      using errcode = '23514';
  end if;

  perform public.cms_entry_slug_of(content);

  if exists (select 1 from public.cms_pages p where p.id = entry_id) then
    raise exception 'The id is taken'
      using errcode = 'CMSCF';
  end if;

  insert into public.cms_entries (id, type, sort_order, created_by)
    values (
      entry_id,
      entry_type,
      coalesce((select min(e.sort_order) from public.cms_entries e where e.type = entry_type), 1) - 1,
      auth.uid()
    )
    on conflict on constraint cms_entries_pkey do nothing
    returning cms_entries.id into created;

  if created is null then
    select e.type, e.created_by into existing from public.cms_entries e where e.id = entry_id;

    if existing.type is distinct from entry_type or existing.created_by is distinct from auth.uid() then
      raise exception 'The id is taken'
        using errcode = 'CMSCF';
    end if;

    perform public.cms_entry_lock_row(entry_type, entry_id);

    if take_lock then
      token := public.cms_entry_take_lock(entry_id);
    end if;

    return query
      select entry_id,
             (select d.updated_at from public.cms_page_draft d where d.page_id = entry_id and d.locale = lang),
             token;
    return;
  end if;

  saved_at := public.cms_page_write_draft(entry_id, lang, content);

  if take_lock then
    token := public.cms_entry_take_lock(entry_id);
  end if;

  perform public.cms_activity_log(
    'create', 'entry', entry_id::text, public.cms_entry_title_of(content), lang, null,
    jsonb_build_object('type', entry_type)
  );

  return query select entry_id, saved_at, token;
end;
$$;

-- Lookups for the admin -------------------------------------------------------------

-- Whether an address is free, for the Create dialog and the address field
-- (014 §6); Publish checks the same again. `entry_id` null: a new entry.
-- `taken`: the holder's title and whether it is archived ("held by the
-- archived entry «…»").
create function public.cms_entry_slug_check(entry_type text, entry_id uuid, slug_locale text, slug text)
returns table (status text, holder_title text, holder_archived boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  conflict record;
begin
  perform public.cms_require_permission('pages.edit');

  if slug is null or not public.cms_entry_slug_valid(slug) then
    return query select 'invalid'::text, null::text, null::boolean;
    return;
  end if;

  select * into conflict from public.cms_entry_slug_conflict(entry_type, entry_id, slug_locale, slug);

  if conflict.holder is null then
    return query select 'ok'::text, null::text, null::boolean;
    return;
  end if;

  return query
    select 'taken'::text,
           (select ev.entity_label from public.cms_document_event(conflict.holder) ev),
           (select e.archived_at is not null from public.cms_entries e where e.id = conflict.holder);
end;
$$;

-- The entry an address of the site leads to (Edit Mode without `?entry`):
-- published effective slugs only; drafts are not unique yet.
create function public.cms_entry_find(entry_type text, slug_locale text, slug text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select coalesce(public.cms_default_locale(null), slug_locale) as code
  )
  select e.id
    from public.cms_entries e
    cross join base
    left join public.cms_entry_slugs own on own.entry_id = e.id and own.locale = slug_locale
    left join public.cms_entry_slugs original on original.entry_id = e.id and original.locale = base.code
    where public.cms_can('pages.edit')
      and e.type = entry_type
      and coalesce(own.slug, original.slug) = cms_entry_find.slug
    limit 1;
$$;

revoke all on function public.cms_entry_slug_check(text, uuid, text, text) from public, anon;
revoke all on function public.cms_entry_find(text, text, text) from public, anon;
grant execute on function public.cms_entry_slug_check(text, uuid, text, text) to authenticated;
grant execute on function public.cms_entry_find(text, text, text) to authenticated;

-- Deleting a language removes its own slugs -----------------------------------------

create or replace function public.cms_language_delete(code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_is_default boolean;
  target_name text;
begin
  perform public.cms_require_permission('languages.manage');

  lock table public.cms_languages in share row exclusive mode;

  select l.is_default, l.name
    into target_is_default, target_name
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
  delete from public.cms_entry_slugs s where s.locale = code;
  delete from public.cms_site_settings_translations t where t.locale = code;
  delete from public.cms_site_texts t where t.locale = code;
  delete from public.cms_languages l where l.code = cms_language_delete.code;

  -- No locale on the event: the language no longer exists, and the column
  -- carries the cms_locale domain only, not a reference.
  perform public.cms_activity_log('delete', 'language', code, target_name);
end;
$$;
