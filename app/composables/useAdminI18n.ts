import {
  ADMIN_DICTIONARIES,
  ADMIN_LOCALE_COOKIE,
  ADMIN_LOCALES,
  isAdminLocale,
  resolveAdminLocale,
  translate,
  type AdminLocale,
  type TranslateParams,
} from '../admin/i18n'

const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * Admin translations. Deliberately not vue-i18n / @nuxtjs/i18n: those register a
 * global plugin in the app entry, which would ship to the public site and merge
 * Core locales into the Client Project's own i18n setup (MASTER_PLAN C-25, C-36).
 *
 * Only admin components call this composable, so the dictionaries end up in
 * admin chunks only. Helpers live in app/admin/i18n.ts so they are not auto-imported.
 */
export function useAdminI18n() {
  const cookie = useCookie<string | null>(ADMIN_LOCALE_COOKIE, {
    default: () => null,
    maxAge: LOCALE_COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'lax',
  })

  // Resolved once per request on the server and carried to the client in the
  // payload, so a first visit without the cookie hydrates in the same language.
  const locale = useState<AdminLocale>('cms-admin-locale', () => {
    return resolveAdminLocale(cookie.value, requestAcceptLanguage())
  })

  function t(key: string, params?: TranslateParams): string {
    return translate(ADMIN_DICTIONARIES, locale.value, key, params)
  }

  function setLocale(code: string) {
    if (!isAdminLocale(code)) {
      return
    }

    locale.value = code
    cookie.value = code
  }

  return { t, locale, locales: ADMIN_LOCALES, setLocale }
}

function requestAcceptLanguage(): string | undefined {
  if (import.meta.server) {
    return useRequestHeaders(['accept-language'])['accept-language']
  }

  return navigator.languages.join(',')
}
