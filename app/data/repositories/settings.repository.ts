import type { H3Event } from 'h3'
import type { SiteBrandForm, SiteSettings, SiteSettingsForm } from '../../types/settings'
import { CmsDataError } from '../errors'
import { MEDIA_COLUMNS, toCmsMedia, type MediaRow } from '../media-row'
import { toBrandWrite, toSettingsWrite, type SiteBrandWrite, type SiteSettingsWrite } from '../settings-write'
import { createSupabaseStorage } from '../storage/supabase-storage'
import { getSupabaseClient, toCmsDataError } from '../supabase'

const TABLE = 'cms_site_settings'
// Brand media come embedded through the foreign keys: one request. RLS on
// cms_media hides a deleted item, so it reads as null.
const COLUMNS = 'site_name, contact_email, contact_phone, maintenance_mode, '
  + `logo:cms_media!cms_site_settings_logo_media_fkey(${MEDIA_COLUMNS}), `
  + `favicon:cms_media!cms_site_settings_favicon_media_fkey(${MEDIA_COLUMNS})`
/** The only row: `cms_site_settings_single_row` enforces `id = 1`. */
const ROW_ID = 1

/** Database row shape. snake_case stays inside the data layer. */
interface SiteSettingsRow {
  site_name: string
  contact_email: string | null
  contact_phone: string | null
  maintenance_mode: boolean
  logo?: MediaRow | null
  favicon?: MediaRow | null
}

export function createSettingsRepository(request?: H3Event) {
  const storage = createSupabaseStorage(request)

  function toSiteSettings(row: SiteSettingsRow): SiteSettings {
    return {
      siteName: row.site_name,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      maintenanceMode: row.maintenance_mode,
      logo: row.logo ? toCmsMedia(row.logo, storage) : null,
      favicon: row.favicon ? toCmsMedia(row.favicon, storage) : null,
    }
  }

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
  async function write(values: SiteSettingsWrite | SiteBrandWrite): Promise<SiteSettings> {
    const { getSupabaseAuthClient } = await import('../supabase-auth')
    const { data, error } = await getSupabaseAuthClient(request)
      .from(TABLE)
      // updated_at is set by a database trigger, not by the client clock.
      .update(values)
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

  /** Writes Settings → General. The auth adapter is imported only when this runs. */
  function update(next: SiteSettingsForm): Promise<SiteSettings> {
    return write(toSettingsWrite(next))
  }

  /** Writes the changed Settings → Brand slots. Nothing changed: reads instead. */
  function updateBrand(next: SiteBrandForm): Promise<SiteSettings> {
    const values = toBrandWrite(next)
    return Object.keys(values).length > 0 ? write(values) : get()
  }

  return { get, update, updateBrand }
}
