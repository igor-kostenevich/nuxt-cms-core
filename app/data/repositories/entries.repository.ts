import type { H3Event } from 'h3'
import type {
  CmsPageContent,
  CmsPageEditable,
  CmsPageLocaleState,
  CmsPageLockStatus,
  CmsPageRevision,
} from '../../types/pages'
import type {
  CmsEntriesQuery,
  CmsEntry,
  CmsEntryCreated,
  CmsEntryList,
  CmsEntryListQuery,
  CmsEntrySlugCheck,
  CmsEntryState,
  CmsEntryStatus,
} from '../../types/entries'
import { defaultCmsConfig } from '../../../src/config'
import type { Database, Json } from '../database.types'
import { CmsDataError } from '../errors'
import { UUID_PATTERN } from '../ids'
import { createSupabaseStorage } from '../storage/supabase-storage'
import { applyTranslation } from '../../primitives/translation'
import { toMediaMap } from '../media-row'
import { getSupabaseClient, toCmsDataError } from '../supabase'
import { createUnloadRelease } from '../unload-release'
import { toCmsPageEditable } from './pages.repository'

/** The History panel lists this many latest publications, as for pages. */
const REVISIONS_LIMIT = 50

const STATUSES: readonly CmsEntryStatus[] = ['draft', 'published', 'changed', 'archived']

/**
 * Most entry methods are for the admin and use the session client (C-21);
 * the public reads (`getPublished`, `listPublished`) use the anon client.
 */
async function getAuthClient(request?: H3Event) {
  const { getSupabaseAuthClient } = await import('../supabase-auth')
  return getSupabaseAuthClient(request)
}

/**
 * Generated RPC arguments are typed non-null, but these functions take SQL
 * null for "the language of the original" or "a new entry": passed as is.
 */
function sqlNull<T>(value: T | null): T {
  return value as T
}

/** Most ids a public read takes (014 §7): the server refuses more (`cms_entries_get_published`). */
export const ENTRY_IDS_LIMIT = 100

// Function results are typed non-null in the generated types; nullable
// columns are widened here.
type Nullable<T> = { [K in keyof T]: T[K] | null }
type ListRow = Nullable<Database['public']['Functions']['cms_entries_admin_list']['Returns'][number]>

/** What the public reads return for one entry, before the translation is applied. */
interface PublishedRow {
  id: string | null
  base: Json | null
  base_published_at: string | null
  translation: Json | null
  translation_published_at: string | null
  first_published_at: string | null
  media: Json | null
  slug?: string | null
  slugs?: Json | null
}

function asContent(value: Json | null): CmsPageContent | null {
  if (value === null) {
    return null
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new CmsDataError('unknown', 'Entry content is not an object.')
  }

  return value as CmsPageContent
}

function asSlugs(value: Json | null | undefined): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return Object.fromEntries(Object.entries(value).filter((pair): pair is [string, string] => typeof pair[1] === 'string'))
}

function toStatus(value: string | null): CmsEntryStatus {
  if (value && (STATUSES as readonly string[]).includes(value)) {
    return value as CmsEntryStatus
  }

  throw new CmsDataError('unknown', `Unknown entry status "${value}".`)
}

export interface EntriesRepositoryOptions {
  /** Default locale while the site has no languages yet: `defaultLocale` of cms.config.ts. */
  bootstrapLocale?: string
}

/**
 * Entries (014): records of the types the Client Project declares. Every
 * write is a database function that checks the permission, the pair
 * (type, id) and the lock in one transaction. Table reads list their columns:
 * `cms_entries` does not expose every column (who created an entry), so a
 * `select=*` there would fail.
 */
export function createEntriesRepository(request?: H3Event, options: EntriesRepositoryOptions = {}) {
  const storage = createSupabaseStorage(request)
  const bootstrapLocale = options.bootstrapLocale ?? defaultCmsConfig.defaultLocale
  const unloadRelease = createUnloadRelease(request)

  /** The original with the translation applied (C-78); null when the original is not published. */
  function toEntry(type: string, locale: string, defaultLocale: string, row: PublishedRow): CmsEntry | null {
    const base = asContent(row.base)
    const translation = asContent(row.translation)
    const publishedAt = row.translation_published_at ?? row.base_published_at

    if (!row.id || !base || !publishedAt) {
      return null
    }

    const slugs = asSlugs(row.slugs)

    return {
      id: row.id,
      type,
      locale,
      defaultLocale,
      content: translation ? applyTranslation(base, translation) : base,
      publishedAt,
      firstPublishedAt: row.first_published_at,
      media: toMediaMap((row.media ?? []) as never, storage),
      translated: locale === defaultLocale || translation !== null,
      slug: row.slug ?? slugs[locale] ?? null,
      slugs,
    }
  }

  /**
   * A published entry of a type by its address in a language (null: the
   * default language). Null when there is no such public entry: a 404 for the
   * site. Archived, unpublished and hidden-language entries are never returned,
   * whoever is signed in.
   */
  async function getPublished(type: string, slug: string, locale: string | null): Promise<CmsEntry | null> {
    const { data, error } = await getSupabaseClient()
      .rpc('cms_entry_get_localized', { entry_type: type, slug, entry_locale: sqlNull(locale), bootstrap_locale: bootstrapLocale })
      .maybeSingle()

    if (error) {
      throw toCmsDataError(error, `Failed to load the entry "${slug}" of type "${type}"`)
    }

    if (!data) {
      return null
    }

    const defaultLocale = data.default_locale ?? locale ?? bootstrapLocale
    return toEntry(type, locale ?? defaultLocale, defaultLocale, data as PublishedRow)
  }

  /**
   * Published entries of a type: chosen ids in their order (Manual), or a page
   * (Automatic), with their media in one request. `total`: every match.
   */
  async function listPublished(type: string, locale: string | null, query: CmsEntriesQuery = {}): Promise<{ entries: CmsEntry[], total: number }> {
    const ids = query.ids ? query.ids.filter(id => UUID_PATTERN.test(id)) : null

    if (ids && ids.length === 0) {
      return { entries: [], total: 0 }
    }

    if (ids && ids.length > ENTRY_IDS_LIMIT) {
      throw new CmsDataError('validation', `Up to ${ENTRY_IDS_LIMIT} entries can be read by id.`)
    }

    const { data, error } = await getSupabaseClient().rpc('cms_entries_get_published', {
      entry_type: type,
      entry_locale: sqlNull(locale),
      ids: ids ?? undefined,
      ...(query.ids
        ? { sort: 'newest', page_limit: ids?.length ?? 0, page_offset: 0 }
        : { sort: query.sort ?? 'newest', page_limit: query.limit ?? 20, page_offset: query.offset ?? 0 }),
      bootstrap_locale: bootstrapLocale,
    })

    if (error) {
      throw toCmsDataError(error, `Failed to list the entries of type "${type}"`)
    }

    const rows = data as unknown as (PublishedRow & { default_locale: string | null, total: number | null })[]

    return {
      entries: rows
        .map((row) => {
          const defaultLocale = row.default_locale ?? locale ?? bootstrapLocale
          return toEntry(type, locale ?? defaultLocale, defaultLocale, row)
        })
        .filter((entry): entry is CmsEntry => entry !== null),
      total: Number(rows[0]?.total ?? 0),
    }
  }

  /**
   * Creates an entry with its first draft in the language of the original.
   * `id` is chosen by the caller once per editing session: a retry with it
   * returns the same entry. `takeLock` (the Content dialog) also takes the
   * lock and returns its token; the Pages dialog creates without it.
   */
  async function create(
    type: string,
    content: CmsPageContent,
    options: { id: string, takeLock: boolean },
  ): Promise<CmsEntryCreated> {
    const { data, error } = await (await getAuthClient(request))
      .rpc('cms_entry_create', {
        entry_type: type,
        content: content as Json,
        take_lock: options.takeLock,
        entry_id: options.id,
        bootstrap_locale: bootstrapLocale,
      })
      .maybeSingle()

    if (error) {
      throw toCmsDataError(error, `Failed to create an entry of type "${type}"`)
    }

    if (!data) {
      throw new CmsDataError('unknown', `Creating an entry of type "${type}" returned nothing.`)
    }

    return {
      id: data.id,
      draftUpdatedAt: data.draft_updated_at ?? null,
      lockToken: data.lock_token ?? null,
    }
  }

  /** Draft and Published of a locale, and for a translation its base (C-78). Null locale: the original. */
  async function getEditable(type: string, id: string, locale: string | null): Promise<CmsPageEditable> {
    const { data, error } = await (await getAuthClient(request))
      .rpc('cms_entry_get_editable', {
        entry_type: type,
        entry_id: id,
        entry_locale: sqlNull(locale),
        bootstrap_locale: bootstrapLocale,
      })
      .maybeSingle()

    if (error) {
      throw toCmsDataError(error, `Failed to load the entry ${id} for editing`)
    }

    if (!data) {
      throw new CmsDataError('unknown', `The entry ${id} returned no editable state.`)
    }

    return toCmsPageEditable(id, locale, data, storage)
  }

  async function getLocaleStates(type: string, id: string): Promise<CmsPageLocaleState[]> {
    const { data, error } = await (await getAuthClient(request))
      .rpc('cms_entry_locale_states', { entry_type: type, entry_id: id })

    if (error) {
      throw toCmsDataError(error, `Failed to load the languages of the entry ${id}`)
    }

    return (data as Nullable<(typeof data)[number]>[]).map(row => ({
      locale: row.locale ?? '',
      hasDraft: row.has_draft ?? false,
      publishedAt: row.published_at,
    }))
  }

  /** Saves the draft; null when it equals the published version. */
  async function saveDraft(type: string, id: string, locale: string, content: CmsPageContent, lockToken: string): Promise<string | null> {
    const { data, error } = await (await getAuthClient(request)).rpc('cms_entry_save_draft', {
      entry_type: type,
      entry_id: id,
      entry_locale: locale,
      content: content as Json,
      lock_token: lockToken,
    })

    if (error) {
      throw toCmsDataError(error, `Failed to save the draft of the entry ${id}`)
    }

    return data ?? null
  }

  /**
   * Publishes the saved draft. `requireSlug`: the type has a route, so the
   * entry needs an address in this language. A taken address is `slug_taken`.
   */
  async function publish(type: string, id: string, locale: string, lockToken: string, options: { requireSlug?: boolean } = {}): Promise<string> {
    const { data, error } = await (await getAuthClient(request)).rpc('cms_entry_publish', {
      entry_type: type,
      entry_id: id,
      entry_locale: locale,
      lock_token: lockToken,
      require_slug: options.requireSlug ?? false,
    })

    if (error) {
      throw toCmsDataError(error, `Failed to publish the entry ${id}`)
    }

    return data
  }

  async function restore(
    type: string,
    id: string,
    locale: string,
    revisionId: string,
    lockToken: string,
    options: { replaceDraft?: boolean } = {},
  ): Promise<string | null> {
    const { data, error } = await (await getAuthClient(request)).rpc('cms_entry_restore', {
      entry_type: type,
      entry_id: id,
      entry_locale: locale,
      revision_id: revisionId,
      lock_token: lockToken,
      replace_draft: options.replaceDraft ?? false,
    })

    if (error) {
      throw toCmsDataError(error, `Failed to restore a revision of the entry ${id}`)
    }

    return data ?? null
  }

  /** Publications of the entry in one locale, newest first; content is not loaded. */
  async function listRevisions(id: string, locale: string): Promise<CmsPageRevision[]> {
    const { data, error } = await (await getAuthClient(request))
      .from('cms_page_revisions')
      .select('id, locale, created_at')
      .eq('page_id', id)
      .eq('locale', locale)
      .order('created_at', { ascending: false })
      .limit(REVISIONS_LIMIT)

    if (error) {
      throw toCmsDataError(error, `Failed to load the revisions of the entry ${id}`)
    }

    return data.map(row => ({ id: row.id, locale: row.locale, createdAt: row.created_at }))
  }

  /** One publication of this entry in this locale; null when it is gone or not the entry's. */
  async function getRevision(revisionId: string, id: string, locale: string): Promise<CmsPageRevision | null> {
    if (!UUID_PATTERN.test(revisionId) || !UUID_PATTERN.test(id)) {
      return null
    }

    const { data, error } = await (await getAuthClient(request))
      .from('cms_page_revisions')
      .select('id, locale, created_at')
      .eq('id', revisionId)
      .eq('page_id', id)
      .eq('locale', locale)
      .maybeSingle()

    if (error) {
      throw toCmsDataError(error, `Failed to load a revision of the entry ${id}`)
    }

    return data ? { id: data.id, locale: data.locale, createdAt: data.created_at } : null
  }

  async function acquireLock(type: string, id: string): Promise<string> {
    const { data, error } = await (await getAuthClient(request)).rpc('cms_entry_lock_acquire', { entry_type: type, entry_id: id })

    if (error) {
      throw toCmsDataError(error, `Failed to lock the entry ${id}`)
    }

    return data
  }

  async function heartbeatLock(type: string, id: string, lockToken: string): Promise<void> {
    const { error } = await (await getAuthClient(request))
      .rpc('cms_entry_lock_heartbeat', { entry_type: type, entry_id: id, lock_token: lockToken })

    if (error) {
      throw toCmsDataError(error, `Failed to keep the lock of the entry ${id}`)
    }
  }

  /** Releasing a lock the session no longer holds is not an error. */
  async function releaseLock(type: string, id: string, lockToken: string): Promise<void> {
    const { error } = await (await getAuthClient(request))
      .rpc('cms_entry_lock_release', { entry_type: type, entry_id: id, lock_token: lockToken })

    if (error) {
      throw toCmsDataError(error, `Failed to release the lock of the entry ${id}`)
    }
  }

  /** Removes another session's lock. Requires `pages.unlock`. */
  async function forceUnlock(type: string, id: string): Promise<void> {
    const { error } = await (await getAuthClient(request)).rpc('cms_entry_lock_force_unlock', { entry_type: type, entry_id: id })

    if (error) {
      throw toCmsDataError(error, `Failed to unlock the entry ${id}`)
    }
  }

  /** Who holds the lock, without the token. Null when nobody does. */
  async function getLockStatus(type: string, id: string): Promise<CmsPageLockStatus | null> {
    const { data, error } = await (await getAuthClient(request)).rpc('cms_entry_lock_status', { entry_type: type, entry_id: id })

    if (error) {
      throw toCmsDataError(error, `Failed to read the lock of the entry ${id}`)
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

  function prepareUnloadRelease(): Promise<void> {
    return unloadRelease.prepare()
  }

  function releaseLockOnUnload(type: string, id: string, lockToken: string): void {
    unloadRelease.release('cms_entry_lock_release', { entry_type: type, entry_id: id, lock_token: lockToken })
  }

  /** Takes the entry off the public site, keeping everything. Requires `pages.publish`. */
  async function archive(type: string, id: string): Promise<void> {
    const { error } = await (await getAuthClient(request)).rpc('cms_entry_archive', { entry_type: type, entry_id: id })

    if (error) {
      throw toCmsDataError(error, `Failed to archive the entry ${id}`)
    }
  }

  /** Takes an entry off the site from the editor that holds its lock (archive refuses an entry open in an editor). */
  async function takeOff(type: string, id: string, lockToken: string): Promise<void> {
    const { error } = await (await getAuthClient(request)).rpc('cms_entry_take_off', {
      entry_type: type,
      entry_id: id,
      lock_token: lockToken,
    })

    if (error) {
      throw toCmsDataError(error, `Failed to take the entry ${id} off the site`)
    }
  }

  /** Deletes an entry for good: one that is not on the site, from the editor that holds its lock. */
  async function remove(type: string, id: string, lockToken: string): Promise<void> {
    const { error } = await (await getAuthClient(request)).rpc('cms_entry_delete', {
      entry_type: type,
      entry_id: id,
      lock_token: lockToken,
    })

    if (error) {
      throw toCmsDataError(error, `Failed to delete the entry ${id}`)
    }
  }

  async function unarchive(type: string, id: string): Promise<void> {
    const { error } = await (await getAuthClient(request)).rpc('cms_entry_unarchive', { entry_type: type, entry_id: id })

    if (error) {
      throw toCmsDataError(error, `Failed to unarchive the entry ${id}`)
    }
  }

  /**
   * Saves the complete manual order of the live entries of a type, checked
   * against the version the list was read at. `conflict` when anything
   * changed meanwhile: read the list again. Returns the new version.
   */
  async function reorder(type: string, ids: string[], orderVersion: string): Promise<string> {
    const { data, error } = await (await getAuthClient(request))
      .rpc('cms_entry_reorder', { entry_type: type, ids, expected_version: orderVersion })

    if (error) {
      throw toCmsDataError(error, `Failed to reorder the entries of type "${type}"`)
    }

    return data
  }

  /** A page of the admin list of a type. */
  async function list(type: string, query: CmsEntryListQuery = {}): Promise<CmsEntryList> {
    const { data, error } = await (await getAuthClient(request)).rpc('cms_entries_admin_list', {
      entry_type: type,
      search: query.search?.trim() || undefined,
      archived: sqlNull(query.archived === undefined ? false : query.archived),
      sort: query.sort ?? 'manual',
      page_limit: query.limit ?? 50,
      page_offset: query.offset ?? 0,
      bootstrap_locale: bootstrapLocale,
      status_filter: query.statuses?.length ? [...query.statuses] : undefined,
    })

    if (error) {
      throw toCmsDataError(error, `Failed to list the entries of type "${type}"`)
    }

    const rows = data as ListRow[]

    return {
      items: rows.map(row => ({
        id: row.id ?? '',
        title: row.title,
        slug: row.slug,
        status: toStatus(row.status),
        updatedAt: row.updated_at,
        publishedAt: row.published_at,
        firstPublishedAt: row.first_published_at,
        archivedAt: row.archived_at,
        sortOrder: row.sort_order ?? 0,
      })),
      total: Number(rows[0]?.total ?? 0),
      orderVersion: rows[0]?.order_version ?? null,
    }
  }

  /** State of chosen entries; missing ids are left out. */
  async function status(ids: string[]): Promise<CmsEntryState[]> {
    const valid = ids.filter(id => UUID_PATTERN.test(id))

    if (valid.length === 0) {
      return []
    }

    const { data, error } = await (await getAuthClient(request)).rpc('cms_entries_status', { ids: valid })

    if (error) {
      throw toCmsDataError(error, 'Failed to read the state of entries')
    }

    return data.map(row => ({
      id: row.id,
      type: row.type,
      title: row.title ?? null,
      archived: row.archived,
      publishedLocales: row.published_locales ?? [],
    }))
  }

  /** Whether an address is free in a language for this entry (null: a new one). */
  async function checkSlug(type: string, id: string | null, locale: string, slug: string): Promise<CmsEntrySlugCheck> {
    const { data, error } = await (await getAuthClient(request))
      .rpc('cms_entry_slug_check', { entry_type: type, entry_id: sqlNull(id), slug_locale: locale, slug })
      .maybeSingle()

    if (error) {
      throw toCmsDataError(error, 'Failed to check an address')
    }

    if (data?.status === 'taken') {
      return { status: 'taken', holderTitle: data.holder_title ?? null, holderArchived: data.holder_archived ?? false }
    }

    return { status: data?.status === 'ok' ? 'ok' : 'invalid' }
  }

  /** The entry a published address leads to (Edit Mode without `?entry`); null when none. */
  async function findBySlug(type: string, locale: string | null, slug: string): Promise<string | null> {
    const { data, error } = await (await getAuthClient(request))
      .rpc('cms_entry_find', { entry_type: type, slug_locale: sqlNull(locale), slug })

    if (error) {
      throw toCmsDataError(error, 'Failed to find an entry by its address')
    }

    return data ?? null
  }

  return {
    getPublished,
    listPublished,
    create,
    getEditable,
    getLocaleStates,
    saveDraft,
    publish,
    restore,
    listRevisions,
    getRevision,
    acquireLock,
    heartbeatLock,
    releaseLock,
    forceUnlock,
    getLockStatus,
    prepareUnloadRelease,
    releaseLockOnUnload,
    archive,
    unarchive,
    remove,
    takeOff,
    reorder,
    list,
    status,
    checkSlug,
    findBySlug,
  }
}

export type EntriesRepository = ReturnType<typeof createEntriesRepository>
