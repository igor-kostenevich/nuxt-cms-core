-- CMS users with settings.update may change the single settings row.
-- The row already exists. There is still no insert or delete policy.

create policy "site_settings_update_cms"
  on public.site_settings
  for update
  to authenticated
  using (public.cms_can('settings.update'))
  with check (public.cms_can('settings.update'));

grant update on table public.site_settings to authenticated;
