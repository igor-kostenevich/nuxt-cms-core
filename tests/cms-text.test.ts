import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import CmsText from '../app/components/cms/CmsText.vue'

async function render(value: unknown) {
  const html = await renderToString(h(CmsText, { value, fieldKey: 'hero.title' } as never, { default: () => 'Default' }))
  return html.replace(/<!--[[\]]-->/g, '')
}

// A stored value is untrusted input: a translation or a direct write can leave
// something other than a string at a text address (C-78).
describe('CmsText', () => {
  it('renders a stored string as is', async () => {
    expect(await render('Hello <b>')).toBe('<span>Hello &lt;b&gt;</span>')
  })

  it('keeps an empty string instead of the default', async () => {
    expect(await render('')).toBe('<span></span>')
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a rich text document', { type: 'doc', content: [] }],
    ['an object', { label: 'Go' }],
    ['a number', 42],
    ['a boolean', true],
    ['a list', ['x']],
  ])('renders the default for %s', async (_, value) => {
    expect(await render(value)).toBe('<span>Default</span>')
  })
})
