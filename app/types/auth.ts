export type CmsRole = 'owner' | 'admin' | 'editor'

export type CmsPermission =
  | 'settings.update'
  | 'users.manage'
  | 'pages.edit'
  | 'pages.publish'

export type CmsUserStatus = 'active' | 'disabled'

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
