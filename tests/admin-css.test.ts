import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { adminCssPlugin, isAdminCss, scopeAdminCss } from '../src/admin-css'

const require = createRequire(import.meta.url)

/** Top-level blocks of a stylesheet: what is left outside every `{ … }`. */
function topLevel(css: string): string[] {
  const out: string[] = []
  let depth = 0
  let head = ''

  for (const char of css) {
    if (char === '{') {
      if (depth === 0) {
        out.push(head.trim())
        head = ''
      }
      depth++
    } else if (char === '}') {
      depth--
    } else if (depth === 0) {
      head += char
    }
  }

  return out
}

describe('admin css scoping (C-21, C-103)', () => {
  it('only touches stylesheets imported with ?cms-admin', () => {
    expect(isAdminCss('/x/@vuepic/vue-datepicker/dist/main.css?cms-admin')).toBe(true)
    expect(isAdminCss('/x/@vuepic/vue-datepicker/dist/main.css')).toBe(false)
    expect(isAdminCss('/x/main.css?inline&cms-admin')).toBe(true)
    expect(isAdminCss('/x/main.js?cms-admin')).toBe(false)
    expect(adminCssPlugin().transform('a{}', '/x/main.css')).toBeUndefined()
  })

  it('moves :root to the admin root and keeps keyframes global', () => {
    const css = ':root{--dp-x:1px}.a{color:red}@keyframes spin{from{opacity:0}to{opacity:1}}:root .b{}'
    const scoped = scopeAdminCss(css)

    expect(topLevel(scoped)).toEqual(['@keyframes spin', '@scope (.cms-admin)'])
    expect(scoped).toContain(':scope{--dp-x:1px}')
    expect(scoped).toContain(':scope .b{}')
    expect(scoped).not.toContain(':root')
  })

  it('leaves nothing of the datepicker stylesheet outside the admin', () => {
    const css = readFileSync(require.resolve('@vuepic/vue-datepicker/dist/main.css'), 'utf8')
    const blocks = topLevel(scopeAdminCss(css))

    expect(blocks.filter(block => !block.startsWith('@keyframes'))).toEqual(['@scope (.cms-admin)'])
    expect(scopeAdminCss(css)).not.toContain(':root')
  })
})
