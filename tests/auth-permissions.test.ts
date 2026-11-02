import { describe, expect, it } from 'vitest'
import { CMS_PERMISSIONS, roleCan } from '../app/auth/permissions'
import type { CmsPermission, CmsRole } from '../app/types/auth'

const roles = ['owner', 'admin', 'editor'] as const satisfies readonly CmsRole[]

const expected: Record<CmsRole, Record<CmsPermission, boolean>> = {
  owner: {
    'settings.update': true,
    'users.manage': true,
    'pages.edit': true,
    'pages.publish': true,
  },
  admin: {
    'settings.update': true,
    'users.manage': false,
    'pages.edit': true,
    'pages.publish': true,
  },
  editor: {
    'settings.update': false,
    'users.manage': false,
    'pages.edit': true,
    'pages.publish': false,
  },
}

describe('roleCan', () => {
  for (const role of roles) {
    for (const permission of CMS_PERMISSIONS) {
      it(`${role} can ${permission}: ${expected[role][permission]}`, () => {
        expect(roleCan(role, permission)).toBe(expected[role][permission])
      })
    }
  }

  it('denies an unknown permission', () => {
    expect(roleCan('owner', 'media.delete' as CmsPermission)).toBe(false)
  })

  it('denies an unknown role', () => {
    expect(roleCan('viewer' as CmsRole, 'pages.edit')).toBe(false)
  })
})
