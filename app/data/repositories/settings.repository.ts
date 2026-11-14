import type { H3Event } from 'h3'
import type { SiteSettings } from '../../types/settings'
import { CmsDataError } from '../errors'
import { toSettingsWrite } from '../settings-write'
import { getSupabaseClient, toCmsDataError } from '../supabase'

const TABLE = 'cms_site_settings'
const COLUMNS = 'site_name, contact_email, contact_phone, maintenance_mode'
/** The only row: `cms_site_settings_single_row` enforces `id = 1`. */
const ROW_ID = 1

/** Database row shape. snake_case stays inside the data layer. */
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
      .select(COLUMNS)
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
      // updated_at is set by a database trigger, not by the client clock.
      .update(toSettingsWrite(next))
      .eq('id', ROW_ID)
      .select(COLUMNS)
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
