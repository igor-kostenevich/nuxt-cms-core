-- CMS Core migration: global runtime settings.
--
-- These are the values a CMS admin must be able to change without a deployment.
-- Modelled as explicit columns rather than a settings JSON blob, so the schema
-- stays business-readable and portable to another backend.
--
-- Entities that are lists of their own right (languages, navigation items,
-- integrations) do not belong here and get their own tables later.

create table public.site_settings (
  id smallint primary key default 1,
  site_name text not null default '',
  contact_email text,
  contact_phone text,
  maintenance_mode boolean not null default false,
  updated_at timestamptz not null default now(),
  -- Global settings are a single logical record, enforced in the schema.
  constraint site_settings_single_row check (id = 1)
);

comment on table public.site_settings is
  'Global site settings editable from the CMS admin. Always exactly one row.';

insert into public.site_settings (id, site_name)
values (1, 'CMS Core site');

alter table public.site_settings enable row level security;

-- Public site content is world-readable.
create policy "site_settings_select_all"
  on public.site_settings
  for select
  to anon, authenticated
  using (true);

-- No insert/update/delete policy on purpose: writing settings requires CMS
-- authentication and permissions, which arrive in a later block. Until then
-- the table is read-only for every client key.
