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
