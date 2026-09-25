import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js'
import { useRuntimeConfig } from '#imports'
import { CmsDataError, type CmsDataErrorCode } from './errors'

/**
 * The only module in CMS Core that is allowed to know about Supabase.
 * Everything above it works with repositories, domain types and CmsDataError,
 * which is what keeps the backend replaceable.
 */

let client: SupabaseClient | undefined

export function getSupabaseClient(): SupabaseClient {
  if (client) {
    return client
  }

  const { supabaseUrl, supabaseKey } = useRuntimeConfig().public.cms

  if (!supabaseUrl || !supabaseKey) {
    throw new CmsDataError(
      'unknown',
      'CMS Core has no backend connection. Set SUPABASE_URL and SUPABASE_KEY in .env, '
      + 'or NUXT_PUBLIC_CMS_SUPABASE_URL and NUXT_PUBLIC_CMS_SUPABASE_KEY at runtime.',
    )
  }

  // Anonymous read-only access for now, so there is no session to persist.
  // User sessions arrive with the auth block and will need a request-scoped client.
  client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
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
