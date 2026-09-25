import type { SiteSettings } from '../../types/settings'
import { getSupabaseClient, toCmsDataError } from '../supabase'

const TABLE = 'site_settings'

/** Database row shape, kept private so snake_case never leaks out of this file. */
interface SiteSettingsRow {
  site_name: string
  contact_email: string | null
  contact_phone: string | null
  maintenance_mode: boolean
}

function toSiteSettings(row: SiteSettingsRow): SiteSettings {
  return {
    siteName: row.site_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    maintenanceMode: row.maintenance_mode,
  }
}

export function createSettingsRepository() {
  /** Reads the single settings record. Throws CmsDataError if it is missing. */
  async function get(): Promise<SiteSettings> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select('site_name, contact_email, contact_phone, maintenance_mode')
      .single<SiteSettingsRow>()

    if (error) {
      throw toCmsDataError(error, 'Failed to load site settings')
    }

    return toSiteSettings(data)
  }

  return { get }
}
