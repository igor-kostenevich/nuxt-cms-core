import { describe, expect, it } from 'vitest'
import { safeRedirect } from '../app/auth/redirect'

describe('safeRedirect', () => {
  it('keeps admin paths, including the editor', () => {
    expect(safeRedirect('/admin')).toBe('/admin')
    expect(safeRedirect('/admin/edit')).toBe('/admin/edit')
    expect(safeRedirect('/admin/edit/about')).toBe('/admin/edit/about')
    expect(safeRedirect('/admin?tab=1')).toBe('/admin?tab=1')
    expect(safeRedirect('/admin/edit#field')).toBe('/admin/edit#field')
    expect(safeRedirect(['/admin/edit/about'])).toBe('/admin/edit/about')
  })

  it('rejects open redirects and unrelated paths', () => {
    expect(safeRedirect('https://evil.example')).toBe('/admin')
    expect(safeRedirect('//evil.example')).toBe('/admin')
    expect(safeRedirect('/\\evil.example')).toBe('/admin')
    expect(safeRedirect('/admin/../../etc')).toBe('/admin')
    expect(safeRedirect('/admin%2f..%2fsecret')).toBe('/admin')
    expect(safeRedirect('/settings')).toBe('/admin')
    expect(safeRedirect('/edit')).toBe('/admin')
    expect(safeRedirect('/admin.evil.example')).toBe('/admin')
    expect(safeRedirect('')).toBe('/admin')
    expect(safeRedirect(null)).toBe('/admin')
    expect(safeRedirect(undefined)).toBe('/admin')
  })

  it('does not send a signed-in user back to the auth screens', () => {
    expect(safeRedirect('/admin/login')).toBe('/admin')
    expect(safeRedirect('/admin/login?redirect=https://evil.example')).toBe('/admin')
  })
})
