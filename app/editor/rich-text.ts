import type {
  CmsRichTextInline,
  CmsRichTextMark,
  CmsRichTextParagraph,
  CmsRichTextValue,
} from '../types/primitives'

type UnknownNode = { type?: unknown, text?: unknown, content?: unknown, marks?: unknown, attrs?: unknown }

function normalizeMark(raw: unknown): CmsRichTextMark | null {
  const mark = raw as UnknownNode | null

  if (mark?.type === 'bold' || mark?.type === 'italic') {
    return { type: mark.type }
  }

  if (mark?.type === 'link') {
    const attrs = (mark.attrs ?? {}) as { href?: unknown, target?: unknown }

    if (typeof attrs.href !== 'string' || attrs.href === '') {
      return null
    }

    return {
      type: 'link',
      attrs: attrs.target === '_blank' ? { href: attrs.href, target: '_blank' } : { href: attrs.href },
    }
  }

  return null
}

function normalizeInline(raw: unknown): CmsRichTextInline | null {
  const node = raw as UnknownNode | null

  if (node?.type === 'hardBreak') {
    return { type: 'hardBreak' }
  }

  if (node?.type === 'text' && typeof node.text === 'string' && node.text !== '') {
    const marks = (Array.isArray(node.marks) ? node.marks : [])
      .map(normalizeMark)
      .filter((mark): mark is CmsRichTextMark => mark !== null)

    return marks.length > 0 ? { type: 'text', text: node.text, marks } : { type: 'text', text: node.text }
  }

  return null
}

/**
 * Tiptap JSON → the stored rich text format (MASTER_PLAN C-49). Keeps only
 * what the public renderer supports and drops editor-only attributes (Tiptap
 * adds `rel` and `class` to links), so the stored document stays minimal and
 * stable across Tiptap versions.
 */
export function normalizeRichText(raw: unknown): CmsRichTextValue {
  const doc = raw as UnknownNode | null
  const blocks = Array.isArray(doc?.content) ? doc.content : []
  const content: CmsRichTextParagraph[] = []

  for (const block of blocks as UnknownNode[]) {
    if (block?.type !== 'paragraph') {
      continue
    }

    const inline = (Array.isArray(block.content) ? block.content : [])
      .map(normalizeInline)
      .filter((node): node is CmsRichTextInline => node !== null)

    content.push(inline.length > 0 ? { type: 'paragraph', content: inline } : { type: 'paragraph' })
  }

  return { type: 'doc', content }
}
