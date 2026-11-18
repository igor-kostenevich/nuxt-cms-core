/**
 * Site texts (MASTER_PLAN C-85): texts that are not on any CMS page, such as
 * toasts, form messages, menu labels, the footer, the 404 page or <title>.
 * The Client Project declares them in `cms.texts.ts` with their text in the
 * default language; Settings-like editing per language lives in the admin
 * (Texts). The file ships in the client bundle like `cms.config.ts`, so it
 * holds plain values only (C-27).
 */

/** One text: the text itself, or with a hint for whoever edits or translates it. */
export type CmsTextDefinition = string | { text: string, context?: string }

export type CmsTextsInput = Record<string, CmsTextDefinition>

export interface CmsText {
  key: string
  /** Text from code, in the default language of the site. */
  text: string
  /** Where the text appears, for whoever translates it. */
  context?: string
}

/** Dotted segments of letters, digits, `_` and `-`: the field address format (C-48). */
const KEY_PATTERN = /^[\w-]+(?:\.[\w-]+)*$/
const MAX_KEY = 200
const MAX_TEXT = 2000

export function defineCmsTexts(texts: CmsTextsInput): CmsTextsInput {
  return texts
}

export interface CmsTextsResolution {
  texts: CmsText[]
  /** Entries left out, with the reason, for a build-time warning. */
  ignored: { key: string, reason: 'key' | 'text' }[]
}

/**
 * Checks `cms.texts.ts`. It is loaded without typechecking, so a wrong entry
 * is dropped with a warning instead of failing the build or shipping junk.
 */
export function resolveCmsTexts(input: unknown): CmsTextsResolution {
  const texts: CmsText[] = []
  const ignored: CmsTextsResolution['ignored'] = []

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { texts, ignored }
  }

  for (const [key, definition] of Object.entries(input)) {
    if (key.length > MAX_KEY || !KEY_PATTERN.test(key)) {
      ignored.push({ key, reason: 'key' })
      continue
    }

    const text = typeof definition === 'string' ? definition : (definition as { text?: unknown } | null)?.text
    const context = typeof definition === 'object' && definition !== null
      ? (definition as { context?: unknown }).context
      : undefined

    if (typeof text !== 'string' || text.length === 0 || text.length > MAX_TEXT) {
      ignored.push({ key, reason: 'text' })
      continue
    }

    texts.push(typeof context === 'string' && context ? { key, text, context: context.slice(0, MAX_TEXT) } : { key, text })
  }

  texts.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return { texts, ignored }
}
