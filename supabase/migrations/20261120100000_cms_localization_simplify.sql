-- CMS Core migration: simpler localization (010d).
--
-- 1. The language of the original is fixed (C-87). The first language added
--    is the default and stays it: there is no change of the default language,
--    so no conversion of content, and the revision role cannot change any
--    more. The guard is in the table too, not only in the absence of an RPC.
--
-- 2. The Texts screen is a second way into the same drafts (C-89): one write
--    RPC for both the original and a translation, checked against the field
--    registry, and a publish of the chosen pages only, each checked against
--    the draft version the screen showed.
--
-- 3. A page mutex. Writes outside an Edit Mode session (Texts, publish of a
--    language) and taking the lock serialize on the row of the page with
--    FOR NO KEY UPDATE. Not FOR UPDATE: every insert into a table that
--    references cms_pages (drafts, revisions, published, locks, fields) takes
--    FOR KEY SHARE on that row for the foreign key check, and FOR UPDATE would
--    make an Edit Mode publish wait for it while the Texts screen waits for
--    the Edit Mode lock row: a deadlock. FOR NO KEY UPDATE conflicts with
--    itself only. Lock order everywhere: page row, lock row, draft row.

-- The language of the original is fixed --------------------------------------------

drop function public.cms_language_set_default(text);
drop function public.cms_page_rebase_pair(uuid, text, text, jsonb, jsonb, boolean);
drop function public.cms_translation_apply(jsonb, jsonb);
drop function public.cms_translation_extract(jsonb, jsonb);
drop function public.cms_translation_addresses(jsonb);

-- The default flag never changes on an existing row.
create function public.cms_languages_keep_default()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_default is distinct from old.is_default then
    raise exception 'The language of the original cannot change'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger cms_languages_keep_default
  before update of is_default on public.cms_languages
  for each row
  execute function public.cms_languages_keep_default();

-- The default language is not deleted while other languages remain: they are
-- translations of it. Deleting every language (back to the bootstrap state of
-- cms.config.ts) stays possible, for maintenance and test fixtures.
create function public.cms_languages_keep_default_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from removed where removed.is_default)
    and exists (select 1 from public.cms_languages) then
    raise exception 'The language of the original cannot be deleted'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create trigger cms_languages_keep_default_row
  after delete on public.cms_languages
  referencing old table as removed
  for each statement
  execute function public.cms_languages_keep_default_row();

revoke all on function public.cms_languages_keep_default() from public, anon, authenticated;
revoke all on function public.cms_languages_keep_default_row() from public, anon, authenticated;

comment on function public.cms_language_add(text, text, text, boolean) is
  'Adds a language. The first one is the default: the language of the original, which never changes (C-87).';

-- Content helpers -----------------------------------------------------------------

-- The document without the leaf at the address, and without the objects the
-- removal leaves empty. The document unchanged when there is nothing there.
-- Null when the address goes through a list or a value: a stored collection
-- item has no text from code to fall back to.
create function public.cms_content_remove(doc jsonb, segments text[])
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  head text := segments[1];
  rest text[] := segments[2:];
  child jsonb;
  next_child jsonb;
begin
  if cardinality(segments) = 0 or jsonb_typeof(doc) is distinct from 'object' then
    return null;
  end if;

  if cardinality(segments) = 1 then
    return doc - head;
  end if;

  child := doc -> head;

  if child is null then
    return doc;
  end if;

  if jsonb_typeof(child) <> 'object' then
    return null;
  end if;

  next_child := public.cms_content_remove(child, rest);

  if next_child is null then
    return null;
  end if;

  if next_child = '{}'::jsonb then
    return doc - head;
  end if;

  return jsonb_set(doc, array[head], next_child);
end;
$$;

revoke all on function public.cms_content_remove(jsonb, text[]) from public, anon, authenticated;

-- Field registry: the collection item a field is in -------------------------------
-- The Texts screen named "Heading · item 2" from a positional `default-N` id.
-- Items from code now have their own ids (C-88), so Edit Mode records the
-- number of the item as the page shows it.

alter table public.cms_page_fields
  add column item integer,
  add constraint cms_page_fields_item check (item between 1 and 10000);

comment on column public.cms_page_fields.item is
  'Number of the collection item the field is in (1-based), as the page shows it.';

create or replace function public.cms_page_register_fields(
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

  insert into public.cms_page_fields as pf (page_id, address, kind, label, default_text, section, position, tag, item, seen_at)
    select distinct on (f ->> 'address')
        target_page,
        f ->> 'address',
        f ->> 'kind',
        nullif(left(f ->> 'label', 2000), ''),
        nullif(left(f ->> 'defaultText', 2000), ''),
        nullif(left(f ->> 'section', 200), ''),
        case when jsonb_typeof(f -> 'position') = 'number' then (f ->> 'position')::numeric::integer end,
        nullif(lower(f ->> 'tag'), ''),
        case when jsonb_typeof(f -> 'item') = 'number' then (f ->> 'item')::numeric::integer end,
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
          item = excluded.item,
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

-- Writing texts from the Texts screen ----------------------------------------------

drop function public.cms_page_translate(text, text, jsonb);

-- Changes texts of a page in the draft of a locale (draft ?? published).
-- `entries`: { <leaf address>: text | null }. A leaf must be the text leaf of
-- a field the registry holds for the page (C-84): a text, the label of a link
-- or button, the alt of an image. So hrefs, media, structure and rich text
-- cannot be changed this way.
--
-- The original: the leaf is written into the tree. Null returns the field to
-- its text from code, which only exists outside a stored list. A translation:
-- the leaf is merged into the flat object; null removes it (the original shows).
--
-- Refused while the page is open in Edit Mode; a stale lock is removed so its
-- session cannot overwrite this later (it gets lock_lost).
create function public.cms_page_set_texts(page_key text, page_locale text, entries jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_page uuid;
  default_code text := public.cms_default_locale(null);
  is_original boolean;
  current_content jsonb;
  next_content jsonb;
  entry record;
begin
  perform public.cms_require_permission('pages.edit');

  if jsonb_typeof(entries) is distinct from 'object' then
    raise exception 'Entries must be an object'
      using errcode = '23514';
  end if;

  if (select count(*) from jsonb_object_keys(entries)) > 500 then
    raise exception 'Too many texts at once'
      using errcode = '23514';
  end if;

  -- The page mutex (see the header): waits for another write of this page.
  select p.id
    into target_page
    from public.cms_pages p
    where p.key = page_key
    for no key update;

  if target_page is null then
    raise exception 'Page "%" does not exist', page_key
      using errcode = 'P0002';
  end if;

  perform 1 from public.cms_page_locks l where l.page_id = target_page for update;

  if public.cms_page_open_in_editor(target_page) then
    raise exception 'Page "%" is open in Edit Mode', page_key
      using errcode = 'CMSLK';
  end if;

  delete from public.cms_page_locks l where l.page_id = target_page;

  is_original := default_code is null or page_locale = default_code;

  current_content := coalesce(
    (select d.content from public.cms_page_draft d where d.page_id = target_page and d.locale = page_locale),
    (select pub.content from public.cms_page_published pub where pub.page_id = target_page and pub.locale = page_locale),
    '{}'::jsonb
  );

  for entry in select e.key, e.value from jsonb_each(entries) as e loop
    if jsonb_typeof(entry.value) not in ('string', 'null')
      or char_length(coalesce(entry.value #>> '{}', '')) > 2000 then
      raise exception 'The text of "%" must be a string of up to 2000 characters', left(entry.key, 80)
        using errcode = '23514';
    end if;

    if not exists (
      select 1
        from public.cms_page_fields f
        where f.page_id = target_page
          and entry.key = case f.kind
            when 'text' then f.address
            when 'image' then f.address || '.alt'
            when 'link' then f.address || '.label'
            when 'button' then f.address || '.label'
          end
    ) then
      raise exception 'Address "%" is not a text of page "%"', left(entry.key, 80), page_key
        using errcode = '23514';
    end if;

    if not is_original then
      if jsonb_typeof(entry.value) = 'null' then
        current_content := current_content - entry.key;
      else
        current_content := current_content || jsonb_build_object(entry.key, entry.value);
      end if;

      continue;
    end if;

    if jsonb_typeof(entry.value) = 'null' then
      next_content := public.cms_content_remove(current_content, string_to_array(entry.key, '.'));

      if next_content is null then
        raise exception 'Address "%" has no text from code to return to', left(entry.key, 80)
          using errcode = '23514';
      end if;
    else
      next_content := public.cms_content_set(current_content, string_to_array(entry.key, '.'), entry.value);

      if next_content is null then
        raise exception 'Address "%" no longer exists on the page', left(entry.key, 80)
          using errcode = '23514';
      end if;
    end if;

    current_content := next_content;
  end loop;

  return public.cms_page_write_draft(target_page, page_locale, current_content);
end;
$$;

-- Taking the lock waits for a write from the Texts screen: otherwise the
-- editor could load the draft before that write commits and save over it.
create or replace function public.cms_page_lock_acquire(page_key text)
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

  -- The page mutex (see the header).
  select id into target_page_id from public.cms_pages where key = page_key for no key update;

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

-- Publishing chosen pages of a language --------------------------------------------

drop function public.cms_language_publish(text);

-- Publishes the drafts of a language on the chosen pages:
-- `pages` = [{ "key": "home", "draftUpdatedAt": "<updated_at as the screen read it>" }].
-- A page is skipped when its draft changed since (the screen showed another
-- version), it has no draft, or it is open in Edit Mode. The check and the
-- publish happen under the page mutex and the draft row lock, so nothing
-- writes in between. Pages are taken in key order, so two publishes cannot
-- wait for each other.
create function public.cms_language_publish(page_locale text, pages jsonb)
returns table (published integer, skipped integer, skipped_keys text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
  target_page uuid;
  draft_at timestamptz;
  done integer := 0;
  passed text[] := '{}';
begin
  perform public.cms_require_permission('pages.publish');

  if jsonb_typeof(pages) is distinct from 'array' or jsonb_array_length(pages) > 1000 then
    raise exception 'Pages must be a list of up to 1000 pages'
      using errcode = '23514';
  end if;

  for item in
    select distinct on (e ->> 'key') e ->> 'key' as key, e ->> 'draftUpdatedAt' as marker
      from jsonb_array_elements(pages) as e
      where jsonb_typeof(e) = 'object' and jsonb_typeof(e -> 'key') = 'string'
      order by e ->> 'key'
  loop
    select p.id
      into target_page
      from public.cms_pages p
      where p.key = item.key
      for no key update;

    draft_at := null;

    if target_page is not null then
      select d.updated_at
        into draft_at
        from public.cms_page_draft d
        where d.page_id = target_page
          and d.locale = page_locale
        for update;
    end if;

    if draft_at is null
      or item.marker is null
      or draft_at <> item.marker::timestamptz
      or public.cms_page_open_in_editor(target_page) then
      passed := passed || item.key;
      continue;
    end if;

    perform public.cms_page_promote_draft(target_page, page_locale);
    done := done + 1;
  end loop;

  return query select done, cardinality(passed), passed;
end;
$$;

-- Grants --------------------------------------------------------------------------

revoke all on function public.cms_page_set_texts(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.cms_language_publish(text, jsonb) from public, anon, authenticated;

grant execute on function public.cms_page_set_texts(text, text, jsonb) to authenticated;
grant execute on function public.cms_language_publish(text, jsonb) to authenticated;
