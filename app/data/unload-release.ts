import type { H3Event } from 'h3'
import { readSupabasePublicConfig } from './supabase'

/**
 * Release of a Content Lock on tab close (MASTER_PLAN R-18, C-69), shared by
 * the repositories of pages and entries.
 *
 * `navigator.sendBeacon` cannot send an Authorization header, and the
 * Supabase client reads the session asynchronously, which is too late on
 * `pagehide`. So the URL, key and access token are cached ahead of time
 * (`prepare`), and the release is a plain `fetch` with `keepalive`, started
 * synchronously. Best effort: when it does not arrive, the lock expires
 * after its TTL.
 */
export function createUnloadRelease(request?: H3Event) {
  let unload: { url: string, apiKey: string, accessToken: string | null } | null = null

  /** Caches what the release needs. First call during setup: it reads the runtime config. */
  async function prepare(): Promise<void> {
    if (!unload) {
      const { url, key: apiKey } = readSupabasePublicConfig()
      unload = { url, apiKey, accessToken: null }
    }

    const { getSupabaseAuthClient } = await import('./supabase-auth')
    const { data } = await getSupabaseAuthClient(request).auth.getSession()
    unload.accessToken = data.session?.access_token ?? null
  }

  /** Calls the release function synchronously, so the request survives the tab closing. */
  function release(rpc: string, body: Record<string, unknown>): void {
    if (!unload?.accessToken) {
      return
    }

    void fetch(`${unload.url}/rest/v1/rpc/${rpc}`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'apikey': unload.apiKey,
        'Authorization': `Bearer ${unload.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }).catch(() => undefined)
  }

  return { prepare, release }
}
