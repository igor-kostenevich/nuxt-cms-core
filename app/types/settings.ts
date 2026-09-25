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
}
