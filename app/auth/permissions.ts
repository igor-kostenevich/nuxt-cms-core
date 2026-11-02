import type { CmsPermission, CmsRole } from '../types/auth'

/**
 * Static role → permission map for V1.
 *
 * The same matrix is duplicated in `cms_can()` in the cms_users migration.
 * UI checks are not a security boundary: RLS calls the SQL function.
 * Keep the two copies identical.
 */
const GRANTED: Record<CmsRole, readonly CmsPermission[]> = {
  owner: ['settings.update', 'users.manage', 'pages.edit', 'pages.publish'],
  admin: ['settings.update', 'pages.edit', 'pages.publish'],
  editor: ['pages.edit'],
}

export const CMS_PERMISSIONS = [
  'settings.update',
  'users.manage',
  'pages.edit',
  'pages.publish',
] as const satisfies readonly CmsPermission[]

export function roleCan(role: CmsRole, permission: CmsPermission): boolean {
  const granted = GRANTED[role]

  if (!granted) {
    return false
  }

  return granted.includes(permission)
}
