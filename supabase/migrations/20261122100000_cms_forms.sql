-- CMS Core migration: forms and submissions (011).
--
-- Forms are declared in the site code (cms.forms.ts → #cms/forms): the code is
-- the source of truth that a form exists and what fields it has (D-33). The
-- database keeps only what the owner changes (cms_forms: on / off) and the
-- submissions. There is no sync: a form without a row is on; a submission
-- keeps its form key even after the form is gone from the code (no FK).
--
-- Writing a submission (D-31): only the server route of Core, with the secret
-- key, through cms_form_submit. The function is not callable by anon or
-- authenticated. The holder of the secret key bypasses RLS by design: this is
-- a contract of the server code, not a database boundary.
--
-- Reading and handling submissions: owner and admin (forms.view /
-- forms.manage). Personal data, so editors do not see them. A submission is
-- changed only in where it is (inbox / archived / spam) and whether it is read:
-- column privileges, not only RLS, keep the payload as it was sent.

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
        when 'languages.manage' then role = 'owner'
        when 'pages.edit' then role in ('owner', 'admin', 'editor')
        when 'pages.publish' then role in ('owner', 'admin')
        when 'pages.unlock' then role in ('owner', 'admin')
        when 'media.upload' then role in ('owner', 'admin', 'editor')
        when 'media.edit' then role in ('owner', 'admin', 'editor')
        when 'media.delete' then role in ('owner', 'admin')
        when 'forms.view' then role in ('owner', 'admin')
        when 'forms.manage' then role in ('owner', 'admin')
        else false
      end
      from public.cms_users
      where user_id = auth.uid()
        and status = 'active'
    ),
    false
  );
$$;

-- Owner settings of a form ------------------------------------------------------------

create table public.cms_forms (
  -- The form key from cms.forms.ts: identity from the code, never renamed here.
  key text primary key
    constraint cms_forms_key check (key ~ '^[A-Za-z][A-Za-z0-9_-]*$' and char_length(key) <= 64),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.cms_forms is
  'What the owner changed about a form declared in the site code. No row: the form is on.';

create function public.cms_forms_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

revoke all on function public.cms_forms_stamp() from public, anon, authenticated;

create trigger cms_forms_stamp
  before insert or update on public.cms_forms
  for each row
  execute function public.cms_forms_stamp();

alter table public.cms_forms enable row level security;

create policy "cms_forms_select"
  on public.cms_forms
  for select
  to authenticated
  using (public.cms_can('forms.view'));

create policy "cms_forms_insert"
  on public.cms_forms
  for insert
  to authenticated
  with check (public.cms_can('forms.manage'));

create policy "cms_forms_update"
  on public.cms_forms
  for update
  to authenticated
  using (public.cms_can('forms.manage'))
  with check (public.cms_can('forms.manage'));

revoke all on table public.cms_forms from anon, authenticated;
grant select on table public.cms_forms to authenticated;
grant insert (key, enabled) on table public.cms_forms to authenticated;
-- The key is the identity from the code: it cannot be changed.
grant update (enabled) on table public.cms_forms to authenticated;

-- Turns a form on or off. Runs as the caller: the grants and RLS above apply.
create function public.cms_form_set_enabled(form_key text, form_enabled boolean)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.cms_forms (key, enabled)
    values (form_key, form_enabled)
    on conflict (key) do update set enabled = excluded.enabled;
$$;

revoke all on function public.cms_form_set_enabled(text, boolean) from public, anon, authenticated;
grant execute on function public.cms_form_set_enabled(text, boolean) to authenticated;

-- Submissions -------------------------------------------------------------------------

create table public.cms_form_submissions (
  id uuid primary key default gen_random_uuid(),
  -- No foreign key: a form exists in the code, a row in cms_forms is optional.
  form_key text not null
    constraint cms_form_submissions_form_key check (form_key ~ '^[A-Za-z][A-Za-z0-9_-]*$' and char_length(form_key) <= 64),
  -- Field key → value, as the server validated and normalized it.
  payload jsonb not null
    constraint cms_form_submissions_payload check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 65536),
  -- sha256 of payload::text (canonical in Postgres): a retry with the same
  -- client token must carry the same values.
  payload_fingerprint text not null,
  location text not null default 'inbox'
    constraint cms_form_submissions_location check (location in ('inbox', 'archived', 'spam')),
  read_at timestamptz,
  -- Path of the page the form was sent from, without query or fragment.
  page_path text
    constraint cms_form_submissions_page_path check (char_length(page_path) <= 300),
  locale public.cms_locale,
  -- One logical sending in the browser: retries reuse it (idempotency).
  client_token uuid not null,
  -- Lowercased name / email / phone / message, built by the server from the
  -- field roles of the form. Other fields are not searchable.
  search_text text not null default ''
    constraint cms_form_submissions_search_text check (char_length(search_text) <= 2000),
  created_at timestamptz not null default now(),
  constraint cms_form_submissions_token unique (form_key, client_token)
);

comment on table public.cms_form_submissions is
  'Submissions of the site forms. Written only by the server route (cms_form_submit).';

create index cms_form_submissions_list
  on public.cms_form_submissions (location, created_at desc);

create index cms_form_submissions_form
  on public.cms_form_submissions (form_key, location, created_at desc);

-- The unread counter of the admin menu.
create index cms_form_submissions_unread
  on public.cms_form_submissions (created_at desc)
  where location = 'inbox' and read_at is null;

alter table public.cms_form_submissions enable row level security;

create policy "cms_form_submissions_select"
  on public.cms_form_submissions
  for select
  to authenticated
  using (public.cms_can('forms.view'));

create policy "cms_form_submissions_update"
  on public.cms_form_submissions
  for update
  to authenticated
  using (public.cms_can('forms.manage'))
  with check (public.cms_can('forms.manage'));

create policy "cms_form_submissions_delete"
  on public.cms_form_submissions
  for delete
  to authenticated
  using (public.cms_can('forms.manage'));

revoke all on table public.cms_form_submissions from anon, authenticated;
grant select, delete on table public.cms_form_submissions to authenticated;
-- Where a submission is and whether it is read; nothing it was sent with.
grant update (location, read_at) on table public.cms_form_submissions to authenticated;

-- Per form: how many submissions, unread, the latest, where they came from.
-- Runs as the caller, so RLS hides it all from editors.
create function public.cms_form_stats()
returns table (form_key text, total bigint, unread bigint, last_at timestamptz, sources text[])
language sql
stable
security invoker
set search_path = ''
as $$
  select
    s.form_key,
    count(*) filter (where s.location <> 'spam'),
    count(*) filter (where s.location = 'inbox' and s.read_at is null),
    max(s.created_at) filter (where s.location <> 'spam'),
    (array_agg(distinct s.page_path) filter (where s.page_path is not null and s.location <> 'spam'))[1:20]
  from public.cms_form_submissions s
  group by s.form_key;
$$;

revoke all on function public.cms_form_stats() from public, anon, authenticated;
grant execute on function public.cms_form_stats() to authenticated;

-- Rate limits -------------------------------------------------------------------------
-- Fixed windows per bucket. A bucket is a pseudonym of the visitor (HMAC of
-- the address, made by the server) with the form, or alone (all forms), or the
-- form alone (every visitor together: a ceiling that does not depend on the
-- address). Only cms_form_submit touches it.

create table public.cms_form_rate_limits (
  bucket text not null
    constraint cms_form_rate_limits_bucket check (char_length(bucket) <= 200),
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket, window_start)
);

create index cms_form_rate_limits_window on public.cms_form_rate_limits (window_start);

alter table public.cms_form_rate_limits enable row level security;
revoke all on table public.cms_form_rate_limits from anon, authenticated;

-- Writing a submission ------------------------------------------------------------------
-- Statuses (returned, not raised, so counted attempts are kept):
--   ok            stored, `submission_id` is the new row;
--   duplicate     the same client token with the same values: the row it made;
--   token_reused  the same client token with other values: refused;
--   rate_limited  too many attempts from this visitor in the window;
--   form_limited  too many attempts to this form from everyone in the window
--                 (the server logs it: a flood, or the ceiling is too low);
--   disabled      the owner turned the form off.
-- `client_hash` is null when the server has no trustworthy address of the
-- visitor: then only the limit of the form counts, never one shared bucket of
-- "unknown" visitors that one sender could fill for all.
create function public.cms_form_submit(
  form_key text,
  payload jsonb,
  client_token uuid,
  search_text text,
  client_hash text,
  page_path text,
  page_locale text,
  form_limit integer default 5,
  client_limit integer default 10,
  window_seconds integer default 600,
  total_limit integer default 50
)
returns table (status text, submission_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  fingerprint text;
  existing record;
  window_begin timestamptz;
  form_count integer;
  client_count integer;
  total_count integer;
  new_id uuid;
  stored_locale public.cms_locale;
begin
  if jsonb_typeof(payload) is distinct from 'object' or client_token is null
    or form_key is null or char_length(client_hash) > 128
    or window_seconds is null or window_seconds < 1
    or form_limit is null or form_limit < 1 or client_limit is null or client_limit < 1
    or total_limit is null or total_limit < 1 then
    raise exception 'Invalid submission' using errcode = '22023';
  end if;

  fingerprint := encode(sha256(convert_to(payload::text, 'UTF8')), 'hex');
  window_begin := to_timestamp(floor(extract(epoch from now()) / window_seconds) * window_seconds);

  -- Requests with one client token run one after another: a retry that comes
  -- while the first is still being written waits, finds it and does not count
  -- against the limit a second time.
  perform pg_advisory_xact_lock(hashtextextended(form_key || ':' || client_token::text, 0));

  select s.id, s.payload_fingerprint
    into existing
    from public.cms_form_submissions s
    where s.form_key = cms_form_submit.form_key and s.client_token = cms_form_submit.client_token;

  if found then
    if existing.payload_fingerprint = fingerprint then
      return query select 'duplicate'::text, existing.id;
    else
      return query select 'token_reused'::text, null::uuid;
    end if;

    return;
  end if;

  -- Bounded cleanup of old windows: only for attempts that count, so retries
  -- of a stored submission stay cheap; before the limits, so it runs for
  -- refused attempts too.
  delete from public.cms_form_rate_limits r
    where r.ctid in (
      select o.ctid
        from public.cms_form_rate_limits o
        where o.window_start < now() - interval '1 day'
        limit 100
    );

  if client_hash is not null then
    insert into public.cms_form_rate_limits as r (bucket, window_start, count)
      values ('form:' || form_key || ':' || client_hash, window_begin, 1)
      on conflict (bucket, window_start) do update set count = r.count + 1
      returning r.count into form_count;

    insert into public.cms_form_rate_limits as r (bucket, window_start, count)
      values ('client:' || client_hash, window_begin, 1)
      on conflict (bucket, window_start) do update set count = r.count + 1
      returning r.count into client_count;

    if form_count > form_limit or client_count > client_limit then
      return query select 'rate_limited'::text, null::uuid;
      return;
    end if;
  end if;

  -- The ceiling of the form for everyone, counted only for attempts a visitor
  -- limit let through: one blocked sender does not use it up for the others.
  insert into public.cms_form_rate_limits as r (bucket, window_start, count)
    values ('total:' || form_key, window_begin, 1)
    on conflict (bucket, window_start) do update set count = r.count + 1
    returning r.count into total_count;

  if total_count > total_limit then
    return query select 'form_limited'::text, null::uuid;
    return;
  end if;

  if exists (select 1 from public.cms_forms f where f.key = cms_form_submit.form_key and not f.enabled) then
    return query select 'disabled'::text, null::uuid;
    return;
  end if;

  -- The language the page was in, when it is an active language of the site.
  select l.code
    into stored_locale
    from public.cms_languages l
    where l.code::text = page_locale and l.active;

  begin
    insert into public.cms_form_submissions
      (form_key, payload, payload_fingerprint, page_path, locale, client_token, search_text)
      values (
        form_key,
        payload,
        fingerprint,
        left(page_path, 300),
        stored_locale,
        client_token,
        left(coalesce(search_text, ''), 2000)
      )
      returning id into new_id;
  exception when unique_violation then
    -- Not expected under the lock above; the counters stay as they are.
    select s.id, s.payload_fingerprint
      into existing
      from public.cms_form_submissions s
      where s.form_key = cms_form_submit.form_key and s.client_token = cms_form_submit.client_token;

    if existing.payload_fingerprint = fingerprint then
      return query select 'duplicate'::text, existing.id;
    else
      return query select 'token_reused'::text, null::uuid;
    end if;

    return;
  end;

  return query select 'ok'::text, new_id;
end;
$$;

revoke all on function public.cms_form_submit(text, jsonb, uuid, text, text, text, text, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.cms_form_submit(text, jsonb, uuid, text, text, text, text, integer, integer, integer, integer)
  to service_role;
