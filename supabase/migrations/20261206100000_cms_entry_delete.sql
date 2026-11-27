-- 014 (after the author's review): deleting an entry for good. Spam and test
-- entries cannot be taken off the site and forgotten: they keep an address and
-- hold media. Only an entry that is not on the site can be deleted (a draft, or
-- one taken off it): what is live is taken off first, which is the second
-- step against a stray click. It is done from the editor that holds the lock
-- of the entry, by someone who may publish (nothing new in the permission
-- matrix). Drafts, publications, revisions, addresses and the lock go with the
-- entry (the document cascades); the media it used can be deleted again. The
-- event in Activity keeps its title.

create function public.cms_entry_delete(entry_type text, entry_id uuid, lock_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event record;
begin
  perform public.cms_require_permission('pages.publish');
  perform public.cms_entry_held_lock(entry_type, entry_id, lock_token);

  if exists (select 1 from public.cms_entries e where e.id = entry_id and e.archived_at is null)
    and exists (
      select 1 from public.cms_page_published p
        where p.page_id = entry_id
          and p.locale = public.cms_default_locale(null)
    ) then
    raise exception 'An entry on the site is taken off it before it is deleted'
      using errcode = 'CMSEL';
  end if;

  select * into event from public.cms_document_event(entry_id);

  delete from public.cms_entries e
    where e.id = entry_id
      and e.type = entry_type;

  perform public.cms_activity_log('delete', 'entry', entry_id::text, event.entity_label, null, null, event.details);
end;
$$;

revoke all on function public.cms_entry_delete(text, uuid, uuid) from public, anon;
grant execute on function public.cms_entry_delete(text, uuid, uuid) to authenticated;
