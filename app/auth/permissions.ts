import type { CmsPermission, CmsRole } from '../types/auth'

export { CMS_PERMISSIONS } from '../types/auth'

/**
 * Static role → permission map for V1.
 *
 * The same matrix is duplicated in `cms_can()` in the cms_users migration.
 * UI checks are not a security boundary: RLS calls the SQL function.
 * Keep the two copies identical; tests/permissions-sync.test.ts fails when they drift.
 */
const GRANTED: Record<CmsRole, readonly CmsPermission[]> = {
  owner: ['settings.update', 'users.manage', 'pages.edit', 'pages.publish'],
  admin: ['settings.update', 'pages.edit', 'pages.publish'],
  editor: ['pages.edit'],
}

export function roleCan(role: CmsRole, permission: CmsPermission): boolean {
  const granted = GRANTED[role]

  if (!granted) {
    return false
  }

  return granted.includes(permission)
}
