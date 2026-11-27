import type { H3Event } from 'h3'
import {
  CMS_MEDIA_TYPES,
  type CmsFocalPoint,
  type CmsMedia,
  type CmsMediaQuery,
  type CmsMediaUpload,
  type CmsMediaUsage,
} from '../../types/media'
import { CmsDataError } from '../errors'
import { MEDIA_COLUMNS, toCmsMedia, type MediaRow } from '../media-row'
import type { CmsStorageAdapter } from '../storage/storage-adapter'
import { createSupabaseStorage } from '../storage/supabase-storage'
import { toCmsDataError } from '../supabase'

const TABLE = 'cms_media'
const RASTER_TYPES = Object.keys(CMS_MEDIA_TYPES).filter(mime => mime !== 'image/svg+xml')

const SORTS: Record<NonNullable<CmsMediaQuery['sort']>, { column: string, ascending: boolean }> = {
  newest: { column: 'created_at', ascending: false },
  oldest: { column: 'created_at', ascending: true },
  name: { column: 'display_name', ascending: true },
  size: { column: 'size', ascending: false },
}

/** Editable metadata of a media item. */
export interface CmsMediaPatch {
  name: string
  defaultAlt: string
  defaultFocal: CmsFocalPoint | null
}

async function getAuthClient(request?: H3Event) {
  const { getSupabaseAuthClient } = await import('../supabase-auth')
  return getSupabaseAuthClient(request)
}

/** `%` and `_` are wildcards in LIKE: a search for "50%" must match the text. */
function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, char => `\\${char}`)}%`
}

/** A new object name: random, with the extension of the type (R-13: never reused). */
function newStoragePath(mime: string): string {
  const extension = Object.hasOwn(CMS_MEDIA_TYPES, mime)
    ? CMS_MEDIA_TYPES[mime as keyof typeof CMS_MEDIA_TYPES]
    : null

  if (!extension) {
    throw new CmsDataError('validation', `Files of type "${mime || 'unknown'}" are not accepted.`)
  }

  return `${crypto.randomUUID()}.${extension}`
}

function toUsage(row: {
  source: string
  page_key: string | null
  locale: string | null
  is_draft: boolean
  entry_id?: string | null
  entry_type?: string | null
  entry_title?: string | null
}): CmsMediaUsage | null {
  if (row.source === 'page' && row.page_key && row.locale) {
    return { kind: 'page', pageKey: row.page_key, locale: row.locale, draft: row.is_draft }
  }

  if (row.source === 'entry' && row.entry_id && row.entry_type && row.locale) {
    return { kind: 'entry', type: row.entry_type, id: row.entry_id, title: row.entry_title ?? null, locale: row.locale, draft: row.is_draft }
  }

  if (row.source === 'brand.logo') {
    return { kind: 'brand', slot: 'logo' }
  }

  if (row.source === 'brand.favicon') {
    return { kind: 'brand', slot: 'favicon' }
  }

  return null
}

/**
 * Media library (architecture Б7): metadata in `cms_media`, files behind the
 * Storage Adapter. Every write is a database function that checks the
 * permission; the file goes to Storage first and is registered after (C-71).
 * Admin and Edit Mode only: the public site gets media with the page read.
 */
export function createMediaRepository(request?: H3Event, storage: CmsStorageAdapter = createSupabaseStorage(request)) {
  async function list(query: CmsMediaQuery = {}): Promise<CmsMedia[]> {
    const sort = SORTS[query.sort ?? 'newest']
    let select = (await getAuthClient(request)).from(TABLE).select(MEDIA_COLUMNS)
    const search = query.search?.trim()

    if (search) {
      select = select.ilike('display_name', likePattern(search))
    }

    if (query.type === 'image') {
      select = select.in('mime', RASTER_TYPES)
    } else if (query.type === 'svg') {
      select = select.eq('mime', 'image/svg+xml')
    }

    const { data, error } = await select
      .order(sort.column, { ascending: sort.ascending })
      .order('id')

    if (error) {
      throw toCmsDataError(error, 'Failed to load the media library')
    }

    return (data as MediaRow[]).map(row => toCmsMedia(row, storage))
  }

  /** One media item; `not_found` when it does not exist or is deleted. */
  async function get(id: string): Promise<CmsMedia> {
    const { data, error } = await (await getAuthClient(request))
      .from(TABLE)
      .select(MEDIA_COLUMNS)
      .eq('id', id)
      .single<MediaRow>()

    if (error) {
      throw toCmsDataError(error, `Failed to load media ${id}`)
    }

    return toCmsMedia(data, storage)
  }

  /**
   * Where media are used (C-72), by media id. Without ids: every item.
   * An unused item has no entry.
   */
  async function getUsage(ids?: string[]): Promise<Map<string, CmsMediaUsage[]>> {
    const { data, error } = await (await getAuthClient(request))
      .rpc('cms_media_usage', ids ? { media_ids: ids } : {})

    if (error) {
      throw toCmsDataError(error, 'Failed to load media usage')
    }

    const usage = new Map<string, CmsMediaUsage[]>()

    for (const row of data) {
      const item = toUsage(row)

      if (item) {
        usage.set(row.media_id, [...usage.get(row.media_id) ?? [], item])
      }
    }

    return usage
  }

  /** Puts the file into Storage, then registers it. A failed registration removes the file. */
  async function upload({ file, width, height }: CmsMediaUpload): Promise<CmsMedia> {
    const path = newStoragePath(file.type)
    await storage.upload(path, file, file.type)

    const { data, error } = await (await getAuthClient(request)).rpc('cms_media_create', {
      storage_path: path,
      display_name: file.name,
      width: width ?? undefined,
      height: height ?? undefined,
    })

    if (error) {
      await storage.remove([path]).catch(() => undefined)
      throw toCmsDataError(error, `Failed to add "${file.name}" to the media library`)
    }

    return get(data)
  }

  async function update(id: string, patch: CmsMediaPatch): Promise<CmsMedia> {
    const { error } = await (await getAuthClient(request)).rpc('cms_media_update', {
      media_id: id,
      display_name: patch.name,
      default_alt: patch.defaultAlt,
      default_focal: patch.defaultFocal ? { x: patch.defaultFocal.x, y: patch.defaultFocal.y } : undefined,
    })

    if (error) {
      throw toCmsDataError(error, `Failed to update media ${id}`)
    }

    return get(id)
  }

  /**
   * Replaces the file of a media item: a new object under the same id, so
   * every usage shows the new file and no cache serves the old one (R-13).
   * The old object is removed best effort; a leftover is only storage.
   */
  async function replace(id: string, { file, width, height }: CmsMediaUpload): Promise<CmsMedia> {
    const path = newStoragePath(file.type)
    await storage.upload(path, file, file.type)

    const { data, error } = await (await getAuthClient(request)).rpc('cms_media_replace', {
      media_id: id,
      storage_path: path,
      width: width ?? undefined,
      height: height ?? undefined,
    })

    if (error) {
      await storage.remove([path]).catch(() => undefined)
      throw toCmsDataError(error, `Failed to replace the file of media ${id}`)
    }

    await storage.remove([data]).catch(() => undefined)
    return get(id)
  }

  /** Soft delete. Places that use it render their code default. Requires `media.delete`. */
  async function remove(id: string): Promise<void> {
    const { error } = await (await getAuthClient(request)).rpc('cms_media_delete', { media_id: id })

    if (error) {
      throw toCmsDataError(error, `Failed to delete media ${id}`)
    }
  }

  return { list, get, getUsage, upload, update, replace, remove }
}
