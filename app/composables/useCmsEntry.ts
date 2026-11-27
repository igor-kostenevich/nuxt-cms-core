import { cmsConfig } from '#cms/config'
import type { CmsEntryTypeKey } from '#cms/content'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useAsyncData } from '#imports'
import { injectCmsEditor } from '../editor/context'
import { createEntriesRepository } from '../data/repositories/entries.repository'
import { useCmsLocaleState } from '../primitives/locale'
import { provideCmsMedia } from '../primitives/media'

export interface UseCmsEntryOptions {
  /** The address of the entry in the language read: the `[slug]` of the route. */
  slug: MaybeRefOrGetter<string | null | undefined>
  /** Locale to read; defaults to `useCmsLocale()`. Null: the language of the original. */
  locale?: MaybeRefOrGetter<string | null | undefined>
}

/**
 * One published entry of a type by its address (014): the original with the
 * translation of the locale applied, and its media for the primitives of the
 * page. `entry` is null when there is no such public entry: the page decides
 * the 404. Archived, unpublished and hidden-language entries never come back,
 * whoever is signed in. Server-rendered once; the browser reuses the payload.
 *
 * In Edit Mode opened for this entry (`?entry=`), the entry comes from the
 * editor, whatever the slug: its draft, edited in place. Any other entry is
 * read like the public site (its fields stay read-only there, 014 §7).
 */
export function useCmsEntry(type: CmsEntryTypeKey, options: UseCmsEntryOptions) {
  const binding = injectCmsEditor()?.bindEntry(type)

  if (binding) {
    return binding
  }

  const repository = createEntriesRepository(undefined, { bootstrapLocale: cmsConfig.defaultLocale })
  const current = useCmsLocaleState()
  // Left out: the locale of the site. Null: the language of the original.
  const locale = computed(() => ('locale' in options ? toValue(options.locale) ?? null : current.value))
  const slug = computed(() => toValue(options.slug) ?? '')

  const query = useAsyncData(
    () => `cms:entry:${type}:${slug.value}:${locale.value ?? ''}`,
    () => (slug.value ? repository.getPublished(type, slug.value, locale.value) : Promise.resolve(null)),
  )

  const { data: entry, pending, error, refresh } = query
  provideCmsMedia(() => entry.value?.media)
  const ready: Promise<void> = Promise.resolve(query).then(() => undefined)

  return { entry, pending, error, refresh, ready }
}
