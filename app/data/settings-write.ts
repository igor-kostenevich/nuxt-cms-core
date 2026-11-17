import type { SiteBrandForm, SiteSettingsForm } from '../types/settings'

/** Columns of `cms_site_settings` the admin form may write. snake_case stays inside app/data. */
export interface SiteSettingsWrite {
  site_name: string
  contact_email: string | null
  contact_phone: string | null
  maintenance_mode: boolean
}

/** Maps a settings form onto the columns the repository is allowed to write. */
export function toSettingsWrite(settings: SiteSettingsForm): SiteSettingsWrite {
  return {
    site_name: settings.siteName.trim(),
    contact_email: blankToNull(settings.contactEmail),
    contact_phone: blankToNull(settings.contactPhone),
    maintenance_mode: settings.maintenanceMode,
  }
}

/** Brand columns the form actually changes. The foreign key rejects an unknown id. */
export interface SiteBrandWrite {
  logo_media_id?: string | null
  favicon_media_id?: string | null
}

/** Maps the changed Brand slots onto columns; a slot left out is not written. */
export function toBrandWrite(brand: SiteBrandForm): SiteBrandWrite {
  const write: SiteBrandWrite = {}

  if (brand.logoMediaId !== undefined) {
    write.logo_media_id = brand.logoMediaId
  }

  if (brand.faviconMediaId !== undefined) {
    write.favicon_media_id = brand.faviconMediaId
  }

  return write
}

function blankToNull(value: string | null): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}
