import type { CmsPermission, CmsRole } from '../types/auth'

export { CMS_PERMISSIONS } from '../types/auth'

/**
 * Static role → permission map for V1.
 *
 * The same matrix is duplicated in `cms_can()` (newest definition: the localization migration).
 * UI checks are not a security boundary: RLS calls the SQL function.
 * Keep the two copies identical; tests/permissions-sync.test.ts fails when they drift.
 */
const GRANTED: Record<CmsRole, readonly CmsPermission[]> = {
  owner: [
    'settings.update',
    'users.manage',
    'languages.manage',
    'pages.edit',
    'pages.publish',
    'pages.unlock',
    'media.upload',
    'media.edit',
    'media.delete',
  ],
  admin: [
    'settings.update',
    'pages.edit',
    'pages.publish',
    'pages.unlock',
    'media.upload',
    'media.edit',
    'media.delete',
  ],
  editor: ['pages.edit', 'media.upload', 'media.edit'],
}

export function roleCan(role: CmsRole, permission: CmsPermission): boolean {
  const granted = GRANTED[role]

  if (!granted) {
    return false
  }

  return granted.includes(permission)
}
