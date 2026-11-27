/**
 * Media library types (MASTER_PLAN C-14, C-74). A media item is the CMS
 * identity of a file; content stores its id, never its URL.
 */

/** Accepted file types and the extension stored with each (C-75). */
export const CMS_MEDIA_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
} as const

/** Upload limit in bytes; the bucket and the database enforce the same value. */
export const CMS_MEDIA_MAX_SIZE = 5 * 1024 * 1024

export type CmsMediaMime = keyof typeof CMS_MEDIA_TYPES

/** Focal point in percent of the image, 0–100 on each axis. */
export interface CmsFocalPoint {
  x: number
  y: number
}

/** A file of the media library, as the application sees it. */
export interface CmsMedia {
  id: string
  /** Name in the library; editable, not the storage path. */
  name: string
  /** Public URL of the current file. Changes on Replace; never store it in content. */
  url: string
  mime: CmsMediaMime
  /** Bytes. */
  size: number
  /** Null for an SVG without intrinsic size. */
  width: number | null
  height: number | null
  /** Alt text every usage starts from. */
  defaultAlt: string
  defaultFocal: CmsFocalPoint | null
  createdAt: string
  updatedAt: string
}

/** Media referenced by a document, by id. */
export type CmsMediaMap = Record<string, CmsMedia>

/**
 * Value of `CmsImage` and `CmsBackground` (C-74). Stored in page documents:
 * change it only additively.
 *
 * Alt is the first non-empty of: `alt` → the media's default alt → the `alt`
 * prop in code.
 * Decorative (here or as a prop) always renders an empty alt.
 * Focal resolves as `focal` → the media's default focal point.
 */
export interface CmsImageValue {
  mediaId: string
  alt?: string
  decorative?: boolean
  focal?: CmsFocalPoint
}

/** One place that uses a media item (C-72). */
export type CmsMediaUsage =
  | { kind: 'page', pageKey: string, locale: string, draft: boolean }
  | { kind: 'brand', slot: 'logo' | 'favicon' }
  /** An entry of a type declared by the Client (014), archived ones included. */
  | { kind: 'entry', type: string, id: string, title: string | null, locale: string, draft: boolean }

/** Filters of the media library list. */
export interface CmsMediaQuery {
  search?: string
  /** `image` is every raster type; `svg` is SVG only. */
  type?: 'all' | 'image' | 'svg'
  sort?: 'newest' | 'oldest' | 'name' | 'size'
}

/** What an upload needs besides the file: the browser reads the dimensions. */
export interface CmsMediaUpload {
  file: File
  width: number | null
  height: number | null
}
