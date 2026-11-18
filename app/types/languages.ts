/**
 * A language of the site content (MASTER_PLAN C-15). Languages live in the
 * database: adding one needs no deploy. A hidden language is being
 * translated; deleting one deletes its translations; exactly one is the default, and it is always active.
 */
export interface CmsLanguage {
  /** Canonical BCP 47 code: `uk`, `en-GB`, `zh-Hant`. */
  code: string
  /** English name, e.g. `Ukrainian`. */
  name: string
  /** Name in the language itself, e.g. `Українська`. */
  nativeName: string
  active: boolean
  isDefault: boolean
}

/** Input of Settings → Languages when adding a language. */
export interface CmsLanguageInput {
  code: string
  name: string
  nativeName: string
}
