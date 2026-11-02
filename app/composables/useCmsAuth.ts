import type { H3Event } from 'h3'
import { loginAccess, sessionFromAccess, type CmsAuthSnapshot } from '../auth/access'
import {
  getAuthUser,
  getSupabaseAuthClient,
  signInWithPassword,
  signOut,
} from '../data/supabase-auth'
import { createCmsUsersRepository } from '../data/repositories/cms-users.repository'
import type { CmsLoginResult } from '../types/auth'

export type { CmsAuthSnapshot }

/**
 * CMS session: an auth identity plus an active cms_users row.
 * Disabled memberships and auth users without a row are authenticated, but
 * they are not a CmsUser.
 */
export function useCmsAuth() {
  // Captured here, while this composable is still inside middleware or setup.
  // The async loader runs after that context is gone, so it must reuse this
  // request instead of calling useRequestEvent() again.
  const request = import.meta.server ? useRequestEvent() : undefined
  getSupabaseAuthClient(request)

  const repository = createCmsUsersRepository(request)
  const session = useAsyncData('cms:auth-session', () => loadSession(repository, request))

  const user = computed(() => session.data.value?.user ?? null)
  const authenticated = computed(() => session.data.value?.authenticated ?? false)

  async function ensure(): Promise<CmsAuthSnapshot> {
    await session

    if (session.error.value) {
      throw session.error.value
    }

    return session.data.value ?? sessionFromAccess(null, null)
  }

  async function login(email: string, password: string): Promise<CmsLoginResult> {
    const signedIn = await signInWithPassword(email, password, request)

    if (!signedIn.ok) {
      return signedIn
    }

    // This session was just created by the CMS form. If it does not become an
    // active CMS user, sign it out. A session the public site created earlier
    // never reaches this branch: the middleware does not call login().
    try {
      const membership = await repository.getByUserId(signedIn.identity.id)
      const access = loginAccess(membership)

      if (!access.ok) {
        await signOut(request)
        await session.refresh()
        return access
      }
    } catch (error) {
      await signOut(request)
      await session.refresh()
      throw error
    }

    await session.refresh()
    return { ok: true }
  }

  async function logout() {
    await signOut(request)
    await session.refresh()
  }

  return {
    user,
    authenticated,
    pending: session.pending,
    error: session.error,
    ensure,
    login,
    logout,
  }
}

async function loadSession(
  repository: ReturnType<typeof createCmsUsersRepository>,
  request?: H3Event,
): Promise<CmsAuthSnapshot> {
  const identity = await getAuthUser(request)

  if (!identity) {
    return sessionFromAccess(null, null)
  }

  const membership = await repository.getByUserId(identity.id)
  return sessionFromAccess(identity, membership)
}
