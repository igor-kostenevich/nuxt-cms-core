import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../app/data/database.types'

/**
 * The privileged Supabase client (011, D-31): server-only, with the secret
 * key, so it bypasses RLS. It lives under `server/` and is never imported by
 * `app/`: the browser bundle cannot reach it. Only the server adapters of Core
 * use it (`form-store.ts`: a form submission calls one RPC); routes do not.
 *
 * `useRuntimeConfig` is the Nitro auto-import (server directory of the layer).
 *
 * Isolated from the visitor: no cookies, no session, no `Authorization`
 * header of the request. It is the same for every request, so it is cached
 * per process.
 */

let cached: { url: string, secret: string, client: SupabaseClient<Database> } | undefined

/** The secret: NUXT_CMS_SUPABASE_SECRET (runtime config), else SUPABASE_SECRET at runtime. */
export function readCmsSecret(): string {
  const config = useRuntimeConfig() as { cms?: { supabaseSecret?: string } }
  return config.cms?.supabaseSecret || process.env.SUPABASE_SECRET || ''
}

/** Null when the server has no secret key: the caller answers "unavailable". */
export function getCmsServiceClient(): SupabaseClient<Database> | null {
  const url = useRuntimeConfig().public.cms?.supabaseUrl
  const secret = readCmsSecret()

  if (!url || !secret) {
    return null
  }

  if (cached?.url === url && cached.secret === secret) {
    return cached.client
  }

  const client = createClient<Database>(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  cached = { url, secret, client }
  return client
}

