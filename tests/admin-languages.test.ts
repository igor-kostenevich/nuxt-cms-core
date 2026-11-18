import { describe, expect, it } from 'vitest'
import { isLocaleCode, languageInput, searchLanguages } from '../app/admin/languages'

describe('Settings → Languages catalog', () => {
  it('finds a language by its name start before names that only contain the text', () => {
    const codes = searchLanguages('ro', [], 'en').map(option => option.code)

    // Romanian starts with "ro"; Croatian only contains it.
    expect(codes[0]).toBe('ro')
    expect(codes).toContain('hr')
  })

  it('finds languages by name in the admin language and in the language itself', () => {
    expect(searchLanguages('нім', [], 'uk')[0]?.code).toBe('de')
    expect(searchLanguages('deutsch', [], 'en')[0]?.code).toBe('de')
  })

  it('still finds a language by its code, and leaves out the added ones', () => {
    expect(searchLanguages('pt-BR', [], 'en')[0]?.code).toBe('pt-BR')
    expect(searchLanguages('de', ['de'], 'en').map(option => option.code)).not.toContain('de')
  })

  it('offers a short list of widespread languages; others go by code', () => {
    expect(searchLanguages('', [], 'en').length).toBeLessThanOrEqual(40)
    expect(searchLanguages('pol', [], 'en')[0]?.code).toBe('pl')
  })

  it('stores English and native names, capitalized', () => {
    expect(languageInput('uk')).toEqual({ code: 'uk', name: 'Ukrainian', nativeName: 'Українська' })
    expect(isLocaleCode('en-GB')).toBe(true)
    expect(isLocaleCode('en_gb')).toBe(false)
  })
  it('does not take a name in the wrong language when the runtime lacks data for one', () => {
    const supported = Intl.DisplayNames.supportedLocalesOf
    // A runtime that knows no Albanian: it would answer in its own language.
    Intl.DisplayNames.supportedLocalesOf = ((locales: string[]) =>
      locales.filter(locale => locale !== 'sq')) as typeof supported

    try {
      expect(languageInput('sq').nativeName).toBe('Albanian')
    } finally {
      Intl.DisplayNames.supportedLocalesOf = supported
    }
  })
})
