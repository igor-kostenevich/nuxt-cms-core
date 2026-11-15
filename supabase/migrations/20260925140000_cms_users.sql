-- CMS membership. auth.users answers "who is this"; this table answers
-- "does this person have access to the CMS, and with which role".
-- A row in auth.users alone does not grant /admin or /admin/edit.

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
  'CMS access for an auth user. No row means no access to /admin or /admin/edit.';

create trigger cms_users_touch_updated_at
  before update on public.cms_users
  for each row
  execute function public.cms_touch_updated_at();

alter table public.cms_users enable row level security;

-- A CMS user can read only their own membership. Listing colleagues waits
-- until user management exists.
create policy "cms_users_select_own"
  on public.cms_users
  for select
  to authenticated
  using (user_id = auth.uid());

-- No insert/update/delete policy: inviting and changing roles is a later block
-- (015.2), which adds its own grants, policies and the self-escalation guard.
-- Until then the privileges below make writes impossible even without RLS,
-- so the table is never one missing policy away from a user raising their role.
revoke all on table public.cms_users from anon, authenticated;
grant select on table public.cms_users to authenticated;

-- security definer so the function can read cms_users without recursing
-- through the policy above. An empty search_path means it cannot resolve an
-- unqualified name through a schema someone else can create objects in; every
-- name in the body is schema-qualified. Keep the matrix identical to
-- app/auth/permissions.ts (tests/permissions-sync.test.ts checks it).

create function public.cms_can(requested text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case requested
        when 'settings.update' then role in ('owner', 'admin')
        when 'users.manage' then role = 'owner'
        when 'pages.edit' then role in ('owner', 'admin', 'editor')
        when 'pages.publish' then role in ('owner', 'admin')
        when 'pages.unlock' then role in ('owner', 'admin')
        else false
      end
      from public.cms_users
      where user_id = auth.uid()
        and status = 'active'
    ),
    false
  );
$$;

-- Only meaningful for a signed-in user: anon has no cms_users row.
revoke all on function public.cms_can(text) from public, anon, authenticated;
grant execute on function public.cms_can(text) to authenticated;
