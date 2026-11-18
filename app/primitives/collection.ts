import type { CmsCollectionItem } from '../types/primitives'
import { isCollectionItem, isObject, type DocumentNode } from './paths'

const ITEM_ID_PATTERN = /^[\w-]+$/

/**
 * Why the code defaults of a collection fall back to positional ids, or null
 * when every item has its own: `missing` — some item has no `id`; `invalid` —
 * an id is not an address segment or is used twice.
 */
export function defaultIdsIssue(defaults: readonly Record<string, unknown>[]): 'missing' | 'invalid' | null {
  if (defaults.length === 0) {
    return null
  }

  if (defaults.some(item => item.id === undefined)) {
    return 'missing'
  }

  const ids = defaults.map(item => item.id)
  const valid = ids.every(id => typeof id === 'string' && ITEM_ID_PATTERN.test(id))

  return valid && new Set(ids).size === ids.length ? null : 'invalid'
}

/**
 * Ids of the items from the page code (C-88). An item's own `id` is its
 * address (`services.design.title`): translations and overrides stay on it
 * when the developer reorders the defaults. Without ids on every item, the
 * whole list falls back to positions, `default-0`, `default-1`…, as before
 * 010d: an address then follows the position, not the item.
 *
 * The first edit copies the items into the document with these ids, so the
 * address stays the same before and after. A collection that already has
 * translations by position keeps them by pinning those ids in the current
 * order: `{ id: 'default-0', … }`, `{ id: 'default-1', … }`.
 */
export function withDefaultIds(defaults: readonly Record<string, unknown>[]): CmsCollectionItem[] {
  const own = defaultIdsIssue(defaults) === null

  return defaults.map((item, index) => ({ ...item, id: own ? item.id as string : `default-${index}` }))
}

const warned = new Set<string>()

/** Dev-only hint, once per collection: production builds drop the check. */
export function warnDefaultIds(fieldKey: string, defaults: readonly Record<string, unknown>[]): void {
  if (!import.meta.dev) {
    return
  }

  const issue = defaultIdsIssue(defaults)

  if (!issue || warned.has(fieldKey)) {
    return
  }

  warned.add(fieldKey)
  console.warn(issue === 'missing'
    ? `[nuxt-cms-core] CmsCollection "${fieldKey}": give every item of \`defaults\` a stable \`id\`. `
    + 'Without ids, translations follow positions and move to another item when the list is reordered. '
    + 'A list that already has translations keeps them with ids "default-0", "default-1"… in the current order.'
    : `[nuxt-cms-core] CmsCollection "${fieldKey}": ids of \`defaults\` must be unique and use letters, digits, "_" or "-". `
    + 'Falling back to positional ids.')
}

/** `override` laid over `base`: objects merge key by key, anything else replaces. */
function mergeDeep(base: DocumentNode, override: DocumentNode): DocumentNode {
  const result: DocumentNode = { ...base }

  for (const [key, value] of Object.entries(override)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue
    }

    const current = result[key]
    result[key] = isObject(current) && isObject(value) ? mergeDeep(current, value) : value
  }

  return result
}

/**
 * The code defaults with what a translation (or an edit of the original from
 * the Texts screen) says about them. While the original has not stored the
 * collection, such a change is an object keyed by item id (C-78, C-88):
 * `{ design: { title } }`. Ids stay the same when the original stores the
 * items later.
 */
export function withOverrides(defaults: CmsCollectionItem[], overrides: unknown): CmsCollectionItem[] {
  if (!isObject(overrides)) {
    return defaults
  }

  return defaults.map((item) => {
    const override = overrides[item.id]
    return isObject(override) ? { ...mergeDeep(item, override), id: item.id } : item
  })
}

/** Stored items with an id, else the code defaults (with their translation, if any). */
export function collectionItems(
  value: unknown,
  defaults: readonly Record<string, unknown>[],
): CmsCollectionItem[] {
  if (Array.isArray(value)) {
    return value.filter(isCollectionItem)
  }

  return withOverrides(withDefaultIds(defaults), value)
}
