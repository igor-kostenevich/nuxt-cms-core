import { cmsConfig } from '#cms/config'
import { getCurrentInstance, provide } from 'vue'
import { useAsyncData } from '#imports'
import { CMS_EDITOR, injectCmsEditor } from '../editor/context'
import { createPagesRepository } from '../data/repositories/pages.repository'

/**
 * Published content of a code-defined page.
 *
 * `page` is null while the page has no published content: render the
 * template's own defaults in that case. The locale comes from
 * `cms.config.ts` until localization (010) makes it a per-request value.
 * Await `ready` when the page needs the value before it renders.
 *
 * In Edit Mode the same call returns the edited document (Draft ?? Published)
 * from the Editor Engine, so the page code is identical in both modes
 * (MASTER_PLAN C-22).
 */
export function useCmsPage(key: string) {
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

  const repository = createPagesRepository()
  const locale = cmsConfig.defaultLocale
  const query = useAsyncData(`cms:page:${key}:${locale}`, () => repository.getByKey(key, locale))
  const { data: page, pending, error, refresh } = query
  const ready: Promise<void> = Promise.resolve(query).then(() => undefined)

  return { page, pending, error, refresh, ready }
}
