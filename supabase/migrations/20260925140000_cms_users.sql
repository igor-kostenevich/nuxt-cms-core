-- CMS membership. auth.users answers "who is this"; this table answers
-- "does this person have access to the CMS, and with which role".
-- A row in auth.users alone does not grant /admin or /edit.

create table public.cms_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cms_users_role_check check (role in ('owner', 'admin', 'editor')),
  constraint cms_users_status_check check (status in ('active', 'disabled'))
);

comment on table public.cms_users is
  'CMS access for an auth user. No row means no access to /admin or /edit.';

alter table public.cms_users enable row level security;

-- A CMS user can read only their own membership. Listing colleagues waits
-- until user management exists.
create policy "cms_users_select_own"
  on public.cms_users
  for select
  to authenticated
  using (user_id = auth.uid());

-- No insert/update/delete policy: inviting and changing roles is a later block.

-- security definer so the functions can read cms_users without recursing
-- through the policy above. search_path is pinned so the definer cannot be
-- pointed at another schema. Keep the matrix identical to app/auth/permissions.ts.

create function public.is_active_cms_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cms_users
    where user_id = auth.uid()
      and status = 'active'
  );
$$;

create function public.cms_can(requested text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select case requested
        when 'settings.update' then role in ('owner', 'admin')
        when 'users.manage' then role = 'owner'
        when 'pages.edit' then role in ('owner', 'admin', 'editor')
        when 'pages.publish' then role in ('owner', 'admin')
        else false
      end
      from public.cms_users
      where user_id = auth.uid()
        and status = 'active'
    ),
    false
  );
$$;

revoke all on function public.is_active_cms_user() from public;
revoke all on function public.cms_can(text) from public;
grant execute on function public.is_active_cms_user() to authenticated;
grant execute on function public.cms_can(text) to authenticated;

grant select on table public.cms_users to authenticated;

-- Newer Supabase projects do not grant Data API access to new tables.
-- site_settings is public content; its select policy is not enough without this.
grant select on table public.site_settings to anon, authenticated;
