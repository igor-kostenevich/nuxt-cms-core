import { describe, expect, it } from 'vitest'
import { dropIndex } from '../app/editor/geometry'
import { linkKind } from '../app/editor/link-kind'
import { normalizeRichText } from '../app/editor/rich-text'

describe('normalizeRichText', () => {
  it('keeps the stored format and drops editor-only attributes', () => {
    const tiptap = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        attrs: { textAlign: 'left' },
        content: [
          { type: 'text', text: 'Hello ' },
          {
            type: 'text',
            text: 'site',
            marks: [
              { type: 'bold' },
              { type: 'link', attrs: { href: '/about', target: null, rel: 'noopener', class: 'x' } },
            ],
          },
          { type: 'hardBreak' },
          { type: 'text', text: 'new', marks: [{ type: 'link', attrs: { href: 'https://a.b', target: '_blank' } }] },
        ],
      }],
    }

    expect(normalizeRichText(tiptap)).toEqual({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'site', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: '/about' } }] },
          { type: 'hardBreak' },
          { type: 'text', text: 'new', marks: [{ type: 'link', attrs: { href: 'https://a.b', target: '_blank' } }] },
        ],
      }],
    })
  })

  it('drops nodes and marks the public renderer does not support', () => {
    const value = normalizeRichText({
      type: 'doc',
      content: [
        { type: 'heading', content: [{ type: 'text', text: 'Big' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'strike' }, { type: 'link', attrs: {} }] }] },
        { type: 'paragraph' },
      ],
    })

    expect(value).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'x' }] },
        { type: 'paragraph' },
      ],
    })
  })

  it('turns garbage into an empty document', () => {
    expect(normalizeRichText(null)).toEqual({ type: 'doc', content: [] })
    expect(normalizeRichText('text')).toEqual({ type: 'doc', content: [] })
  })
})

describe('dropIndex', () => {
  const column = [0, 1, 2, 3].map(index => ({ x: 0, y: index * 100, w: 300, h: 80 }))
  const row = [0, 1, 2].map(index => ({ x: index * 320, y: 0, w: 300, h: 200 }))

  it('moves within a column by the side of the nearest center', () => {
    // Below the last center: after it, so the item ends up last.
    expect(dropIndex(column, { x: 100, y: 350 }, 0)).toBe(3)
    // Above the last center: before it.
    expect(dropIndex(column, { x: 100, y: 330 }, 0)).toBe(2)
    expect(dropIndex(column, { x: 100, y: 5 }, 3)).toBe(0)
  })

  it('moves within a row horizontally', () => {
    expect(dropIndex(row, { x: 900, y: 100 }, 0)).toBe(2)
    expect(dropIndex(row, { x: 10, y: 100 }, 2)).toBe(0)
  })

  it('stays put when dropped on itself', () => {
    expect(dropIndex(column, { x: 100, y: 120 }, 1)).toBe(1)
  })
})

describe('linkKind', () => {
  it.each([
    [undefined, 'none'],
    ['', 'none'],
    ['/about', 'internal'],
    ['#contact', 'section'],
    ['mailto:hi@a.b', 'email'],
    ['tel:+380', 'phone'],
    ['https://a.b', 'external'],
    ['//cdn.a.b', 'external'],
    ['javascript:alert(1)', 'invalid'],
    ['www.example.com', 'invalid'],
  ])('%s → %s', (href, kind) => {
    expect(linkKind(href)).toBe(kind)
  })
})
