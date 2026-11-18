import type { CmsMedia } from './media'

/**
 * Global site settings a CMS admin can change without a deployment.
 *
 * This is the application-level shape. It intentionally does not mirror the
 * database row, so the table can be reshaped or moved to another backend
 * without touching consumers.
 */
export interface SiteSettings {
  siteName: string
  contactEmail: string | null
  contactPhone: string | null
  maintenanceMode: boolean
  /** Settings → Brand (009). Null when not set or its media was deleted. */
  logo: CmsMedia | null
  favicon: CmsMedia | null
}

/** What Settings → General writes. */
export type SiteSettingsForm = Omit<SiteSettings, 'logo' | 'favicon'>

/**
 * What Settings → Brand writes: only the slots that changed, a media id or
 * null to clear. A slot left out keeps its stored value, so changing the logo
 * never overwrites a favicon someone else just set.
 */
export interface SiteBrandForm {
  logoMediaId?: string | null
  faviconMediaId?: string | null
}

/**
 * Texts of the site settings in a language other than the default (C-82).
 * Contacts are shared by all languages. An empty value shows the default.
 */
export interface SiteSettingsTranslation {
  locale: string
  siteName: string
}
