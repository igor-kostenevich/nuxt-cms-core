-- CMS Core migration: translating the whole site (010b).
--
-- Field registry (C-84). A text the page shows from its code default is not
-- stored anywhere (C-42, C-47), so nothing outside Edit Mode knew it existed.
-- Edit Mode now records the translatable fields of a page when it opens it:
-- address, kind, label and the text from code. Content and drafts are not
-- touched; the code default stays the default.
--
-- Site texts (C-85). Texts that are not on any CMS page: toasts, form
-- messages, menu, footer, 404, <title>. The Client declares them in
-- cms.texts.ts with their text in code; a stored value per language
-- overrides it. They are saved at once, by those who may publish.
--
-- The Texts screen (C-86) translates page fields into the draft of a language
-- (cms_page_translate) and publishes a language in one go (cms_language_publish).

-- Field registry ------------------------------------------------------------------

alter table public.cms_pages
  add column edit_path text,
  add constraint cms_pages_edit_path_format
    check (edit_path is null or (edit_path ~ '^/' and char_length(edit_path) <= 500));

comment on column public.cms_pages.edit_path is
  'Site path the page was last opened at in Edit Mode, for links from the Texts screen.';

create table public.cms_page_fields (
  page_id uuid not null references public.cms_pages (id) on delete cascade,
  address text not null,
  kind text not null,
  label text,
  -- The text from the page code, shown while nothing is stored (plain text).
  default_text text,
  -- Where it is: the block of the page (its heading) and the order on the
  -- page, so the Texts screen reads like the page instead of a list of keys.
  section text,
  position integer,
  -- Element of the field (h1, p, a…): a heading reads as "Heading".
  tag text,
  seen_at timestamptz not null default now(),
  primary key (page_id, address),
  constraint cms_page_fields_address
    check (char_length(address) <= 200 and address ~ '^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$'),
  constraint cms_page_fields_kind
    check (kind in ('text', 'richText', 'link', 'button', 'image')),
  constraint cms_page_fields_label_length check (char_length(label) <= 2000),
  constraint cms_page_fields_default_length check (char_length(default_text) <= 2000),
  constraint cms_page_fields_section_length check (char_length(section) <= 200),
  constraint cms_page_fields_tag check (tag ~ '^[a-z][a-z0-9]{0,9}$')
);

comment on table public.cms_page_fields is
  'Translatable fields of a page as Edit Mode last saw them, with the texts from code.';

alter table public.cms_page_fields enable row level security;

create policy "cms_page_fields_select_editors"
  on public.cms_page_fields
  for select
  to authenticated
  using (public.cms_can('pages.edit'));

revoke all on table public.cms_page_fields from anon, authenticated;
grant select on table public.cms_page_fields to authenticated;

-- Records the fields Edit Mode saw on a page. Fields not seen this time are
-- gone from the code, unless they sit under a hidden optional block: those are
-- not mounted while hidden (`hidden_prefixes`), so they stay.
create function public.cms_page_register_fields(
  page_key text,
  edit_path text,
  fields jsonb,
  hidden_prefixes text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_page uuid;
begin
  perform public.cms_require_permission('pages.edit');

  select p.id into target_page from public.cms_pages p where p.key = page_key;

  if target_page is null then
    raise exception 'Page "%" does not exist', page_key
      using errcode = 'P0002';
  end if;

  if jsonb_typeof(fields) <> 'array' or jsonb_array_length(fields) > 2000
    or cardinality(coalesce(hidden_prefixes, '{}')) > 500 then
    raise exception 'Too many fields'
      using errcode = '23514';
  end if;

  update public.cms_pages p
    set edit_path = cms_page_register_fields.edit_path
    where p.id = target_page;

  insert into public.cms_page_fields as pf (page_id, address, kind, label, default_text, section, position, tag, seen_at)
    select distinct on (f ->> 'address')
        target_page,
        f ->> 'address',
        f ->> 'kind',
        nullif(left(f ->> 'label', 2000), ''),
        nullif(left(f ->> 'defaultText', 2000), ''),
        nullif(left(f ->> 'section', 200), ''),
        case when jsonb_typeof(f -> 'position') = 'number' then (f ->> 'position')::numeric::integer end,
        nullif(lower(f ->> 'tag'), ''),
        now()
      from jsonb_array_elements(fields) as f
      where jsonb_typeof(f) = 'object'
    on conflict (page_id, address) do update
      set kind = excluded.kind,
          label = excluded.label,
          default_text = excluded.default_text,
          section = excluded.section,
          position = excluded.position,
          tag = excluded.tag,
          seen_at = excluded.seen_at;

  delete from public.cms_page_fields pf
    where pf.page_id = target_page
      and not exists (
        select 1 from jsonb_array_elements(fields) as f where f ->> 'address' = pf.address
      )
      and not exists (
        select 1
          from unnest(coalesce(hidden_prefixes, '{}')) as h (prefix)
          where left(pf.address, char_length(h.prefix) + 1) = h.prefix || '.'
      );
end;
$$;

-- Site texts ----------------------------------------------------------------------

create table public.cms_site_texts (
  key text not null,
  locale public.cms_locale not null references public.cms_languages (code),
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  primary key (key, locale),
  constraint cms_site_texts_key
    check (char_length(key) <= 200 and key ~ '^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$'),
  constraint cms_site_texts_value_length
    check (char_length(value) between 1 and 2000)
);

comment on table public.cms_site_texts is
  'Site texts declared in the Client''s cms.texts.ts, changed per language. No row: the default language, then the code.';

create function public.cms_site_texts_touch()
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

revoke all on function public.cms_site_texts_touch() from public, anon, authenticated;

create trigger cms_site_texts_touch
  before update on public.cms_site_texts
  for each row
  execute function public.cms_site_texts_touch();

alter table public.cms_site_texts enable row level security;

-- The public site reads active languages; CMS users also the hidden ones.
-- Two policies: anon may not execute cms_can().
create policy "cms_site_texts_select_anon"
  on public.cms_site_texts
  for select
  to anon
  using (exists (select 1 from public.cms_languages l where l.code = locale and l.active));

create policy "cms_site_texts_select_authenticated"
  on public.cms_site_texts
  for select
  to authenticated
  using (
    exists (select 1 from public.cms_languages l where l.code = locale and l.active)
    or public.cms_can('pages.edit')
  );

-- Saved at once and live at once: only those who may publish (C-85).
create policy "cms_site_texts_insert_publishers"
  on public.cms_site_texts
  for insert
  to authenticated
  with check (public.cms_can('pages.publish'));

create policy "cms_site_texts_update_publishers"
  on public.cms_site_texts
  for update
  to authenticated
  using (public.cms_can('pages.publish'))
  with check (public.cms_can('pages.publish'));

create policy "cms_site_texts_delete_publishers"
  on public.cms_site_texts
  for delete
  to authenticated
  using (public.cms_can('pages.publish'));

revoke all on table public.cms_site_texts from anon, authenticated;
grant select on table public.cms_site_texts to anon, authenticated;
-- An upsert (PostgREST on_conflict) updates every column it sends, so key and
-- locale need the update grant too; RLS still decides who may write.
grant insert (key, locale, value), update (key, locale, value), delete
  on table public.cms_site_texts
  to authenticated;

-- Stored texts of a language with the default language behind it, as one
-- object. Null: the default language. Texts from code are layered on top by
-- Core. Runs as the caller: RLS decides which languages are visible.
create function public.cms_site_texts_for(page_locale text, bootstrap_locale text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb)
    from (
      select distinct on (t.key) t.key, t.value
        from public.cms_site_texts t
        where t.locale::text in (coalesce(page_locale, ''), coalesce(public.cms_default_locale(bootstrap_locale), ''))
        order by t.key, (t.locale::text = page_locale) desc nulls last
    ) s;
$$;

-- Publishing ----------------------------------------------------------------------

-- A fresh lock: the page is open in Edit Mode right now.
create function public.cms_page_open_in_editor(target_page uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.cms_page_locks l
      where l.page_id = target_page
        and l.heartbeat_at > now() - public.cms_page_lock_ttl()
  );
$$;

-- Promotes the saved draft of a locale: revision, published row and removal
-- of the draft at one time. Null when there is no draft. Shared by Publish of
-- one page and Publish of a language.
create function public.cms_page_promote_draft(target_page uuid, target_locale text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  draft_content jsonb;
  publication_time timestamptz := now();
  default_code text := public.cms_default_locale(null);
begin
  delete from public.cms_page_draft
    where page_id = target_page
      and locale = target_locale
    returning content into draft_content;

  if draft_content is null then
    return null;
  end if;

  insert into public.cms_page_revisions (page_id, locale, content, created_at, created_by, base)
    values (
      target_page,
      target_locale,
      draft_content,
      publication_time,
      auth.uid(),
      default_code is null or default_code = target_locale
    );

  insert into public.cms_page_published as pp (page_id, locale, content, published_at)
    values (target_page, target_locale, draft_content, publication_time)
    on conflict (page_id, locale) do update
      set content = excluded.content,
          published_at = excluded.published_at;

  return publication_time;
end;
$$;

create or replace function public.cms_page_publish(
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
  publication_time timestamptz;
begin
  perform public.cms_require_permission('pages.publish');
  held_page_id := public.cms_page_held_lock(page_key, lock_token);
  publication_time := public.cms_page_promote_draft(held_page_id, page_locale);

  if publication_time is null then
    raise exception 'Page "%" has no draft to publish in locale "%"', page_key, page_locale
      using errcode = 'P0002';
  end if;

  return publication_time;
end;
$$;

-- Translates leaves of a page outside Edit Mode (the Texts screen, file
-- import in 010c): merges `entries` into the draft of the locale (draft ??
-- published); a null value removes the translation. Not the default
-- language, which is edited in Edit Mode. Refused while the page is open in
-- Edit Mode; a stale lock is removed so its session cannot overwrite this
-- later (it gets lock_lost).
create function public.cms_page_translate(page_key text, page_locale text, entries jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_page uuid;
  default_code text := public.cms_default_locale(null);
  current_content jsonb;
  entry record;
begin
  perform public.cms_require_permission('pages.edit');

  select p.id into target_page from public.cms_pages p where p.key = page_key;

  if target_page is null then
    raise exception 'Page "%" does not exist', page_key
      using errcode = 'P0002';
  end if;

  if default_code is null or page_locale = default_code then
    raise exception 'The default language is edited in Edit Mode'
      using errcode = '23514';
  end if;

  if jsonb_typeof(entries) <> 'object' then
    raise exception 'Entries must be an object'
      using errcode = '23514';
  end if;

  perform 1 from public.cms_page_locks l where l.page_id = target_page for update;

  if public.cms_page_open_in_editor(target_page) then
    raise exception 'Page "%" is open in Edit Mode', page_key
      using errcode = 'CMSLK';
  end if;

  delete from public.cms_page_locks l where l.page_id = target_page;

  current_content := coalesce(
    (select d.content from public.cms_page_draft d where d.page_id = target_page and d.locale = page_locale),
    (select pub.content from public.cms_page_published pub where pub.page_id = target_page and pub.locale = page_locale),
    '{}'::jsonb
  );

  for entry in select e.key, e.value from jsonb_each(entries) as e loop
    if jsonb_typeof(entry.value) = 'null' then
      current_content := current_content - entry.key;
    else
      current_content := current_content || jsonb_build_object(entry.key, entry.value);
    end if;
  end loop;

  return public.cms_page_write_draft(target_page, page_locale, current_content);
end;
$$;

-- Publishes the drafts of a language on every page that is not open in Edit
-- Mode. Returns how many were published and how many skipped.
create function public.cms_language_publish(page_locale text)
returns table (published integer, skipped integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  draft record;
  done integer := 0;
  passed integer := 0;
begin
  perform public.cms_require_permission('pages.publish');

  for draft in
    select d.page_id from public.cms_page_draft d where d.locale = page_locale
  loop
    if public.cms_page_open_in_editor(draft.page_id) then
      passed := passed + 1;
    else
      perform public.cms_page_promote_draft(draft.page_id, page_locale);
      done := done + 1;
    end if;
  end loop;

  return query select done, passed;
end;
$$;

-- Deleting a language deletes its site texts too (C-83).
create or replace function public.cms_language_delete(code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_is_default boolean;
begin
  perform public.cms_require_permission('languages.manage');

  lock table public.cms_languages in share row exclusive mode;

  select l.is_default
    into target_is_default
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
end;
$$;

-- Grants --------------------------------------------------------------------------

revoke all on function public.cms_page_register_fields(text, text, jsonb, text[]) from public, anon, authenticated;
revoke all on function public.cms_site_texts_for(text, text) from public, anon, authenticated;
revoke all on function public.cms_page_open_in_editor(uuid) from public, anon, authenticated;
revoke all on function public.cms_page_promote_draft(uuid, text) from public, anon, authenticated;
revoke all on function public.cms_page_translate(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.cms_language_publish(text) from public, anon, authenticated;

grant execute on function public.cms_page_register_fields(text, text, jsonb, text[]) to authenticated;
grant execute on function public.cms_site_texts_for(text, text) to anon, authenticated;
grant execute on function public.cms_page_translate(text, text, jsonb) to authenticated;
grant execute on function public.cms_language_publish(text) to authenticated;
