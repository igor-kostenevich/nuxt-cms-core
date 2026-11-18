import { h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { renderRichText, type RenderRichTextOptions } from '../app/primitives/rich-text'

async function render(value: unknown, options?: RenderRichTextOptions): Promise<string> {
  return renderToString(h('div', renderRichText(value, options)))
}

function doc(...paragraphs: unknown[][]) {
  return { type: 'doc', content: paragraphs.map(content => ({ type: 'paragraph', content })) }
}

const text = (value: string, marks?: unknown[]) => ({ type: 'text', text: value, marks })

describe('renderRichText', () => {
  it('renders paragraphs, marks and hard breaks', async () => {
    const value = doc(
      [text('Hello '), text('bold', [{ type: 'bold' }]), { type: 'hardBreak' }, text('it', [{ type: 'italic' }])],
      [text('Second')],
    )

    expect(await render(value)).toBe('<div><p>Hello <strong>bold</strong><br><em>it</em></p><p>Second</p></div>')
  })

  it('nests marks with the first one outermost and applies a repeated mark once', async () => {
    const value = doc([text('x', [{ type: 'bold' }, { type: 'italic' }, { type: 'bold' }])])

    expect(await render(value)).toBe('<div><p><strong><em>x</em></strong></p></div>')
  })

  it('renders a safe link, with rel only when it opens a new tab', async () => {
    const value = doc([
      text('site', [{ type: 'link', attrs: { href: '/about' } }]),
      text('ext', [{ type: 'link', attrs: { href: 'https://example.com', target: '_blank', rel: 'opener', class: 'x' } }]),
    ])

    expect(await render(value)).toBe(
      '<div><p><a href="/about">site</a>'
      + '<a href="https://example.com" target="_blank" rel="noopener noreferrer">ext</a></p></div>',
    )
  })

  it('renders an unsafe link as plain text', async () => {
    const value = doc([text('click', [{ type: 'bold' }, { type: 'link', attrs: { href: 'javascript:alert(1)' } }])])

    expect(await render(value)).toBe('<div><p><strong>click</strong></p></div>')
  })

  it('escapes markup in text', async () => {
    const value = doc([text('<script>alert(1)</script>')])

    expect(await render(value)).toBe('<div><p>&lt;script&gt;alert(1)&lt;/script&gt;</p></div>')
  })

  it('skips unknown nodes and marks', async () => {
    const value = {
      type: 'doc',
      content: [
        { type: 'heading', content: [text('dropped')] },
        { type: 'paragraph', content: [
          text('kept', [{ type: 'textStyle', attrs: { color: 'red' } }]),
          { type: 'image', attrs: { src: 'x.png' } },
          { type: 'text', text: 42 },
          'raw string',
        ] },
      ],
    }

    expect(await render(value)).toBe('<div><p>kept</p></div>')
  })

  it.each([null, undefined, 'text', 42, [], {}, { type: 'paragraph' }, { type: 'doc', content: 'x' }])(
    'renders nothing for malformed input: %j',
    async (value) => {
      expect(await render(value)).toBe('<div></div>')
    },
  )

  it('joins paragraphs with <br> in inline mode', async () => {
    const value = doc([text('One')], [text('Two', [{ type: 'bold' }])])

    expect(await render(value, { inline: true })).toBe('<div>One<br><strong>Two</strong></div>')
  })
})

describe('renderRichText with a link resolver (C-79)', () => {
  it('maps site paths of links to the current locale', async () => {
    const value = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'About', marks: [{ type: 'link', attrs: { href: '/about' } }] }],
      }],
    }

    const html = await renderToString(h('div', renderRichText(value, { localize: href => `/en${href}` })))
    expect(html).toContain('href="/en/about"')
  })
})
