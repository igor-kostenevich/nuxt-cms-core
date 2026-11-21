import type { H3Event } from 'h3'
import type {
  CmsPage,
  CmsPageContent,
  CmsPageEditable,
  CmsPageLocaleState,
  CmsPageLockStatus,
  CmsPageRevision,
} from '../../types/pages'
import { defaultCmsConfig } from '../../../src/config'
import { applyTranslation } from '../../primitives/translation'
import type { Database, Json } from '../database.types'
import { CmsDataError } from '../errors'
import { UUID_PATTERN } from '../ids'
import { toMediaMap } from '../media-row'
import type { CmsStorageAdapter } from '../storage/storage-adapter'
import { createSupabaseStorage } from '../storage/supabase-storage'
import { getSupabaseClient, readSupabasePublicConfig, toCmsDataError } from '../supabase'

const REVISIONS_TABLE = 'cms_page_revisions'
/** The History panel lists this many latest publications. */
const REVISIONS_LIMIT = 50

/**
 * The session client is imported only when an editing method runs, so the
 * public read of a page does not pull it into the public bundle.
 */
async function getAuthClient(request?: H3Event) {
  const { getSupabaseAuthClient } = await import('../supabase-auth')
  return getSupabaseAuthClient(request)
}

// Reads go through functions that return the documents and the media they
// reference in one request (MASTER_PLAN C-76). Row shapes come from the
// generated Database types, so a renamed column fails typecheck. Function
// results are typed non-null there, so nullable columns are widened here.
type Nullable<T> = { [K in keyof T]: T[K] | null }
type LocalizedPageRow = Nullable<Database['public']['Functions']['cms_page_get_localized']['Returns'][number]>
type EditablePageRow = Nullable<Database['public']['Functions']['cms_page_get_editable']['Returns'][number]>

function isContent(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// The tables have a check constraint for this. The guard keeps a schema drift
// from reaching templates or the editor as an array or a string.
function toContent(value: Json | null, what: string): CmsPageContent | null {
  if (value === null) {
    return null
  }

  if (!isContent(value)) {
    throw new CmsDataError('unknown', `${what} content is not an object.`)
  }

  return value as CmsPageContent
}

/**
 * The locale as the site shows it: the base with the translation applied
 * (C-78). Null while neither is published: the page renders its code defaults.
 */
function toCmsPage(
  key: string,
  requested: string | null,
  row: LocalizedPageRow,
  storage: CmsStorageAdapter,
): CmsPage | null {
  const base = toContent(row.base, 'Published page')
  const translation = toContent(row.translation, 'Published translation')
  const publishedAt = row.translation_published_at ?? row.base_published_at
  const defaultLocale = row.default_locale ?? requested ?? ''
  const locale = requested ?? defaultLocale

  if (!publishedAt || (!base && !translation)) {
    return null
  }

  return {
    key,
    locale,
    content: translation ? applyTranslation(base, translation) : base!,
    publishedAt,
    media: toMediaMap(row.media ?? [], storage),
    defaultLocale,
    translated: locale === defaultLocale || translation !== null,
    locales: row.locales ?? [],
  }
}

function toCmsPageEditable(
  key: string,
  requested: string | null,
  row: EditablePageRow,
  storage: CmsStorageAdapter,
): CmsPageEditable {
  const defaultLocale = row.default_locale ?? requested ?? ''

  return {
    key,
    locale: requested ?? defaultLocale,
    defaultLocale,
    base: toContent(row.base, 'Base'),
    draft: toContent(row.draft, 'Page draft'),
    draftUpdatedAt: row.draft_updated_at,
    published: toContent(row.published, 'Published page'),
    publishedAt: row.published_at,
    media: toMediaMap(row.media ?? [], storage),
  }
}

/** A translatable field as Edit Mode registers it (C-84). */
export interface CmsPageFieldRegistration {
  address: string
  kind: 'text' | 'richText' | 'link' | 'button' | 'image'
  label?: string
  defaultText?: string
  /** Block of the page the field is in: its heading, or a name set with `data-cms-section`. */
  section?: string
  /** Order on the page. */
  position?: number
  /** Element of the field, e.g. `h2`. */
  tag?: string
  /** Number of the collection item the field is in (1-based). */
  item?: number
}

export interface PagesRepositoryOptions {
  /**
   * Default locale while the site has no languages yet: `defaultLocale` of
   * cms.config.ts. Once languages exist, the database decides.
   */
  bootstrapLocale?: string
}

/**
 * Pages: public read through the anonymous client; Draft, Publish, Restore and
 * the Content Lock through the signed-in client. Every write is a database
 * function that checks the permission and the lock in one transaction
 * (MASTER_PLAN C-07), so a failed call changes nothing.
 *
 * `request` is the server event captured while Nuxt context still exists.
 * Only the editing methods need it.
 */
export function createPagesRepository(request?: H3Event, options: PagesRepositoryOptions = {}) {
  const storage = createSupabaseStorage(request)
  const bootstrapLocale = options.bootstrapLocale ?? defaultCmsConfig.defaultLocale

  /**
   * Reads the published content of a page in one locale: the default locale
   * with the translation of `locale` applied (C-78). Returns null when the
   * page has no published content yet: a code-defined page then renders its
   * defaults (MASTER_PLAN C-42). A null locale reads the default locale.
   */
  async function getByKey(key: string, locale: string | null): Promise<CmsPage | null> {
    const { data, error } = await getSupabaseClient()
      // PostgREST passes null through; the generated Args type has no nulls.
      .rpc('cms_page_get_localized', { page_key: key, page_locale: locale as string, bootstrap_locale: bootstrapLocale })
      .maybeSingle()

    if (error) {
      throw toCmsDataError(error, `Failed to load page "${key}"`)
    }

    return data ? toCmsPage(key, locale, data, storage) : null
  }

  /**
   * What Edit Mode loads for a locale: its Draft and Published version, and
   * for a translation the content of the default locale it applies to. A null
   * locale is the default one.
   */
  async function getEditable(key: string, locale: string | null): Promise<CmsPageEditable> {
    const { data, error } = await (await getAuthClient(request))
      .rpc('cms_page_get_editable', { page_key: key, page_locale: locale as string, bootstrap_locale: bootstrapLocale })
      .maybeSingle()

    if (error) {
      throw toCmsDataError(error, `Failed to load page "${key}" for editing`)
    }

    if (!data) {
      throw new CmsDataError('unknown', `Page "${key}" returned no editable state.`)
    }

    return toCmsPageEditable(key, locale, data, storage)
  }

  /** Draft / published state of a page per locale, for the language switcher. */
  async function getLocaleStates(key: string): Promise<CmsPageLocaleState[]> {
    const { data, error } = await (await getAuthClient(request)).rpc('cms_page_locale_states', {
      page_key: key,
    })

    if (error) {
      throw toCmsDataError(error, `Failed to load the languages of page "${key}"`)
    }

    return (data as Nullable<(typeof data)[number]>[]).map(row => ({
      locale: row.locale ?? '',
      hasDraft: row.has_draft ?? false,
      publishedAt: row.published_at,
    }))
  }

  /**
   * Saves the shared draft. Returns the save time, or null when the content
   * equals the published version and no draft remains.
   */
  async function saveDraft(
    key: string,
    locale: string,
    content: CmsPageContent,
    lockToken: string,
  ): Promise<string | null> {
    const { data, error } = await (await getAuthClient(request)).rpc('cms_page_save_draft', {
      page_key: key,
      page_locale: locale,
      content: content as Json,
      lock_token: lockToken,
    })

    if (error) {
      throw toCmsDataError(error, `Failed to save the draft of page "${key}"`)
    }

    return data ?? null
  }

  /**
   * Publishes the saved draft: revision, published content and removal of the
   * draft in one transaction. Only saved content is published. Returns the
   * publication time; `not_found` when there is no draft.
   */
  async function publish(key: string, locale: string, lockToken: string): Promise<string> {
    const { data, error } = await (await getAuthClient(request)).rpc('cms_page_publish', {
      page_key: key,
      page_locale: locale,
      lock_token: lockToken,
    })

    if (error) {
      throw toCmsDataError(error, `Failed to publish page "${key}"`)
    }

    return data
  }

  /**
   * Copies a revision into the draft. An existing draft is replaced only with
   * `replaceDraft`, otherwise the call fails with `conflict`. Returns like
   * saveDraft: null when the restored content equals the published version.
   */
  async function restore(
    key: string,
    locale: string,
    revisionId: string,
    lockToken: string,
    options: { replaceDraft?: boolean } = {},
  ): Promise<string | null> {
    const { data, error } = await (await getAuthClient(request)).rpc('cms_page_restore', {
      page_key: key,
      page_locale: locale,
      revision_id: revisionId,
      lock_token: lockToken,
      replace_draft: options.replaceDraft ?? false,
    })

    if (error) {
      throw toCmsDataError(error, `Failed to restore a revision of page "${key}"`)
    }

    return data ?? null
  }

  /**
   * Takes the Content Lock and returns this session's token. Fails with
   * `locked` while another user holds a fresh lock.
   */
  async function acquireLock(key: string): Promise<string> {
    const { data, error } = await (await getAuthClient(request)).rpc('cms_page_lock_acquire', {
      page_key: key,
    })

    if (error) {
      throw toCmsDataError(error, `Failed to lock page "${key}"`)
    }

    return data
  }

  /** Keeps the lock alive. Fails with `lock_lost` once the session no longer holds it. */
  async function heartbeatLock(key: string, lockToken: string): Promise<void> {
    const { error } = await (await getAuthClient(request)).rpc('cms_page_lock_heartbeat', {
      page_key: key,
      lock_token: lockToken,
    })

    if (error) {
      throw toCmsDataError(error, `Failed to keep the lock of page "${key}"`)
    }
  }

  /** Releases the lock. Releasing a lock the session no longer holds is not an error. */
  async function releaseLock(key: string, lockToken: string): Promise<void> {
    const { error } = await (await getAuthClient(request)).rpc('cms_page_lock_release', {
      page_key: key,
      lock_token: lockToken,
    })

    if (error) {
      throw toCmsDataError(error, `Failed to release the lock of page "${key}"`)
    }
  }

  /**
   * Publications of a page in one locale, newest first. The content is not
   * loaded: Restore copies it on the server.
   */
  async function listRevisions(key: string, locale: string): Promise<CmsPageRevision[]> {
    const { data, error } = await (await getAuthClient(request))
      .from(REVISIONS_TABLE)
      .select('id, locale, created_at, page:cms_pages!inner(key)')
      .eq('page.key', key)
      .eq('locale', locale)
      .order('created_at', { ascending: false })
      .limit(REVISIONS_LIMIT)

    if (error) {
      throw toCmsDataError(error, `Failed to load the revisions of page "${key}"`)
    }

    return data.map(row => ({ id: row.id, locale: row.locale, createdAt: row.created_at }))
  }

  /**
   * One publication of a page in a locale, for a link from Activity to a
   * version older than the History list. The page and the locale are part of
   * the query, so a revision of another page or language is never returned;
   * an id that is not a uuid makes no request. Null: deleted or not this page's.
   */
  async function getRevision(id: string, key: string, locale: string): Promise<CmsPageRevision | null> {
    if (!UUID_PATTERN.test(id)) {
      return null
    }

    const { data, error } = await (await getAuthClient(request))
      .from(REVISIONS_TABLE)
      .select('id, locale, created_at, page:cms_pages!inner(key)')
      .eq('id', id)
      .eq('page.key', key)
      .eq('locale', locale)
      .maybeSingle()

    if (error) {
      throw toCmsDataError(error, `Failed to load a revision of page "${key}"`)
    }

    return data ? { id: data.id, locale: data.locale, createdAt: data.created_at } : null
  }

  /**
   * Where pages open in Edit Mode, by page id: the path they were last opened
   * at (`edit_path`), null while never opened. For links from other screens.
   */
  async function editPaths(ids: readonly string[]): Promise<Map<string, string | null>> {
    if (ids.length === 0) {
      return new Map()
    }

    const { data, error } = await (await getAuthClient(request))
      .from('cms_pages')
      .select('id, edit_path')
      .in('id', [...ids])

    if (error) {
      throw toCmsDataError(error, 'Failed to load page paths')
    }

    return new Map((data ?? []).map(row => [row.id, row.edit_path]))
  }

  /** Who holds the lock of a page, without the token. Null when nobody does. */
  async function getLockStatus(key: string): Promise<CmsPageLockStatus | null> {
    const { data, error } = await (await getAuthClient(request)).rpc('cms_page_lock_status', {
      page_key: key,
    })

    if (error) {
      throw toCmsDataError(error, `Failed to read the lock of page "${key}"`)
    }

    const row = data[0]

    return row
      ? {
          holderEmail: row.holder_email ?? null,
          acquiredAt: row.acquired_at,
          heartbeatAt: row.heartbeat_at,
          mine: row.is_mine,
          stale: row.is_stale,
        }
      : null
  }

  /** Removes another session's lock. Requires `pages.unlock`. */
  async function forceUnlock(key: string): Promise<void> {
    const { error } = await (await getAuthClient(request)).rpc('cms_page_lock_force_unlock', {
      page_key: key,
    })

    if (error) {
      throw toCmsDataError(error, `Failed to unlock page "${key}"`)
    }
  }

  // Release on tab close (MASTER_PLAN R-18, C-69). `navigator.sendBeacon`
  // cannot send an Authorization header, and the Supabase client reads the
  // session asynchronously, which is too late on `pagehide`. So the URL, key
  // and access token are cached ahead of time, and the release is a plain
  // `fetch` with `keepalive`, started synchronously. Best effort: when it does
  // not arrive, the lock expires after its TTL.
  let unload: { url: string, apiKey: string, accessToken: string | null } | null = null

  /** Caches what the release on tab close needs. First call during setup: it reads the runtime config. */
  async function prepareUnloadRelease(): Promise<void> {
    if (!unload) {
      const { url, key: apiKey } = readSupabasePublicConfig()
      unload = { url, apiKey, accessToken: null }
    }

    const { data } = await (await getAuthClient(request)).auth.getSession()
    unload.accessToken = data.session?.access_token ?? null
  }

  /** Starts the lock release synchronously, so it survives the tab closing. */
  function releaseLockOnUnload(key: string, lockToken: string): void {
    if (!unload?.accessToken) {
      return
    }

    void fetch(`${unload.url}/rest/v1/rpc/cms_page_lock_release`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'apikey': unload.apiKey,
        'Authorization': `Bearer ${unload.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_key: key, lock_token: lockToken }),
    }).catch(() => undefined)
  }

  /**
   * Records the translatable fields Edit Mode saw on a page, with the texts
   * from code (C-84). Fields under hidden optional blocks are kept.
   */
  async function registerFields(
    key: string,
    editPath: string,
    fields: CmsPageFieldRegistration[],
    hiddenPrefixes: string[],
  ): Promise<void> {
    const { error } = await (await getAuthClient(request)).rpc('cms_page_register_fields', {
      page_key: key,
      edit_path: editPath,
      fields: fields as unknown as Json,
      hidden_prefixes: hiddenPrefixes,
    })

    if (error) {
      throw toCmsDataError(error, `Failed to register the fields of page "${key}"`)
    }
  }

  /**
   * Changes texts of a page outside Edit Mode (the Texts screen, C-89), in the
   * draft of `locale`: the original or a translation. Keys are text leaves of
   * registered fields (`hero.title`, `hero.cta.label`, `hero.image.alt`); a
   * null value returns the field to its text from code (original) or removes
   * the translation. `locked` while the page is open in Edit Mode,
   * `validation` for an address that is not a text of the page. Returns the
   * draft time, or null when the draft equals Published.
   */
  async function setTexts(key: string, locale: string, entries: Record<string, string | null>): Promise<string | null> {
    const { data, error } = await (await getAuthClient(request)).rpc('cms_page_set_texts', {
      page_key: key,
      page_locale: locale,
      entries: entries as Json,
    })

    if (error) {
      throw toCmsDataError(error, `Failed to change the texts of page "${key}"`)
    }

    return data ?? null
  }

  /**
   * Publishes the drafts of a language on the chosen pages. `draftUpdatedAt`
   * is the draft time exactly as it was read (a string: a Date would drop the
   * microseconds and never match). A page whose draft changed since, or that
   * is open in Edit Mode, is skipped.
   */
  async function publishLanguage(
    locale: string,
    pages: { key: string, draftUpdatedAt: string }[],
  ): Promise<{ published: number, skipped: string[] }> {
    const { data, error } = await (await getAuthClient(request)).rpc('cms_language_publish', {
      page_locale: locale,
      pages: pages as unknown as Json,
    })

    if (error) {
      throw toCmsDataError(error, `Failed to publish language "${locale}"`)
    }

    const row = data?.[0]
    return { published: row?.published ?? 0, skipped: row?.skipped_keys ?? [] }
  }

  return {
    registerFields,
    setTexts,
    publishLanguage,
    getByKey,
    getEditable,
    getLocaleStates,
    saveDraft,
    publish,
    restore,
    acquireLock,
    heartbeatLock,
    releaseLock,
    forceUnlock,
    listRevisions,
    getRevision,
    editPaths,
    getLockStatus,
    prepareUnloadRelease,
    releaseLockOnUnload,
  }
}
