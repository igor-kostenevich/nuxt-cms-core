import { useCmsAuth } from './useCmsAuth'
import { roleCan } from '../auth/permissions'
import type { CmsPermission } from '../types/auth'

/** Permission checks for the current CMS user. No user means no permission. */
export function usePermissions() {
  const { user } = useCmsAuth()

  function can(permission: CmsPermission): boolean {
    const role = user.value?.role

    if (!role) {
      return false
    }

    return roleCan(role, permission)
  }

  return { can }
}
