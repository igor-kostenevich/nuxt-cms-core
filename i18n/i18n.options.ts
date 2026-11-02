import type { ModuleOptions } from '@nuxtjs/i18n'

/**
 * Build-time options for @nuxtjs/i18n.
 * Vue I18n runtime options live in `i18n.config.ts` (`defineI18nConfig`).
 * `langDir` is relative to this `i18n` directory.
 */
const i18n = {
  defaultLocale: 'en',
  strategy: 'no_prefix',
  langDir: 'lang',
  locales: [
    { code: 'en', language: 'en', name: 'English', file: 'en.json' },
    { code: 'uk', language: 'uk', name: 'Українська', file: 'uk.json' },
  ],
  detectBrowserLanguage: {
    useCookie: true,
    cookieKey: 'cms_locale',
    redirectOn: 'no prefix',
  },
} satisfies ModuleOptions

export default i18n
