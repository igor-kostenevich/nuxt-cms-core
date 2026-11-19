import {
  appendResponseHeader,
  getRequestProtocol,
  parseCookies,
  setCookie,
  type H3Event,
} from 'h3'
import { createBrowserClient, createServerClient, type CookieOptions } from '@supabase/ssr'
import {
  isAuthApiError,
  isAuthSessionMissingError,
  type SupabaseClient,
} from '@supabase/supabase-js'
import type { CmsAuthIdentity } from '../types/auth'
import type { Database } from './database.types'
import { CmsDataError } from './errors'
import { readSupabasePublicConfig } from './supabase'

/**
 * Session-aware Supabase access. Public reads must keep using `supabase.ts`.
 *
 * The browser client is a singleton. The server client is cached on the
 * request event, never in module scope: a module-level server client would
 * reuse one user's cookies for the next request.
 */

const AUTH_CLIENT_KEY = 'cmsSupabaseAuthClient'

let browserClient: SupabaseClient<Database> | undefined

type AuthEventContext = {
  [AUTH_CLIENT_KEY]?: SupabaseClient<Database>
}

export function getSupabaseAuthClient(request?: H3Event): SupabaseClient<Database> {
  // The browser client is created once, while a component or middleware still
  // has the Nuxt instance. Later calls reuse it and do not touch composables.
  if (import.meta.client) {
    if (!browserClient) {
      const { url, key } = readSupabasePublicConfig()
      browserClient = createBrowserClient<Database>(url, key, {
        // @supabase/ssr does not set Secure by default. Following the protocol
        // keeps http://localhost working and HTTPS sites protected.
        cookieOptions: { secure: window.location.protocol === 'https:' },
      })
    }

    return browserClient
  }

  if (!request) {
    throw new CmsDataError(
      'unknown',
      'CMS auth is only available during a request.',
    )
  }

  const context = request.context as AuthEventContext
  const existing = context[AUTH_CLIENT_KEY]

  if (existing) {
    return existing
  }

  // First call for this request must happen inside Nuxt setup or middleware.
  // After an await the Nuxt instance is gone, so later calls only read the
  // client cached on the event above.
  const { url, key } = readSupabasePublicConfig()
  const client = createServerClient<Database>(url, key, {
    // Honours X-Forwarded-Proto, so a TLS-terminating proxy still yields Secure.
    cookieOptions: { secure: getRequestProtocol(request) === 'https' },
    cookies: {
      getAll() {
        return Object.entries(parseCookies(request)).map(([name, value]) => ({ name, value }))
      },
      setAll(cookies, headers) {
        writeAuthCookies(request, cookies, headers)
      },
    },
  })

  context[AUTH_CLIENT_KEY] = client
  return client
}

function writeAuthCookies(
  event: H3Event,
  cookies: { name: string, value: string, options: CookieOptions }[],
  headers: Record<string, string>,
) {
  for (const cookie of cookies) {
    setCookie(event, cookie.name, cookie.value, cookie.options)
  }

  for (const [name, value] of Object.entries(headers)) {
    appendResponseHeader(event, name as 'cache-control', value)
  }
}

export async function getAuthUser(request?: H3Event): Promise<CmsAuthIdentity | null> {
  const client = getSupabaseAuthClient(request)
  const { data, error } = await client.auth.getUser()

  if (error) {
    const kind = classifySessionError(error)

    if (kind === 'missing') {
      return null
    }

    if (kind === 'stale') {
      // The cookie holds a session the auth server rejects. Drop it locally,
      // otherwise every request would fail on the same cookie. Best effort:
      // the visitor is anonymous either way.
      await client.auth.signOut({ scope: 'local' }).catch(() => undefined)
      return null
    }

    throw new CmsDataError('unknown', `Failed to read the CMS session: ${error.message}`, {
      cause: error,
    })
  }

  if (!data.user) {
    return null
  }

  return {
    id: data.user.id,
    email: data.user.email ?? '',
  }
}

export async function signInWithPassword(
  email: string,
  password: string,
  request?: H3Event,
): Promise<{ ok: true, identity: CmsAuthIdentity } | { ok: false, reason: 'invalid_credentials' }> {
  const { data, error } = await getSupabaseAuthClient(request).auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    if (isInvalidCredentials(error)) {
      return { ok: false, reason: 'invalid_credentials' }
    }

    throw new CmsDataError('unknown', `Failed to sign in: ${error.message}`, {
      cause: error,
    })
  }

  if (!data.user) {
    return { ok: false, reason: 'invalid_credentials' }
  }

  return {
    ok: true,
    identity: {
      id: data.user.id,
      email: data.user.email ?? email,
    },
  }
}

export async function signOut(request?: H3Event): Promise<void> {
  const { error } = await getSupabaseAuthClient(request).auth.signOut({ scope: 'local' })

  if (error && classifySessionError(error) === 'failure') {
    throw new CmsDataError('unknown', `Failed to sign out: ${error.message}`, {
      cause: error,
    })
  }
}

/**
 * Calls `callback` when the browser session ends: here or in another tab of
 * the same site (supabase-js relays auth events between tabs). Browser only;
 * returns the unsubscribe function.
 */
export function onSignedOut(callback: () => void): () => void {
  const { data } = getSupabaseAuthClient().auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      callback()
    }
  })

  return () => data.subscription.unsubscribe()
}

function isInvalidCredentials(error: { code?: string, name?: string }): boolean {
  return error.code === 'invalid_credentials' || error.name === 'AuthInvalidCredentialsError'
}

export type SessionErrorKind = 'missing' | 'stale' | 'failure'

/**
 * How a session read failed:
 * - `missing`: there is no session.
 * - `stale`: the cookie holds a session the auth server rejects (expired or
 *   reused refresh token, deleted user, bad JWT). Treated as signed out.
 * - `failure`: network or server trouble. The session state is unknown.
 */
export function classifySessionError(error: unknown): SessionErrorKind {
  if (isAuthSessionMissingError(error)) {
    return 'missing'
  }

  if (isAuthApiError(error) && error.status >= 400 && error.status < 500 && error.status !== 429) {
    return 'stale'
  }

  return 'failure'
}
