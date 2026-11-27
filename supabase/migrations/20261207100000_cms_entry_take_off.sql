-- 014 (after the author's review): taking an entry off the site from the editor
-- that has it open. `cms_entry_archive` refuses an entry open in the editor (a
-- live lock) so that nobody is archived under another editor's hands; here the
-- caller holds that very lock, so the same step is allowed with it. The result
-- and the Activity event are the ones of archive.

create function public.cms_entry_take_off(entry_type text, entry_id uuid, lock_token uuid)
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

  update public.cms_entries e
    set archived_at = now()
    where e.id = entry_id
      and e.archived_at is null;

  if found then
    select * into event from public.cms_document_event(entry_id);
    perform public.cms_activity_log('archive', 'entry', entry_id::text, event.entity_label, null, null, event.details);
  end if;
end;
$$;

revoke all on function public.cms_entry_take_off(text, uuid, uuid) from public, anon;
grant execute on function public.cms_entry_take_off(text, uuid, uuid) to authenticated;
