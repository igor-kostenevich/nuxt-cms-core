import { localePath } from '../composables/useSiteLocale'

// Content stores language-neutral site paths (`/about`); this site prefixes
// every language but the default one (C-79).
export default defineNuxtPlugin(() => {
  provideCmsLinkResolver((href, locale) => localePath(href, locale))
})
