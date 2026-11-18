import type { CmsPage } from 'nuxt-cms-core/types'

/**
 * Routing of the playground site: `prefix_except_default`. The default
 * language (English) lives at `/about`, the others at `/uk/about`. This is Client
 * Project code: Core only gives the data (languages, locale, page locales).
 */
export function localePath(href: string, locale: string | null): string {
  if (!locale || !href.startsWith('/') || href.startsWith('//')) {
    return href
  }

  if (href === '/') {
    return `/${locale}`
  }

  // `/#contact` → `/en#contact`
  return href.startsWith('/#') ? `/${locale}${href.slice(1)}` : `/${locale}${href}`
}

/** The site path of the current locale; null locale is the default one. */
export function useLocalePath() {
  const locale = useCmsLocale()
  return (href: string) => localePath(href, locale.value)
}

/**
 * `<html lang>`, canonical and hreflang alternates of a CMS page, from
 * `page.locales` (the active languages it is published in).
 */
export function useLocaleHead(page: { readonly value: CmsPage | null | undefined }, path: string) {
  const url = useRequestURL()
  const { defaultLocale } = useCmsLanguages()

  function href(locale: string) {
    return url.origin + localePath(path, locale === defaultLocale.value ? null : locale)
  }

  useHead({
    htmlAttrs: { lang: computed(() => page.value?.locale) },
    link: computed(() => {
      const current = page.value

      return current
        ? [
            { rel: 'canonical' as const, href: href(current.locale) },
            ...current.locales.map(locale => ({ rel: 'alternate' as const, hreflang: locale, href: href(locale) })),
            { rel: 'alternate' as const, hreflang: 'x-default', href: href(current.defaultLocale) },
          ]
        : []
    }),
    // Not translated: the page shows the default language's content.
    meta: computed(() => page.value && !page.value.translated ? [{ name: 'robots', content: 'noindex' }] : []),
  })
}
