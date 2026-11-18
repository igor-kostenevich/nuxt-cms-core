import { describe, expect, it } from 'vitest'
import { CMS_PERMISSIONS, roleCan } from '../app/auth/permissions'
import { CMS_ROLES, type CmsPermission, type CmsRole } from '../app/types/auth'

const roles = CMS_ROLES

const expected: Record<CmsRole, Record<CmsPermission, boolean>> = {
  owner: {
    'settings.update': true,
    'users.manage': true,
    'languages.manage': true,
    'pages.edit': true,
    'pages.publish': true,
    'pages.unlock': true,
    'media.upload': true,
    'media.edit': true,
    'media.delete': true,
  },
  admin: {
    'settings.update': true,
    'users.manage': false,
    'languages.manage': false,
    'pages.edit': true,
    'pages.publish': true,
    'pages.unlock': true,
    'media.upload': true,
    'media.edit': true,
    'media.delete': true,
  },
  editor: {
    'settings.update': false,
    'users.manage': false,
    'languages.manage': false,
    'pages.edit': true,
    'pages.publish': false,
    'pages.unlock': false,
    'media.upload': true,
    'media.edit': true,
    'media.delete': false,
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
    expect(roleCan('owner', 'media.purge' as CmsPermission)).toBe(false)
  })

  it('denies an unknown role', () => {
    expect(roleCan('viewer' as CmsRole, 'pages.edit')).toBe(false)
  })
})
