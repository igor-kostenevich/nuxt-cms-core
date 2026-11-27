-- 014 (after the author's review of the lists): an entry taken off the site is
-- shown as a draft, and Publish publishes its draft. So publishing the original
-- of an entry taken off the site (archived) brings it back to the site, in the
-- same transaction: Publish is the one action that puts something on the site.
-- Publishing a translation does not: it would bring back the last publication
-- of the original too, which nobody asked for.

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
