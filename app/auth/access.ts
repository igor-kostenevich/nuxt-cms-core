import type { CmsAuthIdentity, CmsLoginResult, CmsMembership, CmsUser } from '../types/auth'
import { roleCan } from './permissions'
import { safeRedirect } from './redirect'
import { isEditPath } from './paths'

export interface CmsAuthSnapshot {
  authenticated: boolean
  user: CmsUser | null
}

const EMPTY_SESSION: CmsAuthSnapshot = {
  authenticated: false,
  user: null,
}

/**
 * Identity without an active cms_users row is still signed in.
 * Only an active row becomes a CmsUser.
 */
export function sessionFromAccess(
  identity: CmsAuthIdentity | null,
  membership: CmsMembership | null,
): CmsAuthSnapshot {
  if (!identity) {
    return EMPTY_SESSION
  }

  if (!membership || membership.status !== 'active') {
    return {
      authenticated: true,
      user: null,
    }
  }

  return {
    authenticated: true,
    user: {
      id: identity.id,
      email: identity.email,
      role: membership.role,
      status: 'active',
    },
  }
}

/** Password was already accepted. Membership decides whether the CMS session stays. */
export function loginAccess(membership: CmsMembership | null): CmsLoginResult {
  if (membership?.status !== 'active') {
    return { ok: false, reason: 'no_cms_access' }
  }

  return { ok: true }
}

export type CmsAuthGate =
  | { action: 'allow' }
  | { action: 'login', redirect: string }
  | { action: 'home' }

/**
 * Where an /admin request goes.
 * A signed-in site user without CMS access is sent home and is not signed out.
 * They are not shown an admin screen.
 */
export function cmsAuthGate(
  path: string,
  fullPath: string,
  snapshot: CmsAuthSnapshot,
): CmsAuthGate {
  if (!snapshot.authenticated) {
    return {
      action: 'login',
      redirect: safeRedirect(fullPath),
    }
  }

  if (!snapshot.user) {
    return { action: 'home' }
  }

  if (isEditPath(path) && !roleCan(snapshot.user.role, 'pages.edit')) {
    return { action: 'home' }
  }

  return { action: 'allow' }
}
