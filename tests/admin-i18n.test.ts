import { describe, expect, it } from 'vitest'
import {
  resolveAdminLocale,
  translate,
  type AdminDictionaries,
} from '../app/admin/i18n'
import en from '../app/admin/locales/en.json'
import uk from '../app/admin/locales/uk.json'

const dictionaries: AdminDictionaries = {
  en: {
    cms: {
      login: { title: 'CMS login', placeholder: 'name@company.com' },
      home: { signedIn: 'Signed in as {email} ({role})' },
      onlyEnglish: 'Fallback',
    },
  },
  uk: {
    cms: {
      login: { title: 'Вхід у CMS' },
    },
  },
}

describe('translate', () => {
  it('reads a nested key in the requested locale', () => {
    expect(translate(dictionaries, 'uk', 'cms.login.title')).toBe('Вхід у CMS')
  })

  it('replaces placeholders and leaves unknown ones as they are', () => {
    expect(translate(dictionaries, 'en', 'cms.home.signedIn', { email: 'ada@example.com' }))
      .toBe('Signed in as ada@example.com ({role})')
  })

  it('keeps @ literally', () => {
    expect(translate(dictionaries, 'en', 'cms.login.placeholder')).toBe('name@company.com')
  })

  it('falls back to the default locale, then to the key', () => {
    expect(translate(dictionaries, 'uk', 'cms.onlyEnglish')).toBe('Fallback')
    expect(translate(dictionaries, 'uk', 'cms.missing.key')).toBe('cms.missing.key')
  })

  it('does not return a group as a message', () => {
    expect(translate(dictionaries, 'en', 'cms.login')).toBe('cms.login')
  })

  it('ignores inherited properties in keys and params', () => {
    expect(translate(dictionaries, 'en', 'cms.login.constructor.name')).toBe('cms.login.constructor.name')
    expect(translate(dictionaries, 'en', 'cms.home.signedIn', { email: 'a' }))
      .toBe('Signed in as a ({role})')
    expect(translate({ en: { m: 'x {constructor}' }, uk: {} }, 'en', 'm', {})).toBe('x {constructor}')
  })
})

describe('resolveAdminLocale', () => {
  it('prefers a supported cookie', () => {
    expect(resolveAdminLocale('uk', 'en-US,en;q=0.9')).toBe('uk')
  })

  it('ignores an unsupported cookie and uses Accept-Language', () => {
    expect(resolveAdminLocale('de', 'uk-UA,uk;q=0.9,en;q=0.8')).toBe('uk')
  })

  it('picks the highest-weighted supported language', () => {
    expect(resolveAdminLocale(null, 'de;q=1,en;q=0.5,uk;q=0.8')).toBe('uk')
  })

  it('falls back to English', () => {
    expect(resolveAdminLocale(undefined, undefined)).toBe('en')
    expect(resolveAdminLocale(null, 'de-DE,fr;q=0.9')).toBe('en')
  })
})

describe('admin dictionaries', () => {
  it('have the same keys in every locale', () => {
    expect(keys(uk)).toEqual(keys(en))
  })
})

function keys(node: object, prefix = ''): string[] {
  return Object.entries(node)
    .flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key
      return typeof value === 'object' && value !== null ? keys(value, path) : [path]
    })
    .sort()
}
