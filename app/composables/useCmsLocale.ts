import { setCmsLinkResolver, useCmsLocaleState, type CmsLinkResolver } from '../primitives/locale'

/**
 * Locale of the content on the current page, as a writable ref. Null means
 * the default locale of the site.
 *
 * The Client Project owns the routing of a multilingual site (`/en/about`,
 * a domain, a cookie): it sets this ref, e.g. in route middleware, and
 * `useCmsPage` / `useSiteSettings` read in that locale. In Edit Mode the
 * editor sets it to the locale being edited, so read the locale of your own
 * UI from here rather than from the route.
 */
export function useCmsLocale() {
  return useCmsLocaleState()
}

/**
 * Registers how a stored site path becomes the URL of the current locale,
 * e.g. `(href, locale) => locale ? `/${locale}${href}` : href`. Content stores
 * language-neutral paths (`/about`); `CmsLink`, `CmsButton` and links in rich
 * text pass them through the resolver. Without one, hrefs render as stored.
 * Call it in a Nuxt plugin of the Client Project.
 */
export function provideCmsLinkResolver(resolver: CmsLinkResolver | null) {
  setCmsLinkResolver(resolver)
}
