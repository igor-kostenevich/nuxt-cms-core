import type { H3Event } from 'h3'
import type { SiteSettings } from '../../types/settings'
import { CmsDataError } from '../errors'
import { toSettingsWrite } from '../settings-write'
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

export function createSettingsRepository(request?: H3Event) {
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

  /**
   * Updates the single settings row through the signed-in client.
   * The auth adapter is imported only when this runs, so a public read of
   * settings does not pull the session client into its bundle.
   */
  async function update(next: SiteSettings): Promise<SiteSettings> {
    const { getSupabaseAuthClient } = await import('../supabase-auth')
    const { data, error } = await getSupabaseAuthClient(request)
      .from(TABLE)
      .update({
        ...toSettingsWrite(next),
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
      .select('site_name, contact_email, contact_phone, maintenance_mode')
      .single<SiteSettingsRow>()

    if (error) {
      // The row exists. Zero rows here means the policy rejected the write.
      if (error.code === 'PGRST116') {
        throw new CmsDataError('permission_denied', 'Failed to update site settings.')
      }

      throw toCmsDataError(error, 'Failed to update site settings')
    }

    return toSiteSettings(data)
  }

  return { get, update }
}
