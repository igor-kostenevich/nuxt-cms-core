import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js'
import { useRuntimeConfig } from '#imports'
import { CmsDataError, type CmsDataErrorCode } from './errors'

/**
 * Anonymous Supabase client for public reads.
 *
 * Session-aware access lives in `supabase-auth.ts`. These two files are the
 * only modules allowed to import the Supabase SDK. Everything above them works
 * with repositories, domain types and CmsDataError.
 */

let client: SupabaseClient | undefined

export function readSupabasePublicConfig(): { url: string, key: string } {
  const { supabaseUrl, supabaseKey } = useRuntimeConfig().public.cms

  if (!supabaseUrl || !supabaseKey) {
    throw new CmsDataError(
      'unknown',
      'CMS Core has no backend connection. Set SUPABASE_URL and SUPABASE_KEY in .env, '
      + 'or NUXT_PUBLIC_CMS_SUPABASE_URL and NUXT_PUBLIC_CMS_SUPABASE_KEY at runtime.',
    )
  }

  return { url: supabaseUrl, key: supabaseKey }
}

export function getSupabaseClient(): SupabaseClient {
  if (client) {
    return client
  }

  const { url, key } = readSupabasePublicConfig()

  // Public reads stay anonymous even when a CMS session cookie exists.
  // Attaching that session here would pull auth into the public bundle and
  // turn every public request into the `authenticated` role.
  client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  return client
}

function toErrorCode(code: string): CmsDataErrorCode {
  // Only the cases actually reachable today are mapped.
  if (code === 'PGRST116') {
    return 'not_found'
  }

  if (code === '42501' || code === 'PGRST301') {
    return 'permission_denied'
  }

  return 'unknown'
}

export function toCmsDataError(error: PostgrestError, context: string): CmsDataError {
  return new CmsDataError(toErrorCode(error.code), `${context}: ${error.message}`, {
    cause: error,
  })
}
