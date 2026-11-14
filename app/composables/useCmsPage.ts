import { cmsConfig } from '#cms/config'
import { useAsyncData } from '#imports'
import { createPagesRepository } from '../data/repositories/pages.repository'

/**
 * Published content of a code-defined page.
 *
 * `page` is null while the page has no published content: render the
 * template's own defaults in that case. The locale comes from
 * `cms.config.ts` until localization (010) makes it a per-request value.
 * Await `ready` when the page needs the value before it renders.
 */
export function useCmsPage(key: string) {
  const repository = createPagesRepository()
  const locale = cmsConfig.defaultLocale
  const query = useAsyncData(`cms:page:${key}:${locale}`, () => repository.getByKey(key, locale))
  const { data: page, pending, error, refresh } = query
  const ready: Promise<void> = Promise.resolve(query).then(() => undefined)

  return { page, pending, error, refresh, ready }
}
