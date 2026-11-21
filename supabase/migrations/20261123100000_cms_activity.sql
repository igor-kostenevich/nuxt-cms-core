-- Activity (012a): a protected list of meaningful actions in the CMS.
--
-- Events are written only inside the database, in the same transaction as the
-- action: an insert in the security definer RPCs, and triggers on the tables
-- the admin writes directly through RLS. The browser never logs an event, so a
-- direct API call cannot skip the log or forge one.
--
-- Not logged on purpose (MASTER_PLAN, 012): Save draft, site texts, locks other
-- than force unlock, reading submissions, new submissions from the public form.

-- Table ------------------------------------------------------------------------------

create table public.cms_activity (
  id uuid primary key default gen_random_uuid(),
  -- clock_timestamp, not now(): several events of one transaction (Publish
  -- translation of many pages) keep the order they happened in.
  created_at timestamptz not null default clock_timestamp(),
  -- Null once the user is deleted; the email snapshot keeps who it was.
  actor_id uuid references auth.users (id) on delete set null,
  actor_email text,
  action text not null
    constraint cms_activity_action check (action ~ '^[a-z_]+$' and char_length(action) <= 40),
  entity_type text not null
    constraint cms_activity_entity_type check (entity_type ~ '^[a-z_]+$' and char_length(entity_type) <= 40),
  -- Text: entities have different ids (uuid, language code, form key).
  entity_id text
    constraint cms_activity_entity_id check (char_length(entity_id) <= 200),
  -- Snapshot of the name at the time of the action: the entity can be deleted.
  -- It may be text a user typed (a media file name): render it as plain text only.
  entity_label text
    constraint cms_activity_entity_label check (char_length(entity_label) <= 200),
  locale public.cms_locale,
  revision_id uuid references public.cms_page_revisions (id) on delete set null,
  -- Small extra facts. Never secrets, contacts, submission values or free text
  -- (unlike entity_label, which may hold a user-typed name).
  details jsonb
    constraint cms_activity_details check (
      details is null
        or (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 4096)
    )
);

comment on table public.cms_activity is
  'Meaningful actions in the CMS. Written only by database functions in the transaction of the action.';

create index cms_activity_list
  on public.cms_activity (created_at desc, id desc);

create index cms_activity_entity_type_list
  on public.cms_activity (entity_type, created_at desc, id desc);

alter table public.cms_activity enable row level security;

create policy "cms_activity_select"
  on public.cms_activity
  for select
  to authenticated
  using (public.cms_can('activity.view'));

-- Writes belong to the table owner (postgres), through the trusted functions
-- below. No client role, not even service_role, writes the log directly.
revoke all on table public.cms_activity from public, anon, authenticated, service_role;
grant select on table public.cms_activity to authenticated;

-- Permission -------------------------------------------------------------------------

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
        when 'forms.view' then role in ('owner', 'admin')
        when 'forms.manage' then role in ('owner', 'admin')
        when 'activity.view' then role in ('owner', 'admin')
        else false
      end
      from public.cms_users
      where user_id = auth.uid()
        and status = 'active'
    ),
    false
  );
$$;

-- Logger -----------------------------------------------------------------------------

-- The only writer of cms_activity. Security definer, so it runs as the table
-- owner. No client can execute it: it is called from the security definer RPCs
-- and trigger functions of this migration, which run as the owner too.
create function public.cms_activity_log(
  event_action text,
  event_entity_type text,
  event_entity_id text,
  event_entity_label text,
  event_locale text default null,
  event_revision_id uuid default null,
  event_details jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  insert into public.cms_activity (
    actor_id, actor_email, action, entity_type, entity_id, entity_label, locale, revision_id, details
  )
  values (
    actor,
    (select left(u.email, 320) from auth.users u where u.id = actor),
    event_action,
    event_entity_type,
    left(event_entity_id, 200),
    left(event_entity_label, 200),
    event_locale,
    event_revision_id,
    event_details
  );
end;
$$;

revoke all on function public.cms_activity_log(text, text, text, text, text, uuid, jsonb)
  from public, anon, authenticated, service_role;

-- Pages ------------------------------------------------------------------------------

-- Legacy of the default-language conversion removed in 010d: revisions have one
-- role again, so the column and the guard in Restore go (TODO 010d).
alter table public.cms_page_revisions drop column base;

-- Publish and "Publish translation" (cms_language_publish) both promote through
-- here, so the event is written once per page × locale.
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

  perform public.cms_activity_log(
    'publish', 'page', target_page::text,
    (select p.key from public.cms_pages p where p.id = target_page),
    target_locale, new_revision
  );

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
  had_draft boolean;
  restored_at timestamptz;
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

  had_draft := exists (
    select 1
      from public.cms_page_draft d
      where d.page_id = held_page_id
        and d.locale = page_locale
  );

  if had_draft and not replace_draft then
    raise exception 'Page "%" already has a draft in locale "%"', page_key, page_locale
      using errcode = 'CMSCF';
  end if;

  restored_at := public.cms_page_write_draft(held_page_id, page_locale, revision_content);

  perform public.cms_activity_log(
    'restore', 'page', held_page_id::text, page_key, page_locale, revision_id,
    jsonb_build_object('replacedDraft', had_draft)
  );

  return restored_at;
end;
$$;

create or replace function public.cms_page_lock_force_unlock(page_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  unlocked_page uuid;
begin
  perform public.cms_require_permission('pages.unlock');

  delete from public.cms_page_locks l
    using public.cms_pages p
    where p.id = l.page_id
      and p.key = page_key
    returning l.page_id into unlocked_page;

  -- No lock, nothing happened: no event.
  if unlocked_page is not null then
    perform public.cms_activity_log('force_unlock', 'page', unlocked_page::text, page_key);
  end if;
end;
$$;

-- Media ------------------------------------------------------------------------------

create or replace function public.cms_media_create(
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

  perform public.cms_activity_log('upload', 'media', media_id::text, btrim(display_name));

  return media_id;
end;
$$;

create or replace function public.cms_media_replace(
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
  media_name text;
begin
  perform public.cms_require_permission('media.edit');
  select * into object from public.cms_media_object(storage_path);

  select m.storage_path, m.display_name
    into previous_path, media_name
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

  perform public.cms_activity_log('replace', 'media', media_id::text, media_name);

  return previous_path;
end;
$$;

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

  update public.cms_media m
    set deleted_at = now()
    where m.id = media_id
      and m.deleted_at is null
    returning m.display_name into media_name;

  if not found then
    raise exception 'Media % does not exist', media_id
      using errcode = 'P0002';
  end if;

  perform public.cms_activity_log('delete', 'media', media_id::text, media_name);
end;
$$;

-- Languages --------------------------------------------------------------------------

create or replace function public.cms_language_add(
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

  perform public.cms_activity_log('add', 'language', code, btrim(name));
end;
$$;

comment on function public.cms_language_add(text, text, text, boolean) is
  'Adds a language. The first one is the default: the language of the original, which never changes (C-87).';

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
  delete from public.cms_site_settings_translations t where t.locale = code;
  delete from public.cms_site_texts t where t.locale = code;
  delete from public.cms_languages l where l.code = cms_language_delete.code;

  -- No locale on the event: the language no longer exists, and the column
  -- carries the cms_locale domain only, not a reference.
  perform public.cms_activity_log('delete', 'language', code, target_name);
end;
$$;

create or replace function public.cms_language_set_active(code text, active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_is_default boolean;
  target_active boolean;
  target_name text;
begin
  perform public.cms_require_permission('languages.manage');

  select l.is_default, l.active, l.name
    into target_is_default, target_active, target_name
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

  if target_active is distinct from active then
    perform public.cms_activity_log(case when active then 'show' else 'hide' end, 'language', code, target_name);
  end if;
end;
$$;

-- Trigger functions on direct writes ----------------------------------------------------
--
-- The admin writes these tables through RLS as `authenticated`. The trigger
-- functions are security definer, so their call to the logger runs as the owner
-- like the RPCs above. Triggers fire without an execute privilege on the function.

-- Forms: an actual change of `enabled`. cms_form_set_enabled (security invoker)
-- upserts: no row means the form is on, so the first pause is an INSERT with
-- enabled = false. An INSERT with enabled = true changes nothing and is not logged.
create function public.cms_forms_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  was_enabled boolean := case when tg_op = 'INSERT' then true else old.enabled end;
begin
  if new.enabled is distinct from was_enabled then
    perform public.cms_activity_log(case when new.enabled then 'enable' else 'disable' end, 'form', new.key, new.key);
  end if;

  return null;
end;
$$;

revoke all on function public.cms_forms_activity() from public, anon, authenticated, service_role;

create trigger cms_forms_activity
  after insert or update on public.cms_forms
  for each row
  execute function public.cms_forms_activity();

-- Settings: one event per changed row. Values only from the allow-list:
-- maintenance_mode carries from / to; for the name, contacts, logo and favicon
-- only the field is recorded. A column added later is not logged until it is
-- added here on purpose.
create function public.cms_site_settings_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changes jsonb := '[]'::jsonb;
begin
  if new.maintenance_mode is distinct from old.maintenance_mode then
    changes := changes || jsonb_build_array(jsonb_build_object(
      'field', 'maintenance_mode', 'from', old.maintenance_mode, 'to', new.maintenance_mode
    ));
  end if;

  if new.site_name is distinct from old.site_name then
    changes := changes || jsonb_build_array(jsonb_build_object('field', 'site_name'));
  end if;

  if new.contact_email is distinct from old.contact_email then
    changes := changes || jsonb_build_array(jsonb_build_object('field', 'contact_email'));
  end if;

  if new.contact_phone is distinct from old.contact_phone then
    changes := changes || jsonb_build_array(jsonb_build_object('field', 'contact_phone'));
  end if;

  if new.logo_media_id is distinct from old.logo_media_id then
    changes := changes || jsonb_build_array(jsonb_build_object('field', 'logo'));
  end if;

  if new.favicon_media_id is distinct from old.favicon_media_id then
    changes := changes || jsonb_build_array(jsonb_build_object('field', 'favicon'));
  end if;

  if jsonb_array_length(changes) > 0 then
    perform public.cms_activity_log(
      'update', 'settings', null, null, null, null, jsonb_build_object('changes', changes)
    );
  end if;

  return null;
end;
$$;

revoke all on function public.cms_site_settings_activity() from public, anon, authenticated, service_role;

create trigger cms_site_settings_activity
  after update on public.cms_site_settings
  for each row
  execute function public.cms_site_settings_activity();

-- The site name in a language: upsert from Settings. The cascade of a deleted
-- language is a DELETE and is covered by the language event.
create function public.cms_site_settings_translations_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.site_name is distinct from old.site_name then
    perform public.cms_activity_log(
      'update', 'settings', null, null, new.locale, null,
      jsonb_build_object('changes', jsonb_build_array(jsonb_build_object('field', 'site_name')))
    );
  end if;

  return null;
end;
$$;

revoke all on function public.cms_site_settings_translations_activity() from public, anon, authenticated, service_role;

create trigger cms_site_settings_translations_activity
  after insert or update on public.cms_site_settings_translations
  for each row
  execute function public.cms_site_settings_translations_activity();

-- Submissions: one event per statement and target location, counting only the
-- rows whose location actually changed. No `update of location`: a trigger with
-- transition tables cannot have a column list, so the check is in the function.
-- read_at changes and no-ops give count 0 and no event. The public form inserts
-- through cms_form_submit and has no insert trigger.
create function public.cms_form_submissions_moved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  moved record;
begin
  for moved in
    select n.location as target,
           count(*)::integer as moved_count,
           min(n.form_key) as first_form,
           max(n.form_key) as last_form,
           min(n.id::text) as only_id
      from new_rows n
      join old_rows o on o.id = n.id
      where o.location is distinct from n.location
      group by n.location
  loop
    perform public.cms_activity_log(
      case moved.target when 'archived' then 'archive' when 'spam' then 'spam' else 'inbox' end,
      'submission',
      case when moved.moved_count = 1 then moved.only_id end,
      case when moved.first_form = moved.last_form then moved.first_form end,
      null,
      null,
      jsonb_strip_nulls(jsonb_build_object(
        'count', moved.moved_count,
        'form', case when moved.first_form = moved.last_form then moved.first_form end
      ))
    );
  end loop;

  return null;
end;
$$;

revoke all on function public.cms_form_submissions_moved() from public, anon, authenticated, service_role;

create trigger cms_form_submissions_moved
  after update on public.cms_form_submissions
  referencing old table as old_rows new table as new_rows
  for each statement
  execute function public.cms_form_submissions_moved();

-- Deleted for good: only the number and the form, nothing the submission carried.
create function public.cms_form_submissions_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
  first_form text;
  last_form text;
begin
  select count(*)::integer, min(o.form_key), max(o.form_key)
    into deleted_count, first_form, last_form
    from old_rows o;

  if deleted_count > 0 then
    perform public.cms_activity_log(
      'delete',
      'submission',
      null,
      case when first_form = last_form then first_form end,
      null,
      null,
      jsonb_strip_nulls(jsonb_build_object(
        'count', deleted_count,
        'form', case when first_form = last_form then first_form end
      ))
    );
  end if;

  return null;
end;
$$;

revoke all on function public.cms_form_submissions_deleted() from public, anon, authenticated, service_role;

create trigger cms_form_submissions_deleted
  after delete on public.cms_form_submissions
  referencing old table as old_rows
  for each statement
  execute function public.cms_form_submissions_deleted();
