import type { CmsCollectionItem } from '../types/primitives'

/**
 * Items from the page code get ids `default-0`, `default-1`… until the first
 * edit copies them into the document. The editor builds the same ids, so an
 * address such as `services.default-1.title` means the same item in both.
 */
export function withDefaultIds(defaults: readonly Record<string, unknown>[]): CmsCollectionItem[] {
  return defaults.map((item, index) => ({ ...item, id: `default-${index}` }))
}

/** Stored items with an id, else the code defaults. */
export function collectionItems(
  value: unknown,
  defaults: readonly Record<string, unknown>[],
): CmsCollectionItem[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is CmsCollectionItem =>
      typeof item === 'object' && item !== null && typeof (item as { id?: unknown }).id === 'string')
  }

  return withDefaultIds(defaults)
}
