import type { CmsForm, CmsFormValues } from '../../app/types/forms'
import { hashClientAddress } from './client-address'
import { buildSearchText, cleanPagePath } from './form-submit'
import { getCmsServiceClient, readCmsSecret } from './supabase'

/**
 * Server-only data access of the form submit route (011): one RPC with the
 * secret key, which applies the rate limits, makes a retry idempotent and
 * writes the record. The route knows the outcome, not the backend.
 */

export type CmsFormStoreResult = 'ok' | 'token_reused' | 'rate_limited' | 'disabled' | 'unavailable'

/** Window of the limits in SQL (`window_seconds`), for logging once per window. */
const LIMIT_WINDOW_MS = 600_000
const loggedCeiling = new Map<string, number>()

/**
 * The ceiling of a form was hit: once per form, window and process, so a flood
 * shows in the log without filling it. Everyone gets `rate_limited` until the
 * window ends (README: Visitor address).
 */
function logCeiling(formKey: string) {
  const window = Math.floor(Date.now() / LIMIT_WINDOW_MS)

  if (loggedCeiling.get(formKey) !== window) {
    loggedCeiling.set(formKey, window)
    console.warn(`[nuxt-cms-core] forms: the form "${formKey}" reached its limit for all visitors (50 per 10 minutes); it refuses everyone until the window ends.`)
  }
}

export interface CmsFormStoreInput {
  form: CmsForm
  values: CmsFormValues
  token: string
  /** Normalized visitor address, or null when the server has no trustworthy one. */
  address: string | null
  page: string | null
  locale: string | null
}

/** False when the server has no secret key: submissions are refused before any work. */
export function cmsFormStoreReady(): boolean {
  return getCmsServiceClient() !== null
}

export async function storeCmsFormSubmission(input: CmsFormStoreInput): Promise<CmsFormStoreResult> {
  const client = getCmsServiceClient()

  if (!client) {
    return 'unavailable'
  }

  const { data, error } = await client.rpc('cms_form_submit', {
    form_key: input.form.key,
    payload: input.values,
    client_token: input.token,
    search_text: buildSearchText(input.form, input.values),
    // The generated types know no nullable RPC arguments; the function takes null
    // for these three (no visitor bucket, no page, no language).
    client_hash: (input.address === null ? null : hashClientAddress(input.address, readCmsSecret())) as string,
    page_path: cleanPagePath(input.page) as string,
    page_locale: input.locale as string,
  })

  if (error || !data?.[0]) {
    console.error('[nuxt-cms-core] forms: the submission was not stored:', error?.message ?? 'no result')
    return 'unavailable'
  }

  switch (data[0].status) {
    case 'ok':
    case 'duplicate':
      return 'ok'
    case 'form_limited':
      logCeiling(input.form.key)
      return 'rate_limited'
    case 'token_reused':
    case 'rate_limited':
    case 'disabled':
      return data[0].status
    default:
      return 'unavailable'
  }
}
