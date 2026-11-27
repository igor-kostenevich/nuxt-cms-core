-- CMS Core migration: standalone entries (014, stage 2a).
--
-- An entry is a document (20261124100000_cms_documents) of a type the Client
-- Project declares in cms.content.ts (a blog post, a vacancy). It shares the
-- lifecycle of pages: draft, publish, revisions, lock, translation. Core keeps
-- no registry of types: the type is a key stored with the entry, and every
-- RPC checks the pair (type, id), so an id of another type is "not found".
--
-- Integrity, as for pages:
--   - the document is created and deleted by triggers of cms_entries; its id
--     is the entry id, so a page and an entry can never share one;
--   - the type and the id of an entry never change;
--   - deleting an entry deletes its document and with it all content.
--
-- Creating (014 §4.1, after G2):
--   - `cms_entry_create` writes the document, the entry and its first draft in
--     one transaction; with `take_lock` (the Content dialog) it also takes the
--     lock and returns its token, with no window between create and acquire;
--     without (the Pages dialog) Edit Mode takes the lock itself afterwards;
--   - the id comes from the client, one per editing session: a retried request
--     (the response was lost) returns the entry it already created instead of
--     a second one. Only the same user may repeat a create, with the same type;
--   - an entry always has a title in the language of the original.
--
-- Visibility (RLS):
--   - the public (anon, and a signed-in user without CMS access) sees an entry
--     only while it is published in an active language and not archived;
--     the archive also hides the published content of the entry;
--   - policies never query a table with RLS of their own: two security
--     definer helpers answer with a boolean, like cms_can(), so policies of
--     cms_entries and cms_page_published cannot recurse into each other;
--   - every unrestricted branch of a permissive policy carries the archive
--     condition: policies of one table are OR-ed.
--
-- Not here: slugs and their uniqueness (2b), archive / unarchive, manual
-- order, admin lists and media usage (2c), public reads (stage 3).

-- Entries ---------------------------------------------------------------------------

create table public.cms_entries (
  id uuid primary key,
  type text not null check (type ~ '^[a-z][a-z0-9-]{0,39}$'),
  -- Manual order (2c); a new entry goes first.
  sort_order integer not null default 0,
  archived_at timestamptz,
  -- First publication in the language of the original: the "newest" order.
  first_published_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint cms_entries_document_fkey
    foreign key (id) references public.cms_documents (id) on delete cascade
    deferrable initially deferred
);

comment on table public.cms_entries is
  'Standalone entries of types declared by the Client Project (014). Content, drafts, revisions and the lock live in the cms_page_* tables under the entry id (a document).';

create index cms_entries_type_order on public.cms_entries (type, sort_order, id);
create index cms_entries_type_published on public.cms_entries (type, first_published_at desc);

create function public.cms_entry_keep_type()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type is distinct from old.type then
    raise exception 'The type of an entry cannot change'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.cms_entry_keep_type() from public, anon, authenticated;

create trigger cms_entries_document_insert
  after insert on public.cms_entries
  for each row execute function public.cms_document_insert('entry');

create trigger cms_entries_document_delete
  after delete on public.cms_entries
  for each row execute function public.cms_document_delete();

create trigger cms_entries_keep_id
  before update of id on public.cms_entries
  for each row execute function public.cms_document_keep_id();

create trigger cms_entries_keep_type
  before update of type on public.cms_entries
  for each row execute function public.cms_entry_keep_type();

-- Visibility helpers ----------------------------------------------------------------

-- The published content of a document may be served: not an archived entry.
-- A page is always servable (its languages are filtered by the policy).
create function public.cms_document_public(document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
      from public.cms_entries e
      where e.id = document_id
        and e.archived_at is not null
  );
$$;

-- The entry is visible to the public: not archived, published in an active
-- language (any language while none exists, the bootstrap state).
create function public.cms_entry_public(entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.cms_entries e
      where e.id = entry_id
        and e.archived_at is null
        and exists (
          select 1
            from public.cms_page_published pub
            where pub.page_id = e.id
              and (
                not exists (select 1 from public.cms_languages)
                or exists (select 1 from public.cms_languages l where l.code = pub.locale and l.active)
              )
        )
  );
$$;

-- A policy expression runs with the privileges of the reader.
revoke all on function public.cms_document_public(uuid) from public;
revoke all on function public.cms_entry_public(uuid) from public;
grant execute on function public.cms_document_public(uuid) to anon, authenticated;
grant execute on function public.cms_entry_public(uuid) to anon, authenticated;

-- Access ----------------------------------------------------------------------------

alter table public.cms_entries enable row level security;

create policy cms_entries_select_anon
  on public.cms_entries
  for select
  to anon
  using (public.cms_entry_public(id));

create policy cms_entries_select_cms
  on public.cms_entries
  for select
  to authenticated
  using (public.cms_entry_public(id) or public.cms_can('pages.edit'));

-- Writes go through the RPCs below only. Who created an entry is not public.
revoke all on table public.cms_entries from anon, authenticated;
grant select (id, type, sort_order, archived_at, first_published_at, created_at)
  on table public.cms_entries to anon, authenticated;

-- Published content of an archived entry is not served.
drop policy "cms_page_published_select_anon" on public.cms_page_published;
drop policy "cms_page_published_select_cms" on public.cms_page_published;

create policy "cms_page_published_select_anon"
  on public.cms_page_published
  for select
  to anon
  using (
    (
      not exists (select 1 from public.cms_languages)
      or exists (select 1 from public.cms_languages l where l.code = locale and l.active)
    )
    and public.cms_document_public(page_id)
  );

create policy "cms_page_published_select_cms"
  on public.cms_page_published
  for select
  to authenticated
  using (
    (
      (
        not exists (select 1 from public.cms_languages)
        or exists (select 1 from public.cms_languages l where l.code = locale and l.active)
      )
      and public.cms_document_public(page_id)
    )
    or public.cms_can('pages.edit')
  );

-- Shared lifecycle ------------------------------------------------------------------

-- Title of an entry in a content: a non-empty string, else null.
create function public.cms_entry_title_of(content jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(content -> 'title') = 'string' and btrim(content ->> 'title') <> ''
      then left(content ->> 'title', 200)
  end;
$$;

-- What Activity records of a document: a page by its key, an entry by its title
-- in the language of the original (draft, else published) and its type.
create function public.cms_document_event(document_id uuid)
returns table (entity_type text, entity_label text, details jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  entry_type text;
  lang text := public.cms_default_locale(null);
begin
  select e.type into entry_type from public.cms_entries e where e.id = document_id;

  if entry_type is null then
    return query
      select 'page'::text, (select p.key from public.cms_pages p where p.id = document_id), null::jsonb;
    return;
  end if;

  return query
    select
      'entry'::text,
      coalesce(
        (select public.cms_entry_title_of(d.content) from public.cms_page_draft d
           where d.page_id = document_id and (lang is null or d.locale = lang) order by d.updated_at desc limit 1),
        (select public.cms_entry_title_of(pub.content) from public.cms_page_published pub
           where pub.page_id = document_id and (lang is null or pub.locale = lang) order by pub.published_at desc limit 1)
      ),
      jsonb_build_object('type', entry_type);
end;
$$;

-- Publishing: the event follows the kind of the document, and an entry records
-- its first publication in the language of the original.
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

-- Restore of a revision into the draft, for any document whose lock the
-- caller holds (checked by the caller).
create function public.cms_document_restore(target uuid, target_locale text, revision uuid, replace_draft boolean)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  revision_content jsonb;
  had_draft boolean;
  restored_at timestamptz;
  event record;
begin
  select r.content
    into revision_content
    from public.cms_page_revisions r
    where r.id = revision
      and r.page_id = target
      and r.locale = target_locale;

  if revision_content is null then
    raise exception 'Revision % does not belong to this document in locale "%"', revision, target_locale
      using errcode = 'P0002';
  end if;

  had_draft := exists (
    select 1
      from public.cms_page_draft d
      where d.page_id = target
        and d.locale = target_locale
  );

  if had_draft and not replace_draft then
    raise exception 'The document already has a draft in locale "%"', target_locale
      using errcode = 'CMSCF';
  end if;

  restored_at := public.cms_page_write_draft(target, target_locale, revision_content);

  select * into event from public.cms_document_event(target);

  perform public.cms_activity_log(
    'restore', event.entity_type, target::text, event.entity_label, target_locale, revision,
    coalesce(event.details, '{}'::jsonb) || jsonb_build_object('replacedDraft', had_draft)
  );

  return restored_at;
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
begin
  perform public.cms_require_permission('pages.edit');
  return public.cms_document_restore(
    public.cms_page_held_lock(page_key, lock_token), page_locale, revision_id, replace_draft
  );
end;
$$;

revoke all on function public.cms_entry_title_of(jsonb) from public, anon, authenticated;
revoke all on function public.cms_document_event(uuid) from public, anon, authenticated;
revoke all on function public.cms_document_restore(uuid, text, uuid, boolean) from public, anon, authenticated;

-- Entry RPCs: internals -------------------------------------------------------------

-- The entry exists and is of this type: the row, locked as the entry mutex
-- (like the page row, 010d). Lock order: entry row, lock row, draft row.
create function public.cms_entry_lock_row(entry_type text, entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
    from public.cms_entries e
    where e.id = entry_id
      and e.type = entry_type
    for no key update;

  if not found then
    raise exception 'Entry not found'
      using errcode = 'P0002';
  end if;
end;
$$;

-- Takes (or renews for the same user) the lock of an entry; another live
-- holder refuses it.
create function public.cms_entry_take_lock(entry_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_token uuid;
begin
  insert into public.cms_page_locks as l (page_id, user_id)
    values (entry_id, auth.uid())
    on conflict (page_id) do update
      set token = excluded.token,
          user_id = excluded.user_id,
          acquired_at = now(),
          heartbeat_at = now()
      where l.user_id = excluded.user_id
         or l.heartbeat_at <= now() - public.cms_page_lock_ttl()
    returning token into new_token;

  if new_token is null then
    raise exception 'The entry is being edited by another user'
      using errcode = 'CMSLK';
  end if;

  return new_token;
end;
$$;

-- The lock this session holds on the entry of this type.
create function public.cms_entry_held_lock(entry_type text, entry_id uuid, lock_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  held uuid;
begin
  select l.page_id
    into held
    from public.cms_page_locks l
    join public.cms_entries e on e.id = l.page_id
    where e.id = entry_id
      and e.type = entry_type
      and l.token = lock_token
      and l.user_id = auth.uid()
    for update of l;

  if held is null then
    raise exception 'This editing session no longer holds the lock of the entry'
      using errcode = 'CMSLL';
  end if;

  return held;
end;
$$;

-- A draft in the language of the original keeps a title (no nameless entries).
create function public.cms_entry_check_title(target_locale text, content jsonb)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  lang text := public.cms_default_locale(null);
begin
  if (lang is null or target_locale = lang) and public.cms_entry_title_of(content) is null then
    raise exception 'An entry needs a title'
      using errcode = '23514';
  end if;
end;
$$;

revoke all on function public.cms_entry_lock_row(text, uuid) from public, anon, authenticated;
revoke all on function public.cms_entry_take_lock(uuid) from public, anon, authenticated;
revoke all on function public.cms_entry_held_lock(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.cms_entry_check_title(text, jsonb) from public, anon, authenticated;

-- Entry RPCs ------------------------------------------------------------------------

-- Creates an entry with its first draft in the language of the original
-- (014 §4.1). `entry_id`: chosen by the client once per editing session; a
-- retry with the same id returns the entry instead of creating another.
create function public.cms_entry_create(
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

  -- An id that is a page, or an entry of someone else or of another type, is
  -- not this create: refused without telling which.
  if exists (select 1 from public.cms_pages p where p.id = entry_id) then
    raise exception 'The id is taken'
      using errcode = 'CMSCF';
  end if;

  -- A concurrent retry waits on the primary key here, then takes the branch below.
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

    -- The same create again: what it made, and the lock if it is wanted.
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

create function public.cms_entry_lock_acquire(entry_type text, entry_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.cms_require_permission('pages.edit');
  perform public.cms_entry_lock_row(entry_type, entry_id);
  return public.cms_entry_take_lock(entry_id);
end;
$$;

create function public.cms_entry_lock_heartbeat(entry_type text, entry_id uuid, lock_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.cms_require_permission('pages.edit');

  update public.cms_page_locks
    set heartbeat_at = now()
    where page_id = public.cms_entry_held_lock(entry_type, entry_id, lock_token);
end;
$$;

-- Releasing a lock the session no longer holds is not an error.
create function public.cms_entry_lock_release(entry_type text, entry_id uuid, lock_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.cms_page_locks l
    using public.cms_entries e
    where e.id = l.page_id
      and e.id = entry_id
      and e.type = entry_type
      and l.token = lock_token
      and l.user_id = auth.uid();
end;
$$;

create function public.cms_entry_lock_force_unlock(entry_type text, entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  unlocked uuid;
  event record;
begin
  perform public.cms_require_permission('pages.unlock');
  perform public.cms_entry_lock_row(entry_type, entry_id);

  delete from public.cms_page_locks l
    where l.page_id = entry_id
    returning l.page_id into unlocked;

  -- No lock, nothing happened: no event.
  if unlocked is not null then
    select * into event from public.cms_document_event(entry_id);
    perform public.cms_activity_log('force_unlock', 'entry', entry_id::text, event.entity_label, null, null, event.details);
  end if;
end;
$$;

create function public.cms_entry_lock_status(entry_type text, entry_id uuid)
returns table (holder_email text, acquired_at timestamptz, heartbeat_at timestamptz, is_mine boolean, is_stale boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.cms_require_permission('pages.edit');

  return query
    select
      u.email::text,
      l.acquired_at,
      l.heartbeat_at,
      l.user_id = auth.uid(),
      l.heartbeat_at <= now() - public.cms_page_lock_ttl()
    from public.cms_page_locks l
    join public.cms_entries e on e.id = l.page_id
    left join auth.users u on u.id = l.user_id
    where e.id = entry_id
      and e.type = entry_type;
end;
$$;

-- Draft and Published of a locale, and for a translation its base (C-78).
-- Invoker: what the caller sees is what RLS lets through (drafts: pages.edit).
create function public.cms_entry_get_editable(entry_type text, entry_id uuid, entry_locale text, bootstrap_locale text)
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
  base_content jsonb;
  draft_content jsonb;
  draft_time timestamptz;
  published_content jsonb;
  published_time timestamptz;
begin
  if not exists (select 1 from public.cms_entries e where e.id = entry_id and e.type = entry_type) then
    raise exception 'Entry not found'
      using errcode = 'P0002';
  end if;

  entry_locale := coalesce(entry_locale, lang);

  select d.content, d.updated_at
    into draft_content, draft_time
    from public.cms_page_draft d
    where d.page_id = entry_id
      and d.locale = entry_locale;

  select pub.content, pub.published_at
    into published_content, published_time
    from public.cms_page_published pub
    where pub.page_id = entry_id
      and pub.locale = entry_locale;

  if entry_locale is distinct from lang then
    base_content := coalesce(
      (select d.content from public.cms_page_draft d where d.page_id = entry_id and d.locale = lang),
      (select pub.content from public.cms_page_published pub where pub.page_id = entry_id and pub.locale = lang)
    );
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

create function public.cms_entry_locale_states(entry_type text, entry_id uuid)
returns table (locale text, has_draft boolean, published_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select s.locale, bool_or(s.is_draft), max(s.published_at)
    from (
      select d.locale::text as locale, true as is_draft, null::timestamptz as published_at
        from public.cms_page_draft d
        join public.cms_entries e on e.id = d.page_id
        where e.id = entry_id and e.type = entry_type
      union all
      select pub.locale::text, false, pub.published_at
        from public.cms_page_published pub
        join public.cms_entries e on e.id = pub.page_id
        where e.id = entry_id and e.type = entry_type
    ) s
    group by s.locale
    order by s.locale;
$$;

create function public.cms_entry_save_draft(entry_type text, entry_id uuid, entry_locale text, content jsonb, lock_token uuid)
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
  perform public.cms_page_check_translation(held, entry_locale, content);
  return public.cms_page_write_draft(held, entry_locale, content);
end;
$$;

create function public.cms_entry_publish(entry_type text, entry_id uuid, entry_locale text, lock_token uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  publication_time timestamptz;
begin
  perform public.cms_require_permission('pages.publish');
  publication_time := public.cms_page_promote_draft(
    public.cms_entry_held_lock(entry_type, entry_id, lock_token), entry_locale
  );

  if publication_time is null then
    raise exception 'The entry has no draft to publish in locale "%"', entry_locale
      using errcode = 'P0002';
  end if;

  return publication_time;
end;
$$;

create function public.cms_entry_restore(
  entry_type text,
  entry_id uuid,
  entry_locale text,
  revision_id uuid,
  lock_token uuid,
  replace_draft boolean default false
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.cms_require_permission('pages.edit');
  return public.cms_document_restore(
    public.cms_entry_held_lock(entry_type, entry_id, lock_token), entry_locale, revision_id, replace_draft
  );
end;
$$;

-- Only signed-in users call the entry RPCs; each checks the CMS permission.
revoke all on function public.cms_entry_create(text, jsonb, boolean, uuid, text) from public, anon;
revoke all on function public.cms_entry_lock_acquire(text, uuid) from public, anon;
revoke all on function public.cms_entry_lock_heartbeat(text, uuid, uuid) from public, anon;
revoke all on function public.cms_entry_lock_release(text, uuid, uuid) from public, anon;
revoke all on function public.cms_entry_lock_force_unlock(text, uuid) from public, anon;
revoke all on function public.cms_entry_lock_status(text, uuid) from public, anon;
revoke all on function public.cms_entry_get_editable(text, uuid, text, text) from public, anon;
revoke all on function public.cms_entry_locale_states(text, uuid) from public, anon;
revoke all on function public.cms_entry_save_draft(text, uuid, text, jsonb, uuid) from public, anon;
revoke all on function public.cms_entry_publish(text, uuid, text, uuid) from public, anon;
revoke all on function public.cms_entry_restore(text, uuid, text, uuid, uuid, boolean) from public, anon;

grant execute on function public.cms_entry_create(text, jsonb, boolean, uuid, text) to authenticated;
grant execute on function public.cms_entry_lock_acquire(text, uuid) to authenticated;
grant execute on function public.cms_entry_lock_heartbeat(text, uuid, uuid) to authenticated;
grant execute on function public.cms_entry_lock_release(text, uuid, uuid) to authenticated;
grant execute on function public.cms_entry_lock_force_unlock(text, uuid) to authenticated;
grant execute on function public.cms_entry_lock_status(text, uuid) to authenticated;
grant execute on function public.cms_entry_get_editable(text, uuid, text, text) to authenticated;
grant execute on function public.cms_entry_locale_states(text, uuid) to authenticated;
grant execute on function public.cms_entry_save_draft(text, uuid, text, jsonb, uuid) to authenticated;
grant execute on function public.cms_entry_publish(text, uuid, text, uuid) to authenticated;
grant execute on function public.cms_entry_restore(text, uuid, text, uuid, uuid, boolean) to authenticated;
