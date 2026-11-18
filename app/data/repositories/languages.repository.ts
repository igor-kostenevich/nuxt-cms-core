import type { H3Event } from 'h3'
import type { CmsLanguage, CmsLanguageInput } from '../../types/languages'
import { getSupabaseClient, toCmsDataError } from '../supabase'

const TABLE = 'cms_languages'
const COLUMNS = 'code, name, native_name, active, is_default'

/** Database row shape. snake_case stays inside the data layer. */
interface LanguageRow {
  code: string
  name: string
  native_name: string
  active: boolean
  is_default: boolean
}

function toCmsLanguage(row: LanguageRow): CmsLanguage {
  return {
    code: row.code,
    name: row.name,
    nativeName: row.native_name,
    active: row.active,
    isDefault: row.is_default,
  }
}

async function getAuthClient(request?: H3Event) {
  const { getSupabaseAuthClient } = await import('../supabase-auth')
  return getSupabaseAuthClient(request)
}

/**
 * Languages of the site content (MASTER_PLAN C-15). The public site reads the
 * active ones; Settings → Languages reads all and changes them through
 * database functions that require `languages.manage` (owner).
 */
export function createLanguagesRepository(request?: H3Event) {
  /** Active languages in switcher order. Empty while the site has none yet. */
  async function listActive(): Promise<CmsLanguage[]> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq('active', true)
      .order('sort_order')
      .order('code')
      .returns<LanguageRow[]>()

    if (error) {
      throw toCmsDataError(error, 'Failed to load languages')
    }

    return data.map(toCmsLanguage)
  }

  /** Every language, disabled ones included (only the owner sees those). */
  async function listAll(): Promise<CmsLanguage[]> {
    const { data, error } = await (await getAuthClient(request))
      .from(TABLE)
      .select(COLUMNS)
      .order('sort_order')
      .order('code')
      .returns<LanguageRow[]>()

    if (error) {
      throw toCmsDataError(error, 'Failed to load languages')
    }

    return data.map(toCmsLanguage)
  }

  /**
   * Adds an active language at the end. The first language of a site is
   * added with `makeDefault`: the language the existing content is in.
   */
  async function add(language: CmsLanguageInput, options: { makeDefault?: boolean } = {}): Promise<void> {
    const { error } = await (await getAuthClient(request)).rpc('cms_language_add', {
      code: language.code,
      name: language.name,
      native_name: language.nativeName,
      make_default: options.makeDefault ?? false,
    })

    if (error) {
      throw toCmsDataError(error, `Failed to add language "${language.code}"`)
    }
  }

  async function update(language: CmsLanguageInput): Promise<void> {
    const { error } = await (await getAuthClient(request)).rpc('cms_language_update', {
      code: language.code,
      name: language.name,
      native_name: language.nativeName,
    })

    if (error) {
      throw toCmsDataError(error, `Failed to update language "${language.code}"`)
    }
  }

  /** Disables or re-enables a language. The default fails with `validation`. */
  async function setActive(code: string, active: boolean): Promise<void> {
    const { error } = await (await getAuthClient(request)).rpc('cms_language_set_active', { code, active })

    if (error) {
      throw toCmsDataError(error, `Failed to change language "${code}"`)
    }
  }

  /** Order of the language switchers. */
  async function reorder(codes: string[]): Promise<void> {
    const { error } = await (await getAuthClient(request)).rpc('cms_language_reorder', { codes })

    if (error) {
      throw toCmsDataError(error, 'Failed to reorder languages')
    }
  }

  /**
   * Deletes a language with everything written in it (drafts, published
   * translations, revisions, site name). Not the default one (`validation`);
   * `conflict` while a page is open in Edit Mode.
   */
  async function remove(code: string): Promise<void> {
    const { error } = await (await getAuthClient(request)).rpc('cms_language_delete', { code })

    if (error) {
      throw toCmsDataError(error, `Failed to delete language "${code}"`)
    }
  }

  return { listActive, listAll, add, update, setActive, reorder, remove }
}
