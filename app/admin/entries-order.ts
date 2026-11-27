import type { CmsEntryStatus } from '../types/entries'

/**
 * The statuses asked of the server for the status filter: «draft» is also
 * what was taken off the site (the lists show those as drafts).
 */
export function serverStatuses(values: readonly CmsEntryStatus[]): CmsEntryStatus[] {
  return values.includes('draft') ? [...values, 'archived'] : [...values]
}

/**
 * The list of a type in manual order after the live entries were reordered
 * (014 §8.1): they take the places live entries had, and the ones off the site
 * keep theirs. The same rule as `cms_entry_reorder`, so the list shown before
 * the server answers is the list the server then returns.
 */
export function reorderInPlace<T extends { id: string, status: string }>(items: readonly T[], ids: readonly string[]): T[] {
  const byId = new Map(items.map(item => [item.id, item]))
  const places = items.flatMap((item, index) => (item.status === 'archived' ? [] : [index]))
  const next = [...items]

  ids.forEach((id, nth) => {
    const item = byId.get(id)
    const place = places[nth]

    if (item && place !== undefined) {
      next[place] = item
    }
  })

  return next
}
