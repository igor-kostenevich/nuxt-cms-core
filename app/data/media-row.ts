import { CMS_MEDIA_TYPES, type CmsFocalPoint, type CmsMedia, type CmsMediaMap, type CmsMediaMime } from '../types/media'
import type { Json } from './database.types'
import { CmsDataError } from './errors'
import type { CmsStorageAdapter } from './storage/storage-adapter'

/**
 * A cms_media row as the library select and cms_media_of() return it.
 * snake_case stays inside the data layer.
 */
export interface MediaRow {
  id: string
  display_name: string
  storage_path: string
  mime: string
  size: number
  width: number | null
  height: number | null
  default_alt: string
  default_focal: Json | null
  created_at: string
  updated_at: string
}

/** Columns of MediaRow, for selects. */
export const MEDIA_COLUMNS
  = 'id, display_name, storage_path, mime, size, width, height, default_alt, default_focal, created_at, updated_at'

function isMime(value: string): value is CmsMediaMime {
  return Object.hasOwn(CMS_MEDIA_TYPES, value)
}

function toFocal(value: Json | null): CmsFocalPoint | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }

  const { x, y } = value

  return typeof x === 'number' && typeof y === 'number' ? { x, y } : null
}

export function toCmsMedia(row: MediaRow, storage: Pick<CmsStorageAdapter, 'publicUrl'>): CmsMedia {
  // The table has a check constraint for this; the guard keeps a schema drift
  // from reaching templates as an unknown type.
  if (!isMime(row.mime)) {
    throw new CmsDataError('unknown', `Media ${row.id} has an unsupported type "${row.mime}".`)
  }

  return {
    id: row.id,
    name: row.display_name,
    url: storage.publicUrl(row.storage_path),
    mime: row.mime,
    size: row.size,
    width: row.width,
    height: row.height,
    defaultAlt: row.default_alt,
    defaultFocal: toFocal(row.default_focal),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** The `media` array of a page read (cms_media_of) as a map by id. */
export function toMediaMap(value: Json, storage: Pick<CmsStorageAdapter, 'publicUrl'>): CmsMediaMap {
  const map: CmsMediaMap = {}

  if (!Array.isArray(value)) {
    return map
  }

  for (const row of value) {
    const media = toCmsMedia(row as unknown as MediaRow, storage)
    map[media.id] = media
  }

  return map
}
