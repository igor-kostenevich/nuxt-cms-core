import { describe, expect, it } from 'vitest'
import { editorUrl, safeEditPath } from '../app/admin/edit-path'

describe('safeEditPath', () => {
  it('keeps site paths, including encoded non-ASCII segments', () => {
    for (const path of ['/', '/about', '/uk/about/', '/work/case-1', '/uk/%D0%BF%D1%80%D0%BE', '/a.b/c..d']) {
      expect(safeEditPath(path)).toBe(path)
    }
  })

  it('rejects dot segments, as written and percent-encoded', () => {
    for (const path of ['/../settings', '/x/..', '/./x', '/%2e%2e/settings', '/%2E%2E/settings', '/.%2e/settings', '/x/%2e']) {
      expect(safeEditPath(path)).toBeNull()
    }
  })

  it('rejects encoded slashes, backslashes, queries and fragments', () => {
    for (const path of ['/x%2f..%2fsettings', '/x%2F', '/x%5c..', '/x%3fhistory=1', '/x%23top', '/x\\..\\settings']) {
      expect(safeEditPath(path)).toBeNull()
    }
  })

  it('rejects a query, a fragment, empty segments and protocol-relative paths', () => {
    for (const path of ['/x?history=00000000-0000-4000-8000-000000000001', '/x#top', '//evil.example', '/a//b', '/ x']) {
      expect(safeEditPath(path)).toBeNull()
    }
  })

  it('rejects double encoding, malformed escapes, relative and empty paths', () => {
    for (const path of ['/%252e%252e/settings', '/%E0%A4%A', 'about', '', null, undefined, `/${'a'.repeat(500)}`]) {
      expect(safeEditPath(path)).toBeNull()
    }
  })
})

describe('editorUrl', () => {
  it('builds the Edit Mode link with the query', () => {
    expect(editorUrl('/about', new URLSearchParams({ field: 'hero.title', locale: 'uk' })))
      .toBe('/admin/edit/about?field=hero.title&locale=uk')
    expect(editorUrl('/', new URLSearchParams())).toBe('/admin/edit/')
  })

  it('gives no link for an unsafe path', () => {
    expect(editorUrl('/../settings', new URLSearchParams({ field: 'x' }))).toBeNull()
  })
})
