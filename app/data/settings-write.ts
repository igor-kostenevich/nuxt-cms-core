import type { SiteSettings } from '../types/settings'

/** Maps a settings form onto the columns the repository is allowed to write. */
export function toSettingsWrite(settings: SiteSettings) {
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
