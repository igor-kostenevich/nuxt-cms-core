-- 014 (after the author's review of the lists): an entry taken off the site is
-- shown as a draft and Publish puts it back. Two things the editor needs:
--   * get_editable says the entry is off the site (`off_site`), so the editor
--     can show it as a draft and offer Publish even without a pending draft;
--   * Publish without a draft, for an entry off the site, brings it back with
--     the version it was taken off with (there is nothing newer to publish):
--     the same as Put back. Otherwise, without a draft, Publish is still refused.

drop function public.cms_entry_get_editable(text, uuid, text, text);

create function public.cms_entry_get_editable(entry_type text, entry_id uuid, entry_locale text, bootstrap_locale text)
returns table (
  default_locale text,
  base jsonb,
  draft jsonb,
  draft_updated_at timestamptz,
  published jsonb,
  published_at timestamptz,
  media jsonb,
  off_site boolean
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
  taken_off boolean;
begin
  select e.archived_at is not null into taken_off
    from public.cms_entries e
    where e.id = entry_id
      and e.type = entry_type;

  if taken_off is null then
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
    public.cms_media_of(jsonb_build_array(base_content, draft_content, published_content)),
    taken_off;
end;
$$;

revoke all on function public.cms_entry_get_editable(text, uuid, text, text) from public, anon;
grant execute on function public.cms_entry_get_editable(text, uuid, text, text) to authenticated;

create or replace function public.cms_entry_publish(entry_type text, entry_id uuid, entry_locale text, lock_token uuid, require_slug boolean default false)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  publication_time timestamptz;
  event record;
  lang text := public.cms_default_locale(null);
  was_off_site boolean;
begin
  perform public.cms_require_permission('pages.publish');
  publication_time := public.cms_page_promote_draft(
    public.cms_entry_held_lock(entry_type, entry_id, lock_token), entry_locale
  );

  select e.archived_at is not null into was_off_site from public.cms_entries e where e.id = entry_id;

  if publication_time is null then
    -- Nothing newer than what was taken off the site: back it goes as it was.
    if not (coalesce(was_off_site, false) and entry_locale = lang and exists (
      select 1 from public.cms_page_published p where p.page_id = entry_id and p.locale = lang
    )) then
      raise exception 'The entry has no draft to publish in locale "%"', entry_locale
        using errcode = 'P0002';
    end if;

    publication_time := now();
  end if;

  if require_slug and not exists (
    select 1 from public.cms_entry_slugs s
      where s.entry_id = cms_entry_publish.entry_id
        and s.locale in (entry_locale, coalesce(lang, entry_locale))
  ) then
    raise exception 'The entry needs an address to be published'
      using errcode = '23514';
  end if;

  if entry_locale = lang then
    update public.cms_entries e
      set archived_at = null
      where e.id = entry_id
        and e.archived_at is not null;

    if found then
      select * into event from public.cms_document_event(entry_id);
      perform public.cms_activity_log('unarchive', 'entry', entry_id::text, event.entity_label, null, null, event.details);
    end if;
  end if;

  return publication_time;
end;
$$;
