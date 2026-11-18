import type { H3Event } from 'h3'
import { getSupabaseClient, toCmsDataError } from '../supabase'

const TABLE = 'cms_site_texts'

/** A stored site text: the value of one key in one language (C-85). */
export interface SiteTextRow {
  key: string
  locale: string
  value: string
}

async function getAuthClient(request?: H3Event) {
  const { getSupabaseAuthClient } = await import('../supabase-auth')
  return getSupabaseAuthClient(request)
}

/**
 * Site texts: the public site reads the stored values of a language in one
 * request; the Texts screen lists and changes them. Writes are live at once
 * and need `pages.publish` (RLS).
 */
export function createSiteTextsRepository(request?: H3Event, options: { bootstrapLocale?: string } = {}) {
  const bootstrapLocale = options.bootstrapLocale ?? 'en'

  /**
   * Stored values of `locale` (null: the default), with the default language
   * behind them, keyed by text key. Texts from code are not included.
   */
  async function getForLocale(locale: string | null): Promise<Record<string, string>> {
    const { data, error } = await getSupabaseClient().rpc('cms_site_texts_for', {
      // PostgREST passes null through; the generated Args type has no nulls.
      page_locale: locale as string,
      bootstrap_locale: bootstrapLocale,
    })

    if (error) {
      throw toCmsDataError(error, 'Failed to load site texts')
    }

    const values: Record<string, string> = {}

    if (data && typeof data === 'object' && !Array.isArray(data)) {
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'string') {
          values[key] = value
        }
      }
    }

    return values
  }

  /** Every stored value, hidden languages included (CMS users). */
  async function listAll(): Promise<SiteTextRow[]> {
    const { data, error } = await (await getAuthClient(request))
      .from(TABLE)
      .select('key, locale, value')
      .returns<SiteTextRow[]>()

    if (error) {
      throw toCmsDataError(error, 'Failed to load site texts')
    }

    return data
  }

  /** Sets the value of a key in a language; an empty value removes it (fallback shows). */
  async function set(key: string, locale: string, value: string): Promise<void> {
    const client = await getAuthClient(request)
    const trimmed = value.trim()
    const { error } = trimmed
      ? await client.from(TABLE).upsert({ key, locale, value: trimmed }, { onConflict: 'key,locale' })
      : await client.from(TABLE).delete().eq('key', key).eq('locale', locale)

    if (error) {
      throw toCmsDataError(error, `Failed to save site text "${key}"`)
    }
  }

  return { getForLocale, listAll, set }
}
