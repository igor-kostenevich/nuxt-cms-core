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
  // Two columns, two rows, like the playground's project grid.
  const grid = [
    { x: 0, y: 0, w: 400, h: 300 },
    { x: 420, y: 0, w: 400, h: 300 },
    { x: 0, y: 320, w: 400, h: 300 },
    { x: 420, y: 320, w: 400, h: 300 },
  ]

  it('takes the place of the item it is dropped on, in a column', () => {
    expect(dropIndex(column, { x: 100, y: 350 })).toBe(3)
    expect(dropIndex(column, { x: 100, y: 305 })).toBe(3)
    expect(dropIndex(column, { x: 100, y: 5 })).toBe(0)
  })

  it('takes the place of the item it is dropped on, in a row', () => {
    expect(dropIndex(row, { x: 900, y: 100 })).toBe(2)
    expect(dropIndex(row, { x: 10, y: 100 })).toBe(0)
  })

  // Regressions: a grid was read as one row, so only the horizontal half of
  // the target counted, and the left half of the next item was a no-op.
  it('moves right onto any part of the neighbour', () => {
    expect(dropIndex(grid, { x: 440, y: 150 })).toBe(1)
    expect(dropIndex(grid, { x: 800, y: 150 })).toBe(1)
  })

  it('moves down and up within a column of the grid', () => {
    expect(dropIndex(grid, { x: 50, y: 400 })).toBe(2)
    expect(dropIndex(grid, { x: 350, y: 400 })).toBe(2)
    expect(dropIndex(grid, { x: 350, y: 50 })).toBe(0)
  })

  it('moves diagonally', () => {
    expect(dropIndex(grid, { x: 600, y: 500 })).toBe(3)
    expect(dropIndex(grid, { x: 100, y: 100 })).toBe(0)
  })

  it('picks the nearest item in a gap between items', () => {
    expect(dropIndex(grid, { x: 410, y: 150 })).toBe(0)
    expect(dropIndex(grid, { x: 600, y: 310 })).toBe(1)
  })

  it('stays put when dropped on itself', () => {
    expect(dropIndex(column, { x: 100, y: 120 })).toBe(1)
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
