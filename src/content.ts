/**
 * Content of the site (MASTER_PLAN 014): static pages and types of standalone
 * entries. The Client Project declares them in `cms.content.ts`; Core knows no
 * type by name. The serialized part (labels, routes, order, the fields of
 * the admin form) ships to the admin only.
 */

import { resolveContentFields, type CmsContentField, type CmsContentFieldProblem } from './content-fields'

export type CmsContentLabel = string | Record<string, string>

export interface CmsContentPageInput {
  label: CmsContentLabel
  /** Path without a language prefix, e.g. `/careers`. */
  path: string
}

export interface CmsContentTypeInput {
  label: CmsContentLabel
  /** Texts that name this type in the admin; Core's defaults otherwise. */
  text?: CmsContentTypeText
  /** Public route with one `[slug]` (Pages section, Edit Mode), e.g. `/blog/[slug]`. */
  route?: string
  /**
   * The admin form of a Content type: its fields in order, rendered by Core
   * with the admin's own controls (C-103). Required for a Content type.
   */
  fields?: Record<string, CmsContentField>
  order?: CmsContentOrder
}

/**
 * Texts of the admin that name a type's entries, written whole by the Client
 * (no word is glued in by Core: grammar differs by language). Only these:
 * the actions of Core (Save, Publish, Archive…) keep Core's words.
 */
export interface CmsContentTypeText {
  /** The create button, e.g. `{ en: 'Add vacancy', uk: 'Додати вакансію' }`. */
  newButton?: CmsContentLabel
  /** Title of the dialog of a new entry, e.g. `'New vacancy'`. */
  newTitle?: CmsContentLabel
  /** Title of the dialog of an entry; `{title}` is its title, e.g. `'Edit vacancy — {title}'`. */
  editTitle?: CmsContentLabel
}

export const CMS_CONTENT_TYPE_TEXTS = ['newButton', 'newTitle', 'editTitle'] as const

export const CMS_CONTENT_ORDERS = ['newest', 'manual', 'title'] as const
export type CmsContentOrder = typeof CMS_CONTENT_ORDERS[number]

export interface CmsContentInput {
  pages?: Record<string, CmsContentPageInput>
  types?: Record<string, CmsContentTypeInput>
}

export interface CmsContentPage {
  key: string
  label: CmsContentLabel
  path: string
}

export interface CmsContentType {
  key: string
  label: CmsContentLabel
  text: CmsContentTypeText
  /** The form Core renders for a Content type; null for a type with a route (Edit Mode). */
  fields: Record<string, CmsContentField> | null
  section: 'pages' | 'content'
  order: CmsContentOrder
  /** Route pattern for a type of Pages, e.g. `/blog/[slug]`. */
  route: string | null
}

export interface ResolvedCmsContent {
  pages: CmsContentPage[]
  types: CmsContentType[]
}

export type CmsContentIgnoredReason =
  | 'type-key'
  | 'type-shape'
  | 'type-label'
  | 'type-text'
  | 'no-route-or-fields'
  | 'route-and-fields'
  | 'editor-removed'
  | 'route-format'
  | 'order'
  | 'route-manual'
  | 'unknown-key'
  | 'page-key'
  | 'page-shape'
  | 'page-path'
  | 'page-duplicate-path'

export interface CmsContentIgnored {
  /** `root`: a key of the declaration itself (`types`, `pages`); `field`: `type.field`. */
  kind: 'type' | 'page' | 'root' | 'field'
  key: string
  reason: CmsContentIgnoredReason | CmsContentFieldProblem
}

/** Type key: permanent, stored with every entry (014: `^[a-z][a-z0-9-]{0,39}$`). */
export const CONTENT_TYPE_KEY = /^[a-z][a-z0-9-]{0,39}$/
/** A page key as useCmsPage takes it. */
const PAGE_KEY = /^[a-z][a-z0-9_-]{0,79}$/
/** `/blog/[slug]`, `/news/archive/[slug]`: static segments, then `[slug]` last. */
export const CONTENT_ROUTE = /^(?:\/[a-z0-9][a-z0-9-]*)+\/\[slug\]$/
const PAGE_PATH = /^\/(?:[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*)?$/

// What a declaration may have: anything else is a typo (`rout`) or a removed
// key, and would be silently ignored.
const ROOT_KEYS = ['pages', 'types']
const TYPE_KEYS = ['label', 'route', 'fields', 'order', 'text']
const PAGE_KEYS = ['label', 'path']

function unknownKeys(value: Record<string, unknown>, known: readonly string[]): boolean {
  return Object.keys(value).some(key => !known.includes(key))
}

export function defineCmsContent<T extends CmsContentInput>(content: T): T {
  return content
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validLabel(value: unknown): value is CmsContentLabel {
  if (typeof value === 'string') {
    return value.trim().length > 0 && value.length <= 120
  }

  return isObject(value)
    && Object.keys(value).length > 0
    && Object.values(value).every(text => typeof text === 'string' && text.trim().length > 0 && text.length <= 120)
}

function validText(value: unknown): boolean {
  return isObject(value)
    && Object.entries(value).every(([key, text]) => (CMS_CONTENT_TYPE_TEXTS as readonly string[]).includes(key) && validLabel(text))
}

/**
 * Checks the declaration. What is invalid is dropped with a reason, so a
 * broken entry never reaches the admin; the module reports the reasons.
 */
export function resolveCmsContent(input: unknown): {
  content: ResolvedCmsContent
  ignored: CmsContentIgnored[]
} {
  const content: ResolvedCmsContent = { pages: [], types: [] }
  const ignored: CmsContentIgnored[] = []

  if (!isObject(input)) {
    return { content, ignored }
  }

  for (const key of Object.keys(input).filter(key => !ROOT_KEYS.includes(key))) {
    ignored.push({ kind: 'root', key, reason: 'unknown-key' })
  }

  const paths = new Set<string>()

  for (const [key, page] of Object.entries(isObject(input.pages) ? input.pages : {})) {
    if (!PAGE_KEY.test(key)) {
      ignored.push({ kind: 'page', key, reason: 'page-key' })
    } else if (!isObject(page) || !validLabel(page.label)) {
      ignored.push({ kind: 'page', key, reason: 'page-shape' })
    } else if (unknownKeys(page, PAGE_KEYS)) {
      ignored.push({ kind: 'page', key, reason: 'unknown-key' })
    } else if (typeof page.path !== 'string' || !PAGE_PATH.test(page.path)) {
      ignored.push({ kind: 'page', key, reason: 'page-path' })
    } else if (paths.has(page.path)) {
      ignored.push({ kind: 'page', key, reason: 'page-duplicate-path' })
    } else {
      paths.add(page.path)
      content.pages.push({ key, label: page.label, path: page.path })
    }
  }

  for (const [key, type] of Object.entries(isObject(input.types) ? input.types : {})) {
    const reason = typeProblem(key, type)

    if (reason) {
      ignored.push({ kind: 'type', key, reason })
      continue
    }

    const declared = type as CmsContentTypeInput
    let fields: Record<string, CmsContentField> | null = null

    if (declared.fields !== undefined) {
      const resolved = resolveContentFields(declared.fields)

      if (!resolved.fields) {
        for (const problem of resolved.problems) {
          ignored.push({ kind: 'field', key: `${key}.${problem.field}`, reason: problem.reason })
        }

        continue
      }

      fields = resolved.fields
    }

    content.types.push({
      key,
      label: declared.label,
      text: declared.text ?? {},
      fields,
      section: declared.route ? 'pages' : 'content',
      order: declared.order ?? (declared.route ? 'newest' : 'manual'),
      route: declared.route ?? null,
    })
  }

  return { content, ignored }
}

function typeProblem(key: string, type: unknown): CmsContentIgnoredReason | null {
  if (!CONTENT_TYPE_KEY.test(key)) {
    return 'type-key'
  }

  if (!isObject(type)) {
    return 'type-shape'
  }

  // The Client's own editor component was removed (C-103, 2026-11-25): a
  // Content type describes its form with fields.
  if ('editor' in type) {
    return 'editor-removed'
  }

  if (unknownKeys(type, TYPE_KEYS)) {
    return 'unknown-key'
  }

  if (!validLabel(type.label)) {
    return 'type-label'
  }

  if (type.text !== undefined && !validText(type.text)) {
    return 'type-text'
  }

  // A type with a route is edited on its page in Edit Mode: no admin form.
  if (type.route !== undefined && type.fields !== undefined) {
    return 'route-and-fields'
  }

  if (type.route === undefined && type.fields === undefined) {
    return 'no-route-or-fields'
  }

  if (type.route !== undefined && (typeof type.route !== 'string' || !CONTENT_ROUTE.test(type.route))) {
    return 'route-format'
  }

  if (type.order !== undefined && !(CMS_CONTENT_ORDERS as readonly unknown[]).includes(type.order)) {
    return 'order'
  }

  // Pages has no screen to order entries by hand (yet): a manual type of Pages
  // could never be ordered.
  if (type.route !== undefined && type.order === 'manual') {
    return 'route-manual'
  }

  return null
}
