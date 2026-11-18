import { cmsConfig } from '#cms/config'
import { cmsTexts } from '#cms/texts'
import { useAsyncData } from '#imports'
import { createSiteTextsRepository } from '../data/repositories/site-texts.repository'
import { useCmsLocaleState } from '../primitives/locale'

const codeTexts = new Map(cmsTexts.map(text => [text.key, text.text]))
const warned = new Set<string>()

/**
 * Site texts (MASTER_PLAN C-85): texts that are not on any CMS page, such as
 * toasts, form messages, menu labels, the footer or <title>. Declare them in
 * `cms.texts.ts` with their text in the default language; owners and admins
 * change and translate them in the admin (Texts) without a deploy.
 *
 * `t('form.sent')` returns the text in the current locale (`useCmsLocale()`),
 * else in the default language, else the text from `cms.texts.ts`. `{name}`
 * placeholders are filled from `params`. The stored values of a locale come
 * in one request, shared by every caller on the page.
 */
export function useCmsText() {
  const locale = useCmsLocaleState()
  const repository = createSiteTextsRepository(undefined, { bootstrapLocale: cmsConfig.defaultLocale })
  const query = useAsyncData(
    () => `cms:site-texts:${locale.value ?? ''}`,
    () => repository.getForLocale(locale.value),
    { default: () => ({}) as Record<string, string> },
  )

  function t(key: string, params?: Record<string, string | number>): string {
    const value = query.data.value?.[key] ?? codeTexts.get(key)

    if (value === undefined) {
      if (import.meta.dev && !warned.has(key)) {
        warned.add(key)
        console.warn(`[nuxt-cms-core] useCmsText: "${key}" is not declared in cms.texts.ts.`)
      }

      return key
    }

    return params
      ? value.replace(/\{(\w+)\}/g, (match, name: string) => (Object.hasOwn(params, name) ? String(params[name]) : match))
      : value
  }

  const ready: Promise<void> = Promise.resolve(query).then(() => undefined)

  return { t, ready }
}
