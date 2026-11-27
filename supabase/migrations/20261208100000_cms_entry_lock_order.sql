-- 014 (review recheck X-1): delete, take-off and unarchive cannot pass each other.
--   * `cms_entry_delete` and `cms_entry_take_off` lock the entry row first, as
--     every entry RPC does (lock order: entry row, lock row, draft row): the
--     check «not on the site» of delete then holds until the row is gone, and
--     take-off no longer locks in the reverse order of archive / unarchive.
--   * `cms_entry_unarchive` is refused while the entry is open in the editor
--     (a live lock), like `cms_entry_archive`: an entry that is being deleted or
--     edited is not put back on the site under the editor's hands.

create or replace function public.cms_entry_delete(entry_type text, entry_id uuid, lock_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event record;
begin
  perform public.cms_require_permission('pages.publish');
  perform public.cms_entry_lock_row(entry_type, entry_id);
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

create or replace function public.cms_entry_take_off(entry_type text, entry_id uuid, lock_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event record;
begin
  perform public.cms_require_permission('pages.publish');
  perform public.cms_entry_lock_row(entry_type, entry_id);
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

create or replace function public.cms_entry_unarchive(entry_type text, entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event record;
begin
  perform public.cms_require_permission('pages.publish');
  perform public.cms_entry_lock_row(entry_type, entry_id);

  if public.cms_page_open_in_editor(entry_id) then
    raise exception 'The entry is open in the editor'
      using errcode = 'CMSLK';
  end if;

  update public.cms_entries e
    set archived_at = null
    where e.id = entry_id
      and e.archived_at is not null;

  if found then
    select * into event from public.cms_document_event(entry_id);
    perform public.cms_activity_log('unarchive', 'entry', entry_id::text, event.entity_label, null, null, event.details);
  end if;
end;
$$;
