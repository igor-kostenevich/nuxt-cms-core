import type { H3Event } from 'h3'
import type {
  CmsPage,
  CmsPageContent,
  CmsPageDraft,
  CmsPageLockStatus,
  CmsPageRevision,
} from '../../types/pages'
import type { Database, Json } from '../database.types'
import { CmsDataError } from '../errors'
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

// Reads go through functions that return the document and the media it
// references in one request (MASTER_PLAN C-76). Row shapes come from the
// generated Database types, so a renamed column fails typecheck.
type PublishedPageRow = Database['public']['Functions']['cms_page_get_published']['Returns'][number]
type DraftPageRow = Database['public']['Functions']['cms_page_get_draft']['Returns'][number]

function isContent(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// The tables have a check constraint for this. The guard keeps a schema drift
// from reaching templates or the editor as an array or a string.
function toContent(value: Json, what: string): CmsPageContent {
  if (!isContent(value)) {
    throw new CmsDataError('unknown', `${what} content is not an object.`)
  }

  return value as CmsPageContent
}

function toCmsPage(key: string, row: PublishedPageRow, storage: CmsStorageAdapter): CmsPage {
  return {
    key,
    locale: row.locale,
    content: toContent(row.content, 'Published page'),
    publishedAt: row.published_at,
    media: toMediaMap(row.media, storage),
  }
}

function toCmsPageDraft(key: string, row: DraftPageRow, storage: CmsStorageAdapter): CmsPageDraft {
  return {
    key,
    locale: row.locale,
    content: toContent(row.content, 'Page draft'),
    updatedAt: row.updated_at,
    media: toMediaMap(row.media, storage),
  }
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
export function createPagesRepository(request?: H3Event) {
  const storage = createSupabaseStorage(request)

  /**
   * Reads the published content of a page in one locale.
   * Returns null when the page has no published content yet: a code-defined
   * page then renders its defaults (MASTER_PLAN C-42).
   */
  async function getByKey(key: string, locale: string): Promise<CmsPage | null> {
    const { data, error } = await getSupabaseClient()
      .rpc('cms_page_get_published', { page_key: key, page_locale: locale })
      .maybeSingle()

    if (error) {
      throw toCmsDataError(error, `Failed to load page "${key}"`)
    }

    return data ? toCmsPage(key, data, storage) : null
  }

  /**
   * Reads the unpublished changes of a page. Null means there are none: the
   * editor then starts from the published content, or from the code defaults.
   */
  async function getDraft(key: string, locale: string): Promise<CmsPageDraft | null> {
    const { data, error } = await (await getAuthClient(request))
      .rpc('cms_page_get_draft', { page_key: key, page_locale: locale })
      .maybeSingle()

    if (error) {
      throw toCmsDataError(error, `Failed to load the draft of page "${key}"`)
    }

    return data ? toCmsPageDraft(key, data, storage) : null
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

  return {
    getByKey,
    getDraft,
    saveDraft,
    publish,
    restore,
    acquireLock,
    heartbeatLock,
    releaseLock,
    forceUnlock,
    listRevisions,
    getLockStatus,
    prepareUnloadRelease,
    releaseLockOnUnload,
  }
}
