import { isCmsFieldKey } from './field-key'
import { canSetAt, cloneDocument, getAt, isObject, setAt, splitPath, type DocumentNode } from './paths'

/**
 * Page translations (MASTER_PLAN C-78).
 *
 * The document of the default locale is the base: the full tree with the
 * structure, the language-independent values (media, hrefs, switches) and the
 * texts of that language. The document of any other locale is a translation:
 * a flat object of the translated leaves, keyed by field address (C-48):
 *
 *   { "hero.title": "…", "about.body": { type: "doc", … },
 *     "hero.cta.label": "…", "about.image.alt": "…" }
 *
 * A locale is read as the base with its translation applied. A leaf that is
 * not translated keeps the value of the default locale: that is the fallback.
 *
 * A leaf is written with the same rules as `cms_content_set` in SQL, which
 * the Texts screen writes the original with (`cms_page_set_texts`, 010d);
 * keep them identical (tests/fixtures/translation.json).
 */
export type CmsTranslation = Record<string, unknown>

// A stored translation is untrusted input. Prototype keys are valid segments
// by the field key pattern, so they are refused here explicitly.
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor'])

/** The key is a field address that a translation may write. */
export function isTranslationAddress(address: string): boolean {
  return isCmsFieldKey(address) && !splitPath(address).some(segment => FORBIDDEN_SEGMENTS.has(segment))
}

// Properties of primitive values that are structure or behaviour, never a
// text (C-67, C-74): ids, hrefs, the new-tab switch, media and its settings,
// the optional switch.
const NON_TEXT_LEAVES = new Set(['id', 'href', 'newTab', 'mediaId', 'focal', 'decorative', 'hidden'])

function isRichTextDocument(value: unknown): boolean {
  return isObject(value) && value.type === 'doc'
}

/**
 * Whether a translation may hold `value` at `address` of the base (C-78): a
 * translation changes texts only. The leaf replaces a text with a text, a
 * rich text document with a document, or what the base does not store yet,
 * and never a property of a primitive value, an object, a list or a switch;
 * no stored ancestor is a scalar or a rich text document. `null` clears a
 * translated text.
 *
 * An address the base does not store shows its value from code: Core has no
 * schema of the page (C-01), so it is accepted by name, and a primitive that
 * receives a value of the wrong type renders its default.
 *
 * The same rule as `cms_page_text_fits` in SQL, which refuses a save that
 * breaks it (fixture tests/fixtures/translation-fits.json). Here it guards
 * the read of stored translations: a leaf the base changed under is skipped.
 */
export function translationFits(base: DocumentNode | null | undefined, address: string, value: unknown): boolean {
  const segments = splitPath(address)
  const last = segments.at(-1)

  if (!last || NON_TEXT_LEAVES.has(last)) {
    return false
  }

  const root = isObject(base) ? base : {}

  for (let depth = 1; depth < segments.length; depth++) {
    const ancestor = getAt(root, segments.slice(0, depth).join('.'))

    if (ancestor !== undefined && ((!isObject(ancestor) && !Array.isArray(ancestor)) || isRichTextDocument(ancestor))) {
      return false
    }
  }

  const node = getAt(root, address)

  if (node === undefined || node === null) {
    return true
  }

  if (typeof value === 'string') {
    return typeof node === 'string'
  }

  if (value === null) {
    return typeof node === 'string' || isRichTextDocument(node)
  }

  return isRichTextDocument(value) && isRichTextDocument(node)
}

/** Addresses in write order: a shorter address first, so a parent never overwrites a child. */
function addressesOf(translation: CmsTranslation): string[] {
  return Object.keys(translation)
    .filter(isTranslationAddress)
    .sort((a, b) => splitPath(a).length - splitPath(b).length || (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * The base with the translation applied, as a new document. A leaf is written
 * only where the address resolves: missing objects are created, but a
 * collection item is never created, so a leaf of a deleted item is skipped.
 * A leaf that does not fit the base (`translationFits`) is skipped too.
 */
export function applyTranslation(
  base: DocumentNode | null | undefined,
  translation: CmsTranslation | null | undefined,
): DocumentNode {
  const document = cloneDocument(isObject(base) ? base : {})

  if (!isObject(translation)) {
    return document
  }

  for (const address of addressesOf(translation)) {
    const value = translation[address]

    if (value !== undefined && value !== null && translationFits(base, address, value)) {
      setAt(document, address, cloneDocument(value))
    }
  }

  return document
}

/**
 * The translation without leaves the base cannot hold any more: an item that
 * was deleted in the default locale, an address through a non-object, a leaf
 * that no longer fits (the field changed its type). Saved translations stay
 * small, and what is stored is what is shown.
 */
export function pruneTranslation(
  base: DocumentNode | null | undefined,
  translation: CmsTranslation,
): CmsTranslation {
  const result: CmsTranslation = {}

  for (const address of addressesOf(translation)) {
    const value = translation[address]

    if (value === undefined || value === null) {
      continue
    }

    if (canSetAt(isObject(base) ? base : {}, address) && translationFits(base, address, value)) {
      result[address] = cloneDocument(value)
    }
  }

  return result
}

/**
 * The address a translation stores for a field (C-78): the field itself for a
 * text or rich text, its label for a link or button, its alt for an image.
 * Null for structure (collections, switches), which is not translated.
 */
export function translationLeaf(kind: string, address: string): string | null {
  switch (kind) {
    case 'text':
    case 'richText':
      return address
    case 'link':
    case 'button':
      return `${address}.label`
    case 'image':
    case 'background':
      return `${address}.alt`
    default:
      return null
  }
}

/**
 * The address can take a translation: the base holds its path. A collection
 * the base does not hold yet is translated by the ids of its code defaults
 * (C-88); a stored list without the item refuses it (the item was deleted).
 */
export function isTranslatableIn(base: DocumentNode | null | undefined, address: string): boolean {
  return canSetAt(isObject(base) ? base : {}, address)
}
