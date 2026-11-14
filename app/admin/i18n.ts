import en from './locales/en.json'
import uk from './locales/uk.json'

/**
 * Admin translation data and pure helpers behind useAdminI18n().
 *
 * Kept out of app/composables on purpose: every export there becomes a global
 * auto-import in the Client Project, and generic names such as `translate`
 * must not leak into the site's namespace (MASTER_PLAN C-25, C-36).
 */

export const ADMIN_LOCALES = [
  { code: 'en', name: 'English' },
  { code: 'uk', name: 'Українська' },
] as const

export type AdminLocale = (typeof ADMIN_LOCALES)[number]['code']

export const ADMIN_DEFAULT_LOCALE: AdminLocale = 'en'
export const ADMIN_LOCALE_COOKIE = 'cms_locale'

export interface AdminMessages {
  [key: string]: string | AdminMessages
}

export type AdminDictionaries = Record<AdminLocale, AdminMessages>

export type TranslateParams = Record<string, string | number>

export const ADMIN_DICTIONARIES: AdminDictionaries = { en, uk }

/**
 * Looks up a dotted key in the locale, then in the default locale, then returns
 * the key itself. `{name}` placeholders are replaced from `params`.
 */
export function translate(
  dictionaries: AdminDictionaries,
  locale: AdminLocale,
  key: string,
  params?: TranslateParams,
): string {
  const message = lookup(dictionaries[locale], key) ?? lookup(dictionaries[ADMIN_DEFAULT_LOCALE], key)

  if (message === undefined) {
    return key
  }

  if (!params) {
    return message
  }

  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    return Object.hasOwn(params, name) ? String(params[name]) : placeholder
  })
}

/** Cookie first, then the best supported `Accept-Language` entry, then the default. */
export function resolveAdminLocale(
  cookie: string | null | undefined,
  acceptLanguage: string | null | undefined,
): AdminLocale {
  if (isAdminLocale(cookie)) {
    return cookie
  }

  const preferred = (acceptLanguage ?? '')
    .split(',')
    .map((entry, index) => {
      const [tag = '', ...options] = entry.trim().split(';')
      const quality = options.find((option) => option.trim().startsWith('q='))
      const weight = quality ? Number.parseFloat(quality.trim().slice(2)) : 1

      return {
        language: tag.split('-')[0]?.toLowerCase() ?? '',
        weight: Number.isNaN(weight) ? 0 : weight,
        index,
      }
    })
    .filter((item) => item.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .find((item) => isAdminLocale(item.language))

  return isAdminLocale(preferred?.language) ? preferred.language : ADMIN_DEFAULT_LOCALE
}

export function isAdminLocale(value: unknown): value is AdminLocale {
  return ADMIN_LOCALES.some((item) => item.code === value)
}

function lookup(messages: AdminMessages | undefined, key: string): string | undefined {
  let node: string | AdminMessages | undefined = messages

  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string' || !Object.hasOwn(node, part)) {
      return undefined
    }

    node = node[part]
  }

  return typeof node === 'string' ? node : undefined
}
