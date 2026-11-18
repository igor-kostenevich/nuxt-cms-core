import { useNuxtApp, useState } from '#imports'
import type { Ref } from 'vue'

/**
 * Locale of the content the page shows, shared by the CMS reads and the
 * primitives. Null means the default locale of the site. The Client Project
 * sets it from its routing (`useCmsLocale()`); Edit Mode sets it to the
 * locale being edited. Core never derives it from the URL (C-79).
 */
export const CMS_LOCALE_STATE = 'cms-locale'

export function useCmsLocaleState(): Ref<string | null> {
  return useState<string | null>(CMS_LOCALE_STATE, () => null)
}

/**
 * Maps a stored, language-neutral site path (`/about`) to the URL of a
 * locale (`/en/about`). `locale` is null for the default locale.
 */
export type CmsLinkResolver = (href: string, locale: string | null) => string

// One resolver per Nuxt app instance: on the server that is one per request.
const resolvers = new WeakMap<object, CmsLinkResolver>()

export function setCmsLinkResolver(resolver: CmsLinkResolver | null): void {
  const nuxtApp = useNuxtApp()

  if (resolver) {
    resolvers.set(nuxtApp, resolver)
  } else {
    resolvers.delete(nuxtApp)
  }
}

/**
 * For primitives: the current locale's link mapping, or undefined when the
 * Client registered no resolver (stored hrefs render as they are). Call in setup.
 */
export function useCmsLinkLocalizer(): ((href: string) => string) | undefined {
  const nuxtApp = useNuxtApp()
  const locale = useCmsLocaleState()
  const resolver = resolvers.get(nuxtApp)

  return resolver ? href => resolver(href, locale.value) : undefined
}
