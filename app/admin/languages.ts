import { CMS_LOCALE_PATTERN } from '../../src/config'
import type { CmsLanguageInput } from '../types/languages'

/**
 * Languages offered in Settings → Languages: the widespread ones a site of
 * this kind is likely to need. Any other language is still added by typing
 * its code ("Use code …"). Codes in canonical BCP 47 casing (C-44); the names
 * come from Intl.DisplayNames, so the list is codes only.
 */
export const LANGUAGE_CATALOG: readonly string[] = [
  // Europe
  'en', 'uk', 'pl', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'cs', 'sk', 'ro', 'hu', 'bg', 'hr', 'sl',
  'lt', 'lv', 'et', 'fi', 'sv', 'da', 'nb', 'el',
  // Wider world
  'tr', 'ka', 'he', 'ar', 'pt-BR', 'zh-Hans', 'ja', 'ko',
]

/** The code is in the canonical format the database accepts (C-44). */
export function isLocaleCode(code: string): boolean {
  return CMS_LOCALE_PATTERN.test(code)
}

/** First letter up: Intl gives "українська", a list shows "Українська". */
function capitalize(text: string, locale: string): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1)
}

/**
 * Name of a language in another language, or null when the runtime does not
 * know it. A runtime without data for `inLocale` silently answers in its own
 * UI language ("Албанська" for Albanian in Albanian), so that case is null too.
 */
export function displayName(code: string, inLocale: string): string | null {
  try {
    if (Intl.DisplayNames.supportedLocalesOf([inLocale]).length === 0) {
      return null
    }

    const name = new Intl.DisplayNames([inLocale], { type: 'language', fallback: 'none' }).of(code)
    return name && name !== code ? capitalize(name, inLocale) : null
  } catch {
    return null
  }
}

/** What is stored for a new language: English and native names, the code when unknown. */
export function languageInput(code: string): CmsLanguageInput {
  return {
    code,
    name: displayName(code, 'en') ?? code,
    // Without data for the language itself, its English name beats a bare code.
    nativeName: displayName(code, code) ?? displayName(code, 'en') ?? code,
  }
}

export interface LanguageOption {
  code: string
  /** Name in the language of the admin UI. */
  label: string
  /** Name in the language itself. */
  native: string
}

/**
 * How well an option matches: the start of a name or the exact code first,
 * then the start of a word, then anywhere. "ru" finds Russian before
 * Belarusian, which only contains it.
 */
function rank(option: LanguageOption, needle: string): number {
  const names = [option.label, option.native].map(name => name.toLocaleLowerCase())

  if (option.code.toLowerCase() === needle || names.some(name => name.startsWith(needle))) {
    return 0
  }

  if (option.code.toLowerCase().startsWith(needle) || names.some(name => name.split(/[\s(-]+/).some(word => word.startsWith(needle)))) {
    return 1
  }

  return names.some(name => name.includes(needle)) ? 2 : -1
}

/**
 * Catalog entries matching `query` by name (in the admin language or the
 * language itself) or code, best matches first, without the codes already added.
 */
export function searchLanguages(query: string, taken: Iterable<string>, adminLocale: string): LanguageOption[] {
  const used = new Set(taken)
  const needle = query.trim().toLocaleLowerCase()

  return LANGUAGE_CATALOG
    .filter(code => !used.has(code))
    .map((code) => {
      const option = {
        code,
        label: displayName(code, adminLocale) ?? code,
        native: languageInput(code).nativeName,
      }

      return { option, score: needle ? rank(option, needle) : 0 }
    })
    .filter(({ score }) => score >= 0)
    .sort((a, b) => a.score - b.score || a.option.label.localeCompare(b.option.label, adminLocale))
    .map(({ option }) => option)
}
