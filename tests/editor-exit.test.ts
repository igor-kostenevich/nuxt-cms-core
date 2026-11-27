import { describe, expect, it } from 'vitest'
import { exitTarget, rememberExitFrom } from '../app/editor/exit'

describe('Exit of Edit Mode', () => {
  it('goes back to the admin screen it was opened from', () => {
    rememberExitFrom('/admin/pages/post?status=draft')
    expect(exitTarget()).toBe('/admin/pages/post?status=draft')
  })

  it('keeps it while moving between pages of Edit Mode', () => {
    rememberExitFrom('/admin/pages')
    rememberExitFrom('/admin/edit/about')
    expect(exitTarget()).toBe('/admin/pages')
  })

  it('the dashboard after a direct open, the login or the site', () => {
    for (const back of [null, undefined, '/admin/login', '/blog/x', 'https://evil.example/admin']) {
      rememberExitFrom('/admin/pages')
      rememberExitFrom(back)
      expect(exitTarget()).toBeNull()
    }
  })
})
