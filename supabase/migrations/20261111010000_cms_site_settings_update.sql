-- CMS users with settings.update may change the single settings row.
-- The row already exists. There is still no insert or delete policy.

create policy "cms_site_settings_update_cms"
  on public.cms_site_settings
  for update
  to authenticated
  using (public.cms_can('settings.update'))
  with check (public.cms_can('settings.update'));

-- Clients may write only the columns the settings form edits. id and
-- updated_at are not writable; the updated_at trigger is not checked against
-- these grants.
grant update (site_name, contact_email, contact_phone, maintenance_mode)
  on table public.cms_site_settings
  to authenticated;
