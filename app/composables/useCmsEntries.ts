import { cmsConfig } from '#cms/config'
import type { CmsEntryTypeKey } from '#cms/content'
import { cmsContentOrder } from '#cms/content-order'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useAsyncData } from '#imports'
import type { CmsEntriesQuery, CmsEntrySelectionValue } from '../types/entries'
import { createEntriesRepository } from '../data/repositories/entries.repository'
import { useCmsLocaleState } from '../primitives/locale'

export interface UseCmsEntriesOptions {
  /** Locale to read; defaults to `useCmsLocale()`. */
  locale?: MaybeRefOrGetter<string | null | undefined>
}

/**
 * Published entries of a type for a list or a section (014): a page of the
 * type (`{ limit, offset, sort }`; without `sort`, the order the type declares)
 * or chosen ids in their order (`{ ids }`),
 * with their media, in one request. Archived, unpublished, hidden-language and
 * missing entries are left out, whoever is signed in.
 *
 * Render the entries with <CmsEntries>: inside it, primitives showing entry
 * data stay read-only in Edit Mode of the page (014 §7).
 */
export function useCmsEntries(type: CmsEntryTypeKey, query: MaybeRefOrGetter<CmsEntriesQuery> = {}, options: UseCmsEntriesOptions = {}) {
  const repository = createEntriesRepository(undefined, { bootstrapLocale: cmsConfig.defaultLocale })
  const current = useCmsLocaleState()
  // Left out: the locale of the site. Null: the language of the original.
  const locale = computed(() => ('locale' in options ? toValue(options.locale) ?? null : current.value))
  // No `sort`: the order the type declares in cms.content.ts (014 §6).
  const asked = computed<CmsEntriesQuery>(() => {
    const value = toValue(query)
    return value.ids || value.sort ? value : { ...value, sort: cmsContentOrder[type] ?? 'newest' }
  })

  const result = useAsyncData(
    () => `cms:entries:${type}:${locale.value ?? ''}:${JSON.stringify(asked.value)}`,
    () => repository.listPublished(type, locale.value, asked.value),
  )

  const entries = computed(() => result.data.value?.entries ?? [])
  const total = computed(() => result.data.value?.total ?? 0)
  const ready: Promise<void> = Promise.resolve(result).then(() => undefined)

  return { entries, total, pending: result.pending, error: result.error, refresh: result.refresh, ready }
}

/**
 * The query of a section of entries from its stored value (014 §7): chosen ids
 * (Manual) or the newest of the type (Automatic). No value: the default from
 * code, `{ limit }`.
 *
 * The value is in the page's content: await the page (`useCmsPage(key).ready`)
 * before `useCmsEntries`, so the server reads the stored choice, not the default:
 *
 *   const { page, ready } = useCmsPage('home')
 *   await ready
 *   const { entries } = useCmsEntries('post', () => cmsEntrySelection(page.value?.content.blog?.posts, { limit: 3 }))
 */
export function cmsEntrySelection(value: CmsEntrySelectionValue | null | undefined, defaults: { limit: number }): CmsEntriesQuery {
  if (value?.mode === 'manual' && Array.isArray(value.ids)) {
    return { ids: value.ids.filter(id => typeof id === 'string') }
  }

  const limit = value?.mode === 'automatic' && typeof value.limit === 'number' && Number.isInteger(value.limit) && value.limit > 0
    ? value.limit
    : defaults.limit
  return { limit, sort: 'newest' }
}
