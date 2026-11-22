import { getCurrentInstance, hasInjectionContext, inject, provide, type InjectionKey } from 'vue'
import type { CmsFocalPoint, CmsImageValue, CmsMedia, CmsMediaMap } from '../types/media'

export type { CmsFocalPoint } from '../types/media'

/** CSS `object-position` for a focal point; undefined keeps the browser default. */
export function focalPosition(focal: CmsFocalPoint | undefined | null, fallback?: string): string | undefined {
  return focal ? `${focal.x}% ${focal.y}%` : fallback
}

function isPercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
}

/** A focal point with both axes in 0–100, or undefined. */
function toFocal(value: unknown): CmsFocalPoint | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const { x, y } = value as Record<string, unknown>
  return isPercent(x) && isPercent(y) ? { x, y } : undefined
}

/**
 * A stored image value, or null for anything else (old or hand-edited content).
 *
 * Content is untrusted input: anyone with `pages.edit` can write any JSON
 * through the API. Every field is rebuilt from checked parts, so a string in
 * `focal` cannot reach the `style` attribute (C-49, CSS injection).
 */
export function toImageValue(value: unknown): CmsImageValue | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }

  const candidate = value as Record<string, unknown>

  if (typeof candidate.mediaId !== 'string' || !candidate.mediaId) {
    return null
  }

  const image: CmsImageValue = { mediaId: candidate.mediaId }
  const focal = toFocal(candidate.focal)

  if (typeof candidate.alt === 'string') {
    image.alt = candidate.alt
  }

  if (candidate.decorative === true) {
    image.decorative = true
  }

  if (focal) {
    image.focal = focal
  }

  return image
}

/** What the code says when content has no image: the primitive's props. */
export interface ImageDefaults {
  src?: string
  alt?: string
  decorative?: boolean
  /** CSS object-position from code, used when no focal point applies. */
  position?: string
}

export interface ResolvedImage {
  src: string | undefined
  alt: string
  width: number | undefined
  height: number | undefined
  objectPosition: string | undefined
  /** The media item behind the image; null when the code default renders. */
  media: CmsMedia | null
}

/**
 * The image a primitive renders (MASTER_PLAN C-74).
 *
 * - No value, or its media is deleted or unknown: the code default.
 * - Alt: value → media default → code, the first non-empty one. Decorative
 *   here or in code: empty.
 * - Focal: value → media default → code position.
 */
export function resolveImage(value: unknown, media: CmsMediaMap, defaults: ImageDefaults): ResolvedImage {
  const image = toImageValue(value)
  // Own keys only: a stored mediaId such as "constructor" is not a media item.
  const item = image && Object.hasOwn(media, image.mediaId) ? media[image.mediaId] ?? null : null

  // The code default renders as the code says: `decorative` in the value
  // belonged to a file that is gone.
  if (!image || !item) {
    return {
      src: defaults.src,
      alt: defaults.decorative ? '' : defaults.alt ?? '',
      width: undefined,
      height: undefined,
      objectPosition: defaults.position,
      media: null,
    }
  }

  const decorative = Boolean(defaults.decorative || image.decorative)

  return {
    src: item.url,
    // An empty alt means "not set": an image without alt is `decorative`.
    alt: decorative ? '' : image.alt || item.defaultAlt || defaults.alt || '',
    width: item.width ?? undefined,
    height: item.height ?? undefined,
    objectPosition: focalPosition(image.focal ?? item.defaultFocal, defaults.position),
    media: item,
  }
}

/**
 * Media of the page documents, provided by useCmsPage to the primitives
 * below it. A getter, so the map follows the async data.
 */
export const CMS_MEDIA: InjectionKey<() => CmsMediaMap> = Symbol('cms-media')

const EMPTY: CmsMediaMap = Object.freeze({}) as CmsMediaMap
const sources = new WeakMap<object, (() => CmsMediaMap)[]>()

/**
 * Adds a document's media to what the current component provides. A page may
 * call useCmsPage for several keys; each adds its own source, and the ones
 * from parent components stay visible.
 */
export function provideCmsMedia(source: () => CmsMediaMap | null | undefined) {
  const instance = getCurrentInstance()

  if (!instance) {
    return
  }

  const own = sources.get(instance)
  const getter = () => source() ?? EMPTY

  if (own) {
    own.push(getter)
    return
  }

  const list = [getter]
  const parent = inject(CMS_MEDIA, null)
  sources.set(instance, list)
  provide(CMS_MEDIA, () => {
    const merged: CmsMediaMap = { ...parent?.() }

    for (const item of list) {
      Object.assign(merged, item())
    }

    return merged
  })
}

/** The media map visible to a primitive; empty outside a page. */
export function injectCmsMedia(): () => CmsMediaMap {
  return (hasInjectionContext() ? inject(CMS_MEDIA, null) : null) ?? (() => EMPTY)
}
