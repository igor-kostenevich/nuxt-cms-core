import { describe, expect, it } from 'vitest'
import { isAdminPath, isEditPath, isLoginPath } from '../app/auth/paths'

describe('CMS path prefixes', () => {
  it.each([
    ['/admin', true],
    ['/admin/', true],
    ['/admin/settings', true],
    ['/administer', false],
    ['/admins/x', false],
    ['/about', false],
  ])('isAdminPath(%s) is %s', (path, expected) => {
    expect(isAdminPath(path)).toBe(expected)
  })

  it('matches edit and login paths on a segment boundary only', () => {
    expect(isEditPath('/admin/edit')).toBe(true)
    expect(isEditPath('/admin/edit/about')).toBe(true)
    expect(isEditPath('/admin/editor')).toBe(false)
    expect(isLoginPath('/admin/login')).toBe(true)
    expect(isLoginPath('/admin/loginx')).toBe(false)
  })

  // vue-router matches case-insensitively: /ADMIN/settings opens /admin/settings,
  // and /ADMIN/edit/x opens Edit Mode itself.
  it('ignores case like the router does', () => {
    expect(isAdminPath('/ADMIN/settings')).toBe(true)
    expect(isAdminPath('/Admin')).toBe(true)
    expect(isEditPath('/admin/EDIT/about')).toBe(true)
    expect(isEditPath('/ADMIN/edit')).toBe(true)
    expect(isLoginPath('/Admin/Login')).toBe(true)
    expect(isAdminPath('/ADMINISTER')).toBe(false)
  })
})
