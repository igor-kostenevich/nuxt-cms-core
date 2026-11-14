import type { SiteSettings } from '../types/settings'

/** Columns of `cms_site_settings` the admin form may write. snake_case stays inside app/data. */
export interface SiteSettingsWrite {
  site_name: string
  contact_email: string | null
  contact_phone: string | null
  maintenance_mode: boolean
}

/** Maps a settings form onto the columns the repository is allowed to write. */
export function toSettingsWrite(settings: SiteSettings): SiteSettingsWrite {
  return {
    site_name: settings.siteName.trim(),
    contact_email: blankToNull(settings.contactEmail),
    contact_phone: blankToNull(settings.contactPhone),
    maintenance_mode: settings.maintenanceMode,
  }
}

function blankToNull(value: string | null): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}
