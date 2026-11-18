import type { PageContents, RegisteredPage } from '../data/repositories/texts.repository'
import type { SiteTextRow as StoredSiteText } from '../data/repositories/site-texts.repository'
import { richTextParagraphs } from '../editor/plain-text'
import { getAt, isObject, splitPath, type DocumentNode } from '../primitives/paths'
import { isRichTextDoc } from '../primitives/rich-text'
import { isTranslatableIn, translationLeaf } from '../primitives/translation'

/** A text of a page on the Texts screen (C-86). */
export interface PageTextRow {
  id: string
  source: 'page'
  pageKey: string
  editPath: string | null
  address: string
  kind: string
  label: string | null
  /** Block of the page the text is in (its heading), for grouping. */
  section: string | null
  /** Element of the field, e.g. `h2`: a heading reads as "Heading". */
  tag: string | null
  /** Number of the collection item the text is in: "Heading · item 2". */
  item: number | null
  /** In the default language: stored, else the text from code. Plain text. */
  original: string
  /** In the shown language; empty when not translated. Plain text. */
  translation: string
  /**
   * The original only: what the draft (or Published) stores for the text,
   * empty when the page shows its text from code.
   */
  stored: string
  /**
   * The address goes through a list the original stores: its items have no
   * text from code, so an empty text stays empty instead of going back.
   */
  inStoredList: boolean
  /** The original only: a stored text that can go back to the text from code. */
  resettable: boolean
  /** Rich text is translated in Edit Mode, not in the table. */
  rich: boolean
  /**
   * False for an item the original deleted, and for an address the page no
   * longer holds a text at (an outdated or forged registry entry).
   */
  translatable: boolean
  /** Address the translation stores (`hero.cta.label`). */
  leaf: string
  missing: boolean
}

/** A site text (cms.texts.ts) on the Texts screen. */
export interface SiteTextRow {
  id: string
  source: 'text'
  key: string
  context?: string
  /** Text from cms.texts.ts. */
  codeText: string
  /** In the default language: stored, else from code. */
  original: string
  /** Stored value in the shown language; empty when there is none. */
  translation: string
  missing: boolean
}

export interface TextGroup {
  id: string
  kind: 'page' | 'texts'
  title: string
  subtitle?: string
  rows: (PageTextRow | SiteTextRow)[]
  missing: number
}

export interface CodeText {
  key: string
  text: string
  context?: string
}

function plain(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  return isRichTextDoc(value) ? richTextParagraphs(value) : ''
}

/**
 * The address goes through a list the document stores (a collection the
 * original saved): its items are content, not code defaults.
 */
export function throughStoredList(doc: DocumentNode | null, address: string): boolean {
  const segments = splitPath(address)

  for (let index = 1; index < segments.length; index++) {
    if (Array.isArray(getAt(doc, segments.slice(0, index).join('.')))) {
      return true
    }
  }

  return false
}

function contentOf(contents: PageContents[], key: string, locale: string): DocumentNode | null {
  const entry = contents.find(item => item.key === key && item.locale === locale)
  const content = entry?.draft ?? entry?.published ?? null
  return isObject(content) ? content : null
}

/**
 * Rows of the Texts screen: every registered page field and every site text,
 * with the default language as the original and the shown language as the
 * translation. In the default language, `translation` equals `original`.
 */
export function buildTextGroups(input: {
  pages: RegisteredPage[]
  contents: PageContents[]
  siteTexts: StoredSiteText[]
  codeTexts: CodeText[]
  defaultLocale: string
  locale: string
  textsTitle: (group: string) => string
}): TextGroup[] {
  const { pages, contents, siteTexts, codeTexts, defaultLocale, locale } = input
  const translating = locale !== defaultLocale
  const groups: TextGroup[] = []

  for (const page of pages) {
    const base = contentOf(contents, page.key, defaultLocale)
    const map = translating ? contentOf(contents, page.key, locale) ?? {} : null
    const rows: PageTextRow[] = []

    for (const field of page.fields) {
      const leaf = translationLeaf(field.kind, field.address)

      if (!leaf) {
        continue
      }

      const storedOriginal = getAt(base, leaf)
      const original = plain(storedOriginal) || field.defaultText || ''
      const translation = map ? plain(map[leaf]) : original
      // A text the server would refuse (an outdated or forged registry entry) is
      // read-only; rich text is changed in Edit Mode only.
      const textTarget = field.kind === 'richText' || isTextTarget(base, leaf, true)
      const translatable = textTarget && (!translating || isTranslatableIn(base, field.address))
      const stored = translating ? '' : plain(storedOriginal)
      const inStoredList = throughStoredList(base, leaf)

      rows.push({
        // The locale is in the id: what is typed and its save state belong to one language.
        id: `page:${locale}:${page.key}:${field.address}`,
        source: 'page',
        pageKey: page.key,
        editPath: page.editPath,
        address: field.address,
        kind: field.kind,
        label: field.label,
        section: field.section,
        tag: field.tag,
        item: field.item,
        original,
        translation,
        stored,
        inStoredList,
        resettable: !translating && storedOriginal !== undefined && !inStoredList,
        rich: field.kind === 'richText',
        translatable,
        leaf,
        missing: translating && translatable && original !== '' && !(map && Object.hasOwn(map, leaf)),
      })
    }

    groups.push({
      id: `page:${page.key}`,
      kind: 'page',
      title: page.key,
      subtitle: page.editPath ?? undefined,
      rows,
      missing: rows.filter(row => row.missing).length,
    })
  }

  const stored = (key: string, inLocale: string) =>
    siteTexts.find(item => item.key === key && item.locale === inLocale)?.value
  const textGroups = new Map<string, SiteTextRow[]>()

  for (const text of codeTexts) {
    const group = text.key.split('.')[0]!
    const original = stored(text.key, defaultLocale) ?? text.text
    const translation = translating ? stored(text.key, locale) ?? '' : original
    const row: SiteTextRow = {
      id: `text:${locale}:${text.key}`,
      source: 'text',
      key: text.key,
      context: text.context,
      codeText: text.text,
      original,
      translation,
      missing: translating && translation === '',
    }

    textGroups.set(group, [...(textGroups.get(group) ?? []), row])
  }

  for (const [group, rows] of textGroups) {
    groups.push({
      id: `texts:${group}`,
      kind: 'texts',
      title: input.textsTitle(group),
      rows,
      missing: rows.filter(row => row.missing).length,
    })
  }

  return groups
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => sameValue(item, b[index]))
  }

  if (isObject(a) && isObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    return [...keys].every(key => sameValue(a[key], b[key]))
  }

  return false
}

function itemIds(list: unknown[]): string[] | null {
  const ids = list.map(item => (isObject(item) && typeof item.id === 'string' ? item.id : null))
  return ids.every((id): id is string => id !== null) ? ids : null
}

/**
 * Addresses where two documents differ, as deep as both keep the same shape:
 * objects key by key, lists item by item when they hold the same ids in the
 * same order. A list that gained, lost or reordered items differs as a whole.
 */
function changedAddresses(a: unknown, b: unknown, prefix: string, out: string[]): void {
  if (sameValue(a, b)) {
    return
  }

  if ((isObject(a) || a === undefined) && (isObject(b) || b === undefined) && (isObject(a) || isObject(b))) {
    const left = isObject(a) ? a : {}
    const right = isObject(b) ? b : {}

    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      changedAddresses(left[key], right[key], prefix ? `${prefix}.${key}` : key, out)
    }

    return
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    const ids = itemIds(a)

    if (ids && sameValue(ids, itemIds(b))) {
      ids.forEach((id, index) => changedAddresses(a[index], b[index], `${prefix}.${id}`, out))
      return
    }
  }

  out.push(prefix)
}

/** What publishing a draft would change on a page, for the publish dialog. */
export interface DraftSummary {
  /** Texts the Texts screen can change (text, label, alt) that differ. */
  texts: number
  /** Anything else differs: images, links, order, items, rich text, switches. */
  other: boolean
}

/**
 * Compares the draft of a locale with its published version (C-89). A change
 * of a registered text leaf counts as a text; anything else — usually made in
 * Edit Mode — is "other", so the dialog does not publish it unnoticed. For
 * the original the documents are trees, for a translation flat objects of
 * leaves; both compare the same way.
 */
export function draftSummary(
  published: DocumentNode | null,
  draft: DocumentNode | null,
  fields: { address: string, kind: string }[],
  original: boolean,
): DraftSummary {
  const textLeaves = new Set(fields
    .filter(field => field.kind !== 'richText')
    .map(field => translationLeaf(field.kind, field.address))
    .filter((leaf): leaf is string => leaf !== null))
  const changed: string[] = []

  if (original) {
    changedAddresses(published ?? {}, draft ?? {}, '', changed)
  } else {
    const left = isObject(published) ? published : {}
    const right = isObject(draft) ? draft : {}

    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      if (!sameValue(left[key], right[key])) {
        changed.push(key)
      }
    }
  }

  // A text stays a text on both sides: the registry is written by the
  // client, so a forged or outdated entry cannot make a link, a media or a
  // switch count as one.
  const texts = changed.filter(address =>
    textLeaves.has(address)
    && isTextTarget(published, address, original)
    && isTextTarget(draft, address, original)).length

  return { texts, other: texts < changed.length }
}

// Non-text properties of primitive values (C-47, C-67): same list as
// cms_page_text_target in SQL, which refuses them on the Texts screen.
const NOT_TEXT_SEGMENTS = new Set(['id', 'href', 'newTab', 'mediaId', 'focal', 'decorative', 'hidden'])

/**
 * The leaf can hold a text in `doc`, by the same rules as
 * `cms_page_text_target`: not a non-text property, a string or nothing there,
 * and in a tree no ancestor that is a scalar or a rich text document. A
 * translation is a flat object of leaves.
 */
export function isTextTarget(doc: DocumentNode | null | undefined, address: string, tree: boolean): boolean {
  const segments = splitPath(address)

  if (segments.length === 0 || NOT_TEXT_SEGMENTS.has(segments[segments.length - 1]!)) {
    return false
  }

  if (!tree) {
    const value = isObject(doc) && Object.hasOwn(doc, address) ? doc[address] : undefined
    return value === undefined || value === null || typeof value === 'string'
  }

  for (let depth = 1; depth < segments.length; depth++) {
    const node = getAt(doc, segments.slice(0, depth).join('.'))

    if (node !== undefined && node !== null
      && (!(isObject(node) || Array.isArray(node)) || (isObject(node) && node.type === 'doc'))) {
      return false
    }
  }

  const value = getAt(doc, address)
  return value === undefined || value === null || typeof value === 'string'
}
