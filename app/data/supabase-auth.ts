import { appendResponseHeader, parseCookies, setCookie, type H3Event } from 'h3'
import { createBrowserClient, createServerClient, type CookieOptions } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CmsAuthIdentity } from '../types/auth'
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

let browserClient: SupabaseClient | undefined

type AuthEventContext = {
  [AUTH_CLIENT_KEY]?: SupabaseClient
}

export function getSupabaseAuthClient(request?: H3Event): SupabaseClient {
  // The browser client is created once, while a component or middleware still
  // has the Nuxt instance. Later calls reuse it and do not touch composables.
  if (import.meta.client) {
    if (!browserClient) {
      const { url, key } = readSupabasePublicConfig()
      browserClient = createBrowserClient(url, key)
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
  const client = createServerClient(url, key, {
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
  const { data, error } = await getSupabaseAuthClient(request).auth.getUser()

  if (error) {
    if (isMissingSession(error)) {
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
  const { error } = await getSupabaseAuthClient(request).auth.signOut()

  if (error && !isMissingSession(error)) {
    throw new CmsDataError('unknown', `Failed to sign out: ${error.message}`, {
      cause: error,
    })
  }
}

function isInvalidCredentials(error: { code?: string, name?: string }): boolean {
  return error.code === 'invalid_credentials' || error.name === 'AuthInvalidCredentialsError'
}

function isMissingSession(error: { name?: string, message?: string }): boolean {
  return error.name === 'AuthSessionMissingError'
    || error.message === 'Auth session missing!'
}
