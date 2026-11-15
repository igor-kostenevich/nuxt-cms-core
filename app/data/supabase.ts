import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js'
import { useRuntimeConfig } from '#imports'
import type { Database } from './database.types'
import { CmsDataError, type CmsDataErrorCode } from './errors'

/**
 * Anonymous Supabase client for public reads.
 *
 * Session-aware access lives in `supabase-auth.ts`. These two files are the
 * only modules allowed to import the Supabase SDK. Everything above them works
 * with repositories, domain types and CmsDataError.
 */

let client: SupabaseClient<Database> | undefined

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

export function getSupabaseClient(): SupabaseClient<Database> {
  if (client) {
    return client
  }

  const { url, key } = readSupabasePublicConfig()

  // Public reads stay anonymous even when a CMS session cookie exists.
  // Attaching that session here would pull auth into the public bundle and
  // turn every public request into the `authenticated` role.
  client = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      // The session client uses the default key. A shared key makes GoTrue
      // treat these as two managers of one session.
      storageKey: 'cms-public',
    },
  })

  return client
}

/**
 * PostgREST and Postgres codes the Core reaches. The `CMS..` codes are raised
 * by the page editing functions (migration cms_page_drafts).
 */
const ERROR_CODES: Record<string, CmsDataErrorCode> = {
  PGRST116: 'not_found',
  P0002: 'not_found',
  '42501': 'permission_denied',
  PGRST301: 'permission_denied',
  '23514': 'validation',
  '23502': 'validation',
  CMSCF: 'conflict',
  CMSLK: 'locked',
  CMSLL: 'lock_lost',
}

function toErrorCode(code: string): CmsDataErrorCode {
  return (Object.hasOwn(ERROR_CODES, code) ? ERROR_CODES[code] : undefined) ?? 'unknown'
}

export function toCmsDataError(error: PostgrestError, context: string): CmsDataError {
  return new CmsDataError(toErrorCode(error.code), `${context}: ${error.message}`, {
    cause: error,
  })
}
