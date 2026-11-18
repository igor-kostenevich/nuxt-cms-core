/**
 * Field addresses in a page document (MASTER_PLAN C-48): dotted paths such as
 * `hero.title`. Inside a collection the segment after the array is the item
 * `id`, not its index, so an address survives reorder: `services.k3f9.title`.
 */

import type { CmsCollectionItem } from '../types/primitives'

export type DocumentNode = Record<string, unknown>

export function splitPath(path: string): string[] {
  return path.split('.').filter(Boolean)
}

export function joinPath(...parts: (string | undefined | null)[]): string {
  return parts.filter(part => part != null && part !== '').join('.')
}

export function isObject(value: unknown): value is DocumentNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isCollectionItem(value: unknown): value is CmsCollectionItem {
  return isObject(value) && typeof value.id === 'string'
}

function child(node: unknown, segment: string): unknown {
  if (Array.isArray(node)) {
    return node.find(item => isCollectionItem(item) && item.id === segment)
  }

  if (isObject(node)) {
    // Read before the own-property check: on a reactive proxy the read is what
    // Vue tracks, so a key added later still triggers dependents. hasOwn keeps
    // `constructor` and friends out.
    const value = node[segment]
    return Object.hasOwn(node, segment) ? value : undefined
  }

  return undefined
}

/** Value at `path`, or undefined when any segment is missing. */
export function getAt(document: unknown, path: string): unknown {
  let node = document

  for (const segment of splitPath(path)) {
    node = child(node, segment)

    if (node === undefined) {
      return undefined
    }
  }

  return node
}

/**
 * Writes `value` at `path`, creating missing objects on the way. A collection
 * item is never created implicitly: a missing id means the address is stale.
 * Returns false when the path cannot be written.
 */
export function setAt(document: DocumentNode, path: string, value: unknown): boolean {
  const segments = splitPath(path)
  const last = segments.pop()

  if (!last) {
    return false
  }

  let node: unknown = document

  for (const segment of segments) {
    let next = child(node, segment)

    if (next === undefined) {
      if (!isObject(node)) {
        return false
      }

      next = {}
      node[segment] = next
    }

    if (!isObject(next) && !Array.isArray(next)) {
      return false
    }

    node = next
  }

  if (!isObject(node)) {
    return false
  }

  if (value === undefined) {
    Reflect.deleteProperty(node, last)
  } else {
    node[last] = value
  }

  return true
}

/**
 * Whether `setAt(document, path, …)` would write, without writing or copying
 * anything: the same walk. Missing objects would be created; a missing
 * collection item or a non-object on the way stops it.
 */
export function canSetAt(document: unknown, path: string): boolean {
  const segments = splitPath(path)
  const last = segments.pop()

  if (!last) {
    return false
  }

  let node: unknown = document

  for (const segment of segments) {
    const next = child(node, segment)

    if (next === undefined) {
      // setAt creates an object here and below it: the write succeeds.
      return isObject(node)
    }

    if (!isObject(next) && !Array.isArray(next)) {
      return false
    }

    node = next
  }

  return isObject(node)
}

/**
 * JSON with object keys sorted at every level. Postgres jsonb returns keys in
 * its own order and the editor builds objects in insertion order; comparing
 * stable strings keeps an untouched or restored value from looking changed.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value ?? null, (_key, node: unknown) => {
    if (!isObject(node)) {
      return node
    }

    return Object.fromEntries(Object.keys(node).sort().map(key => [key, node[key]]))
  })
}

export function parseDocument(snapshot: string): DocumentNode {
  const value: unknown = JSON.parse(snapshot)
  return isObject(value) ? value : {}
}

export function cloneDocument<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T
}

/** Short random id for a collection item. Unique inside one collection is enough. */
export function createItemId(taken: Iterable<string> = []): string {
  const used = new Set(taken)

  for (;;) {
    const id = Math.random().toString(36).slice(2, 8)

    if (id.length === 6 && !used.has(id)) {
      return id
    }
  }
}
