-- Who holds the Content Lock of a page, for the Edit Mode UI (008).
--
-- cms_page_locks has no client access, because a readable row would hand the
-- token to another editor (C-54). This function returns the holder and the
-- times, never the token. No row means nobody holds the lock.

create function public.cms_page_lock_status(page_key text)
returns table (
  holder_email text,
  acquired_at timestamptz,
  heartbeat_at timestamptz,
  is_mine boolean,
  is_stale boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.cms_require_permission('pages.edit');

  return query
    select
      u.email::text,
      l.acquired_at,
      l.heartbeat_at,
      l.user_id = auth.uid(),
      l.heartbeat_at <= now() - public.cms_page_lock_ttl()
    from public.cms_page_locks l
    join public.cms_pages p on p.id = l.page_id
    left join auth.users u on u.id = l.user_id
    where p.key = page_key;
end;
$$;

revoke all on function public.cms_page_lock_status(text) from public, anon, authenticated;
grant execute on function public.cms_page_lock_status(text) to authenticated;
