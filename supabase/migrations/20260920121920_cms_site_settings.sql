-- CMS Core migration: global runtime settings.
--
-- These are the values a CMS admin must be able to change without a deployment.
-- Modelled as explicit columns rather than a settings JSON blob, so the schema
-- stays business-readable and portable to another backend.
--
-- Entities that are lists of their own right (languages, navigation items,
-- integrations) do not belong here and get their own tables later.
--
-- Core tables share the public schema with Client Project tables, so every
-- Core table, policy and constraint carries the cms_ prefix (MASTER_PLAN C-38).

-- updated_at follows the database clock, never the client's. Shared by every
-- Core table with an updated_at column.
create function public.cms_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.cms_touch_updated_at() is
  'Trigger function: sets updated_at to now() on every update.';

revoke all on function public.cms_touch_updated_at() from public, anon, authenticated;

create table public.cms_site_settings (
  id smallint primary key default 1,
  site_name text not null default '',
  contact_email text,
  contact_phone text,
  maintenance_mode boolean not null default false,
  updated_at timestamptz not null default now(),
  -- Global settings are a single logical record, enforced in the schema.
  constraint cms_site_settings_single_row check (id = 1)
);

comment on table public.cms_site_settings is
  'Global site settings editable from the CMS admin. Always exactly one row.';

create trigger cms_site_settings_touch_updated_at
  before update on public.cms_site_settings
  for each row
  execute function public.cms_touch_updated_at();

insert into public.cms_site_settings (id, site_name)
values (1, 'CMS Core site');

alter table public.cms_site_settings enable row level security;

-- Public site content is world-readable.
create policy "cms_site_settings_select_all"
  on public.cms_site_settings
  for select
  to anon, authenticated
  using (true);

-- Newer Supabase projects do not grant Data API access to new tables, and an
-- older project may grant everything by default. Grants are therefore explicit:
-- read for everyone, and no insert or delete for any client role. The single
-- row is created above; writing it arrives with CMS permissions (004b).
revoke all on table public.cms_site_settings from anon, authenticated;
grant select on table public.cms_site_settings to anon, authenticated;
