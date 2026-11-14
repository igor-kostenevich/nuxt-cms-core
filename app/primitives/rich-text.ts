import { h, type VNodeChild } from 'vue'
import { resolveCmsLink } from './link'

// Renders the rich text JSON of MASTER_PLAN C-49 without Tiptap and without
// v-html. The document comes from the database unchecked, so every node is
// validated here and anything unknown is skipped.

export interface RenderRichTextOptions {
  /** Render paragraphs as inline content separated by `<br>`, e.g. inside a heading. */
  inline?: boolean
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function childrenOf(node: UnknownRecord): unknown[] {
  return Array.isArray(node.content) ? node.content : []
}

function applyMark(child: VNodeChild, mark: UnknownRecord): VNodeChild {
  switch (mark.type) {
    case 'bold':
      return h('strong', [child])
    case 'italic':
      return h('em', [child])
    case 'link': {
      const attrs = isRecord(mark.attrs) ? mark.attrs : {}
      const link = resolveCmsLink(attrs.href, attrs.target === '_blank')

      return link ? h('a', link, [child]) : child
    }
    default:
      return child
  }
}

function renderText(node: UnknownRecord): VNodeChild | null {
  if (typeof node.text !== 'string' || !node.text) {
    return null
  }

  const marks = Array.isArray(node.marks) ? node.marks.filter(isRecord) : []
  // A repeated mark type is applied once, at its first position.
  const unique = marks.filter((mark, index) => marks.findIndex(other => other.type === mark.type) === index)

  // Wrap from the last mark outwards, so the first mark ends up outermost.
  return unique.reduceRight<VNodeChild>((child, mark) => applyMark(child, mark), node.text)
}

function renderInline(paragraph: UnknownRecord): VNodeChild[] {
  const children: VNodeChild[] = []

  for (const node of childrenOf(paragraph)) {
    if (!isRecord(node)) {
      continue
    }

    if (node.type === 'hardBreak') {
      children.push(h('br'))
    }
    else if (node.type === 'text') {
      const text = renderText(node)

      if (text !== null) {
        children.push(text)
      }
    }
  }

  return children
}

/** True for a rich text document; anything else (e.g. a plain string from an older format) is not. */
export function isRichTextDoc(value: unknown): value is UnknownRecord {
  return isRecord(value) && value.type === 'doc'
}

// Tags whose content model is phrasing only: a `<p>` inside them is invalid
// HTML that the browser re-parses, which breaks hydration.
const PHRASING_TAGS = new Set(['p', 'span', 'a', 'button', 'label', 'strong', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

/** Dev-only hint for a block rich text rendered into an inline-only tag. */
export function warnBlockInPhrasingTag(tag: string, inline: boolean): void {
  if (import.meta.dev && !inline && PHRASING_TAGS.has(tag.toLowerCase())) {
    console.warn(`[nuxt-cms-core] CmsRichText: tag "${tag}" cannot contain paragraphs. Add the "inline" prop.`)
  }
}

export function renderRichText(value: unknown, options: RenderRichTextOptions = {}): VNodeChild[] {
  if (!isRichTextDoc(value)) {
    return []
  }

  const paragraphs = childrenOf(value).filter(
    (node): node is UnknownRecord => isRecord(node) && node.type === 'paragraph',
  )

  if (options.inline) {
    return paragraphs.flatMap((paragraph, index) =>
      index === 0 ? renderInline(paragraph) : [h('br'), ...renderInline(paragraph)])
  }

  return paragraphs.map(paragraph => h('p', renderInline(paragraph)))
}
