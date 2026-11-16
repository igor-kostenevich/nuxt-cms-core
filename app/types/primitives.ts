/**
 * Value formats of the CMS primitives. They are stored in page documents, so
 * they are a public contract: change them only additively (MASTER_PLAN C-48, C-49).
 */

/** Rich text mark. Names follow the Tiptap StarterKit defaults (C-49). */
export type CmsRichTextMark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'link', attrs: { href: string, target?: '_blank' | null } }

export type CmsRichTextInline =
  | { type: 'text', text: string, marks?: CmsRichTextMark[] }
  | { type: 'hardBreak' }

export interface CmsRichTextParagraph {
  type: 'paragraph'
  content?: CmsRichTextInline[]
}

/** ProseMirror / Tiptap JSON document with the formatting Core allows. */
export interface CmsRichTextValue {
  type: 'doc'
  content?: CmsRichTextParagraph[]
}

/**
 * Value of `CmsLink` and `CmsButton`. The link kind (internal, section, email,
 * phone, external) is derived from `href`, not stored next to it.
 */
export interface CmsLinkValue {
  label?: string
  href?: string
  newTab?: boolean
}

/** Value of `CmsButton`. Same as a link for now; a separate name lets it grow on its own. */
export type CmsButtonValue = CmsLinkValue

/**
 * One item of a `CmsCollection` (local repeatable content, MASTER_PLAN C-03).
 * `id` is stable across reorder: field addresses inside an item use it, e.g.
 * `services.k3f9.title`. The other fields belong to the Client Project.
 */
export interface CmsCollectionItem {
  id: string
  [field: string]: unknown
}

/** Value of `CmsCollection`: the items in display order. */
export type CmsCollectionValue = CmsCollectionItem[]

/** Value of `CmsOptional`. An object, so it can grow without breaking stored data. */
export interface CmsOptionalValue {
  hidden?: boolean
}
