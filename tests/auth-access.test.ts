import { describe, expect, it } from 'vitest'
import { cmsAuthGate, loginAccess, sessionFromAccess } from '../app/auth/access'
import type { CmsAuthIdentity, CmsMembership, CmsRole } from '../app/types/auth'

const identity: CmsAuthIdentity = {
  id: 'user-1',
  email: 'owner@example.com',
}

function membership(role: CmsRole, status: CmsMembership['status']): CmsMembership {
  return { userId: identity.id, role, status }
}

describe('sessionFromAccess', () => {
  it('stays anonymous without an auth identity', () => {
    expect(sessionFromAccess(null, null)).toEqual({
      authenticated: false,
      user: null,
    })
  })

  it('keeps a signed-in person who is not an active CMS user', () => {
    expect(sessionFromAccess(identity, null)).toEqual({
      authenticated: true,
      user: null,
    })
    expect(sessionFromAccess(identity, membership('editor', 'disabled'))).toEqual({
      authenticated: true,
      user: null,
    })
  })

  it('exposes only an active membership as a CMS user', () => {
    expect(sessionFromAccess(identity, membership('editor', 'active'))).toEqual({
      authenticated: true,
      user: {
        id: identity.id,
        email: identity.email,
        role: 'editor',
        status: 'active',
      },
    })
  })
})

describe('loginAccess', () => {
  it('rejects a missing or disabled membership', () => {
    expect(loginAccess(null)).toEqual({ ok: false, reason: 'no_cms_access' })
    expect(loginAccess(membership('owner', 'disabled'))).toEqual({ ok: false, reason: 'no_cms_access' })
  })

  it('accepts an active membership', () => {
    expect(loginAccess(membership('admin', 'active'))).toEqual({ ok: true })
  })
})

describe('cmsAuthGate', () => {
  const anonymous = sessionFromAccess(null, null)
  const signedOutOfCms = sessionFromAccess(identity, null)
  const editor = sessionFromAccess(identity, membership('editor', 'active'))

  it('sends an anonymous visitor to login and keeps a safe redirect', () => {
    expect(cmsAuthGate('/admin', '/admin', anonymous)).toEqual({
      action: 'login',
      redirect: '/admin',
    })
    expect(cmsAuthGate('/admin/edit/about', '/admin/edit/about', anonymous)).toEqual({
      action: 'login',
      redirect: '/admin/edit/about',
    })
    expect(cmsAuthGate('/admin', 'https://evil.example', anonymous)).toEqual({
      action: 'login',
      redirect: '/admin',
    })
    expect(cmsAuthGate('/admin/login', '/admin/login', anonymous)).toEqual({
      action: 'login',
      redirect: '/admin',
    })
  })

  it('sends a signed-in site user without CMS access home', () => {
    expect(cmsAuthGate('/admin', '/admin', signedOutOfCms)).toEqual({ action: 'home' })
    expect(cmsAuthGate('/admin/edit', '/admin/edit', signedOutOfCms)).toEqual({ action: 'home' })
  })

  it('lets an editor open admin and edit pages', () => {
    expect(cmsAuthGate('/admin', '/admin', editor)).toEqual({ action: 'allow' })
    expect(cmsAuthGate('/admin/edit/about', '/admin/edit/about', editor)).toEqual({ action: 'allow' })
  })

  it('blocks an edit path when the role cannot edit', () => {
    const viewer = sessionFromAccess(identity, membership('viewer' as CmsRole, 'active'))

    expect(cmsAuthGate('/admin/edit', '/admin/edit', viewer)).toEqual({ action: 'home' })
    expect(cmsAuthGate('/admin', '/admin', viewer)).toEqual({ action: 'allow' })
    expect(cmsAuthGate('/admin/editorial', '/admin/editorial', viewer)).toEqual({ action: 'allow' })
  })
})
