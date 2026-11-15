import type { H3Event } from 'h3'
import type { CmsPage, CmsPageContent, CmsPageDraft } from '../../types/pages'
import type { Json } from '../database.types'
import { CmsDataError } from '../errors'
import { getSupabaseClient, toCmsDataError } from '../supabase'

const PUBLISHED_TABLE = 'cms_page_published'
const DRAFT_TABLE = 'cms_page_draft'
// The inner join filters by page key in the same request: one round trip per page.
const PUBLISHED_COLUMNS = 'locale, content, published_at, page:cms_pages!inner(key)'
const DRAFT_COLUMNS = 'locale, content, updated_at, page:cms_pages!inner(key)'

function selectPublished() {
  return getSupabaseClient().from(PUBLISHED_TABLE).select(PUBLISHED_COLUMNS)
}

/**
 * Row shape inferred from the generated Database types, so a renamed column
 * or a typo in the columns fails typecheck. snake_case stays inside the data layer.
 */
type PublishedPageRow = NonNullable<Awaited<ReturnType<typeof selectPublished>>['data']>[number]

/**
 * The session client is imported only when an editing method runs, so the
 * public read of a page does not pull it into the public bundle.
 */
async function getAuthClient(request?: H3Event) {
  const { getSupabaseAuthClient } = await import('../supabase-auth')
  return getSupabaseAuthClient(request)
}

function selectDraft(client: Awaited<ReturnType<typeof getAuthClient>>) {
  return client.from(DRAFT_TABLE).select(DRAFT_COLUMNS)
}

type DraftPageRow = NonNullable<Awaited<ReturnType<typeof selectDraft>>['data']>[number]

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

function toCmsPage(row: PublishedPageRow): CmsPage {
  return {
    key: row.page.key,
    locale: row.locale,
    content: toContent(row.content, 'Published page'),
    publishedAt: row.published_at,
  }
}

function toCmsPageDraft(row: DraftPageRow): CmsPageDraft {
  return {
    key: row.page.key,
    locale: row.locale,
    content: toContent(row.content, 'Page draft'),
    updatedAt: row.updated_at,
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
  /**
   * Reads the published content of a page in one locale.
   * Returns null when the page has no published content yet: a code-defined
   * page then renders its defaults (MASTER_PLAN C-42).
   */
  async function getByKey(key: string, locale: string): Promise<CmsPage | null> {
    const { data, error } = await selectPublished()
      .eq('page.key', key)
      .eq('locale', locale)
      .maybeSingle()

    if (error) {
      throw toCmsDataError(error, `Failed to load page "${key}"`)
    }

    return data ? toCmsPage(data) : null
  }

  /**
   * Reads the unpublished changes of a page. Null means there are none: the
   * editor then starts from the published content, or from the code defaults.
   */
  async function getDraft(key: string, locale: string): Promise<CmsPageDraft | null> {
    const { data, error } = await selectDraft(await getAuthClient(request))
      .eq('page.key', key)
      .eq('locale', locale)
      .maybeSingle()

    if (error) {
      throw toCmsDataError(error, `Failed to load the draft of page "${key}"`)
    }

    return data ? toCmsPageDraft(data) : null
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

  /** Removes another session's lock. Requires `pages.unlock`. */
  async function forceUnlock(key: string): Promise<void> {
    const { error } = await (await getAuthClient(request)).rpc('cms_page_lock_force_unlock', {
      page_key: key,
    })

    if (error) {
      throw toCmsDataError(error, `Failed to unlock page "${key}"`)
    }
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
  }
}
