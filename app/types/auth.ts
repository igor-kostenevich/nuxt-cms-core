/**
 * Single source for roles, permissions and statuses: the types derive from
 * these lists, so a value added to a type is also in the list that the
 * repository and tests/permissions-sync.test.ts check against.
 */
export const CMS_ROLES = ['owner', 'admin', 'editor'] as const
export const CMS_PERMISSIONS = [
  'settings.update',
  'users.manage',
  'pages.edit',
  'pages.publish',
  'pages.unlock',
  'media.upload',
  'media.edit',
  'media.delete',
] as const
export const CMS_USER_STATUSES = ['active', 'disabled'] as const

export type CmsRole = (typeof CMS_ROLES)[number]
export type CmsPermission = (typeof CMS_PERMISSIONS)[number]
export type CmsUserStatus = (typeof CMS_USER_STATUSES)[number]

/** Identity from the auth provider. Not CMS access. */
export interface CmsAuthIdentity {
  id: string
  email: string
}

/** Row in `cms_users`. Presence here is what grants CMS access. */
export interface CmsMembership {
  userId: string
  role: CmsRole
  status: CmsUserStatus
}

/** Active CMS user shown to the UI. Disabled and missing rows never become one. */
export interface CmsUser {
  id: string
  email: string
  role: CmsRole
  status: 'active'
}

export type CmsLoginResult =
  | { ok: true }
  | { ok: false, reason: 'invalid_credentials' | 'no_cms_access' }
