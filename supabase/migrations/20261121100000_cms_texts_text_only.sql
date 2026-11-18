-- CMS Core migration: the Texts screen writes texts only (010d, after review).
--
-- cms_page_set_texts accepted any address the field registry holds for the
-- page. The registry is written by the client (Edit Mode registers what it
-- mounts), so a forged or outdated entry — `hero.cta.href` registered as a
-- text, `hero.image` registered as a text after the field became an image —
-- let the text endpoint change a link, a media id, a switch or replace a
-- whole value with a string.
--
-- Core has no trusted schema of a page (the page code owns it, C-01), so the
-- check uses what it can trust: the formats of the primitives (C-47, C-49,
-- C-67) and the stored original. A leaf is a text when
--   - its last segment is not a non-text property of a primitive value
--     (id, href, newTab, mediaId, focal, decorative, hidden);
--   - the original stores a string there, or nothing;
--   - no stored ancestor is a scalar or a rich text document.
-- A translation is checked against the original it translates.
--
-- Limit: an address the original does not store yet (a field still showing
-- its value from code) is accepted by name; a string written there where the
-- page code expects an object is ignored by the primitive (it renders its
-- default). Edit Mode is unchanged: it saves whole values under the lock.

-- The leaf `address` of the original `doc` can hold a text.
create function public.cms_page_text_target(doc jsonb, address text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  segments text[] := string_to_array(address, '.');
  node jsonb;
begin
  if cardinality(segments) = 0
    or segments[cardinality(segments)] in ('id', 'href', 'newTab', 'mediaId', 'focal', 'decorative', 'hidden') then
    return false;
  end if;

  for depth in 1 .. cardinality(segments) - 1 loop
    node := public.cms_content_get(doc, array_to_string(segments[1:depth], '.'));

    if node is not null and (
      jsonb_typeof(node) not in ('object', 'array')
      or (jsonb_typeof(node) = 'object' and node ->> 'type' = 'doc')
    ) then
      return false;
    end if;
  end loop;

  node := public.cms_content_get(doc, address);
  return node is null or jsonb_typeof(node) in ('string', 'null');
end;
$$;

revoke all on function public.cms_page_text_target(jsonb, text) from public, anon, authenticated;

-- Same as in 20261120100000, plus the check above. `create or replace` keeps
-- the grants (execute: authenticated).
create or replace function public.cms_page_set_texts(page_key text, page_locale text, entries jsonb)
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
  original_content jsonb;
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

  -- A translation is checked against the original it translates.
  if not is_original then
    original_content := coalesce(
      (select d.content from public.cms_page_draft d where d.page_id = target_page and d.locale = default_code),
      (select pub.content from public.cms_page_published pub where pub.page_id = target_page and pub.locale = default_code),
      '{}'::jsonb
    );
  end if;

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

    -- The registry is written by the client: the stored original decides too.
    if not public.cms_page_text_target(
      case when is_original then current_content else original_content end,
      entry.key
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
