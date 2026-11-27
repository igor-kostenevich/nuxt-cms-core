import type { CmsEntryState } from '../types/entries'

/**
 * Why the site leaves a chosen entry out of a section (`hidden`), or shows it
 * differently (`untranslated`: the original in place of a translation). Null:
 * shown as it is. The public reads apply the same rules (014 §6).
 */
export type EntryChoiceProblem = 'missing' | 'archived' | 'unpublished' | 'untranslated'

export function entryChoiceProblem(
  state: CmsEntryState | undefined,
  options: { type: string, defaultLocale: string | null, locale: string | null },
): EntryChoiceProblem | null {
  if (!state || state.type !== options.type) {
    return 'missing'
  }

  if (state.archived) {
    return 'archived'
  }

  if (!options.defaultLocale || !state.publishedLocales.includes(options.defaultLocale)) {
    return 'unpublished'
  }

  if (options.locale && options.locale !== options.defaultLocale && !state.publishedLocales.includes(options.locale)) {
    return 'untranslated'
  }

  return null
}

/** The ids with one moved by a step; unchanged at either end. */
export function moveEntryId(ids: readonly string[], id: string, by: -1 | 1): string[] {
  const next = [...ids]
  const at = next.indexOf(id)

  if (at < 0 || at + by < 0 || at + by >= next.length) {
    return next
  }

  next.splice(at, 1)
  next.splice(at + by, 0, id)
  return next
}
