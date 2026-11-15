-- CMS Core migration: Draft / Publish / Revisions and Content Lock for pages.
--
-- Three content stores per (page, locale), never mixed (MASTER_PLAN C-11):
--   cms_page_draft      the one shared draft; a row exists only while there
--                       are unpublished changes, so "has changes" is derived
--                       from the row, not from a status column
--   cms_page_published  what the public site reads (005)
--   cms_page_revisions  immutable snapshot of every publication, the first one
--                       included; the newest revision equals the published row
-- RLS is row-level (C-06), so the draft is its own table that anon cannot see.
--
-- Clients never write these tables. Every change goes through a function
-- below that checks the permission, the Content Lock and the content
-- invariants in one transaction (C-07). Field rules (required, max length)
-- belong to the primitives and are enforced by Edit Mode; the database only
-- guarantees that content is an object of bounded size.
--
-- Content Lock: one editor session per page, shared by all locales. A session
-- holds a random token. A lock without a heartbeat for two minutes may be
-- taken over; until someone does, the old session keeps it. Taking over or
-- force-unlocking changes the token, so the old session can no longer save
-- or publish.

-- Draft --------------------------------------------------------------------

create table public.cms_page_draft (
  page_id uuid not null references public.cms_pages (id) on delete cascade,
  locale public.cms_locale not null,
  content jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (page_id, locale),
  constraint cms_page_draft_content_object
    check (jsonb_typeof(content) = 'object'),
  -- A hard cap against filling the database, not a content rule. Published
  -- content and revisions are copied from a draft, so the cap applies to them too.
  constraint cms_page_draft_content_size
    check (octet_length(content::text) <= 524288)
);

comment on table public.cms_page_draft is
  'Unpublished changes of a page, one per locale. No row means the page has no unpublished changes.';

-- Revisions ----------------------------------------------------------------

create table public.cms_page_revisions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.cms_pages (id) on delete cascade,
  locale public.cms_locale not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint cms_page_revisions_content_object
    check (jsonb_typeof(content) = 'object')
);

create index cms_page_revisions_page_locale_created_at
  on public.cms_page_revisions (page_id, locale, created_at desc);

comment on table public.cms_page_revisions is
  'Immutable snapshot of each publication. Restore copies one into the draft.';

-- Locks --------------------------------------------------------------------

create table public.cms_page_locks (
  page_id uuid primary key references public.cms_pages (id) on delete cascade,
  token uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  acquired_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now()
);

comment on table public.cms_page_locks is
  'Content Lock of a page. Not readable by clients: the token is the session''s proof of ownership.';

-- Access -------------------------------------------------------------------

alter table public.cms_page_draft enable row level security;
alter table public.cms_page_revisions enable row level security;
alter table public.cms_page_locks enable row level security;

create policy "cms_page_draft_select_editors"
  on public.cms_page_draft
  for select
  to authenticated
  using (public.cms_can('pages.edit'));

create policy "cms_page_revisions_select_editors"
  on public.cms_page_revisions
  for select
  to authenticated
  using (public.cms_can('pages.edit'));

-- No policy on cms_page_locks: a row visible to another editor would hand
-- them the token (C-06). Lock state for the UI comes from a function (008).

revoke all on table public.cms_page_draft from anon, authenticated;
revoke all on table public.cms_page_revisions from anon, authenticated;
revoke all on table public.cms_page_locks from anon, authenticated;
grant select on table public.cms_page_draft to authenticated;
grant select on table public.cms_page_revisions to authenticated;

-- Internal helpers -------------------------------------------------------------
-- Called only by the functions below, which run as the owner. Not executable
-- by any client role.

create function public.cms_require_permission(requested text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.cms_can(requested) then
    raise exception 'CMS permission "%" is required', requested
      using errcode = '42501';
  end if;
end;
$$;

-- How long a lock survives without a heartbeat before another session may take it.
create function public.cms_page_lock_ttl()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '2 minutes';
$$;

-- Returns the page id when the caller's session holds the lock. The lock row
-- stays locked until the transaction ends, so a concurrent force unlock or
-- takeover waits for this save or publish instead of interleaving with it.
create function public.cms_page_held_lock(page_key text, lock_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  held_page_id uuid;
begin
  select l.page_id
    into held_page_id
    from public.cms_page_locks l
    join public.cms_pages p on p.id = l.page_id
    where p.key = page_key
      and l.token = lock_token
      and l.user_id = auth.uid()
    for update of l;

  if held_page_id is null then
    raise exception 'This editing session no longer holds the lock of page "%"', page_key
      using errcode = 'CMSLL';
  end if;

  return held_page_id;
end;
$$;

-- Writes the draft, or removes it when the content equals the published
-- version: then there is nothing left to publish. Returns the draft's
-- updated_at, or null when no draft remains.
create function public.cms_page_write_draft(target_page_id uuid, target_locale text, next_content jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  published_content jsonb;
  saved_at timestamptz;
begin
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

revoke all on function public.cms_require_permission(text) from public, anon, authenticated;
revoke all on function public.cms_page_lock_ttl() from public, anon, authenticated;
revoke all on function public.cms_page_held_lock(text, uuid) from public, anon, authenticated;
revoke all on function public.cms_page_write_draft(uuid, text, jsonb) from public, anon, authenticated;

-- Content Lock ---------------------------------------------------------------

-- Takes the lock of a page and returns the session token. Creates the page
-- row on first use (C-42). A fresh lock of another user is refused; the
-- caller's own lock (another tab) or a stale one is taken over with a new token.
create function public.cms_page_lock_acquire(page_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_page_id uuid;
  new_token uuid;
begin
  perform public.cms_require_permission('pages.edit');

  insert into public.cms_pages (key)
    values (page_key)
    on conflict (key) do nothing;

  select id into target_page_id from public.cms_pages where key = page_key;

  insert into public.cms_page_locks as l (page_id, user_id)
    values (target_page_id, auth.uid())
    on conflict (page_id) do update
      set token = excluded.token,
          user_id = excluded.user_id,
          acquired_at = now(),
          heartbeat_at = now()
      where l.user_id = excluded.user_id
         or l.heartbeat_at <= now() - public.cms_page_lock_ttl()
    returning token into new_token;

  if new_token is null then
    raise exception 'Page "%" is being edited by another user', page_key
      using errcode = 'CMSLK';
  end if;

  return new_token;
end;
$$;

create function public.cms_page_lock_heartbeat(page_key text, lock_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  held_page_id uuid;
begin
  perform public.cms_require_permission('pages.edit');
  held_page_id := public.cms_page_held_lock(page_key, lock_token);

  update public.cms_page_locks
    set heartbeat_at = now()
    where page_id = held_page_id;
end;
$$;

-- Idempotent: releasing a lock the session no longer holds is not an error.
create function public.cms_page_lock_release(page_key text, lock_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.cms_page_locks l
    using public.cms_pages p
    where p.id = l.page_id
      and p.key = page_key
      and l.token = lock_token
      and l.user_id = auth.uid();
end;
$$;

create function public.cms_page_lock_force_unlock(page_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.cms_require_permission('pages.unlock');

  delete from public.cms_page_locks l
    using public.cms_pages p
    where p.id = l.page_id
      and p.key = page_key;
end;
$$;

-- Draft / Publish / Restore --------------------------------------------------

create function public.cms_page_save_draft(
  page_key text,
  page_locale text,
  content jsonb,
  lock_token uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  held_page_id uuid;
begin
  perform public.cms_require_permission('pages.edit');
  held_page_id := public.cms_page_held_lock(page_key, lock_token);

  return public.cms_page_write_draft(held_page_id, page_locale, content);
end;
$$;

-- Promotes the saved draft: revision, published row and removal of the draft
-- in one transaction. Publishes only what was saved; there is no content
-- argument. Returns the publication time.
create function public.cms_page_publish(
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

  insert into public.cms_page_revisions (page_id, locale, content, created_at, created_by)
    values (held_page_id, page_locale, draft_content, publication_time, auth.uid());

  insert into public.cms_page_published as pp (page_id, locale, content, published_at)
    values (held_page_id, page_locale, draft_content, publication_time)
    on conflict (page_id, locale) do update
      set content = excluded.content,
          published_at = excluded.published_at;

  return publication_time;
end;
$$;

-- Copies a revision into the draft. An existing draft is replaced only when
-- the caller confirms it (replace_draft), so a colleague's unpublished work
-- is never overwritten silently. Restoring the published version removes the
-- draft, which resets the page to what is live.
create function public.cms_page_restore(
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
begin
  perform public.cms_require_permission('pages.edit');
  held_page_id := public.cms_page_held_lock(page_key, lock_token);

  select r.content
    into revision_content
    from public.cms_page_revisions r
    where r.id = revision_id
      and r.page_id = held_page_id
      and r.locale = page_locale;

  if revision_content is null then
    raise exception 'Revision % does not belong to page "%" in locale "%"', revision_id, page_key, page_locale
      using errcode = 'P0002';
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

revoke all on function public.cms_page_lock_acquire(text) from public, anon, authenticated;
revoke all on function public.cms_page_lock_heartbeat(text, uuid) from public, anon, authenticated;
revoke all on function public.cms_page_lock_release(text, uuid) from public, anon, authenticated;
revoke all on function public.cms_page_lock_force_unlock(text) from public, anon, authenticated;
revoke all on function public.cms_page_save_draft(text, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.cms_page_publish(text, text, uuid) from public, anon, authenticated;
revoke all on function public.cms_page_restore(text, text, uuid, uuid, boolean) from public, anon, authenticated;

grant execute on function public.cms_page_lock_acquire(text) to authenticated;
grant execute on function public.cms_page_lock_heartbeat(text, uuid) to authenticated;
grant execute on function public.cms_page_lock_release(text, uuid) to authenticated;
grant execute on function public.cms_page_lock_force_unlock(text) to authenticated;
grant execute on function public.cms_page_save_draft(text, text, jsonb, uuid) to authenticated;
grant execute on function public.cms_page_publish(text, text, uuid) to authenticated;
grant execute on function public.cms_page_restore(text, text, uuid, uuid, boolean) to authenticated;
