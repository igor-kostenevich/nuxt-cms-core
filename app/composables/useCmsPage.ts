import { cmsConfig } from '#cms/config'
import { computed, getCurrentInstance, provide, toValue, type MaybeRefOrGetter } from 'vue'
import { useAsyncData } from '#imports'
import { CMS_EDITOR, injectCmsEditor } from '../editor/context'
import { createPagesRepository } from '../data/repositories/pages.repository'
import { useCmsLocaleState } from '../primitives/locale'
import { provideCmsMedia } from '../primitives/media'

export interface UseCmsPageOptions {
  /** Locale to read; defaults to `useCmsLocale()`. Null: the default locale. */
  locale?: MaybeRefOrGetter<string | null | undefined>
}

/**
 * Published content of a code-defined page in the current locale.
 *
 * `page` is null while the page has no published content: render the
 * template's own defaults in that case. The locale is `useCmsLocale()`, which
 * the Client Project sets from its routing; the read follows it when it
 * changes. A locale without its own translation shows the default locale's
 * content (`page.translated` is false), field by field for a partial
 * translation (MASTER_PLAN C-78). `page.locales` lists the locales the page
 * is published in, for hreflang. Await `ready` when the page needs the value
 * before it renders. Images in the content resolve through the media the read
 * returned: pass the stored value to `CmsImage` / `CmsBackground` as `:value`.
 *
 * In Edit Mode the same call returns the edited document (Draft ?? Published)
 * from the Editor Engine, so the page code is identical in both modes
 * (MASTER_PLAN C-22).
 */
export function useCmsPage(key: string, options: UseCmsPageOptions = {}) {
  const editor = injectCmsEditor()

  const binding = editor?.bindPage(key)

  if (binding) {
    return binding
  }

  // Not the edited entity (a second key in Edit Mode): its fields must not
  // write into the edited document, so they render as on the public site.
  if (editor && getCurrentInstance()) {
    provide(CMS_EDITOR, null)
  }

  const repository = createPagesRepository(undefined, { bootstrapLocale: cmsConfig.defaultLocale })
  const current = useCmsLocaleState()
  const locale = computed(() => toValue(options.locale) ?? current.value)
  const query = useAsyncData(
    () => `cms:page:${key}:${locale.value ?? ''}`,
    () => repository.getByKey(key, locale.value),
  )
  const { data: page, pending, error, refresh } = query
  // Primitives below this component resolve image ids against this map (C-76).
  provideCmsMedia(() => page.value?.media)
  const ready: Promise<void> = Promise.resolve(query).then(() => undefined)

  return { page, pending, error, refresh, ready }
}
