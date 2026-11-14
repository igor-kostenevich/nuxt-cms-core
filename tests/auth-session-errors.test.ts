import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { classifySessionError } from '../app/data/supabase-auth'

// The adapter reads runtime config through #imports, which a node test has no
// Nuxt app for. Classification does not need it.
vi.mock('../app/data/supabase', () => ({ readSupabasePublicConfig: vi.fn() }))

describe('classifySessionError', () => {
  it('treats a missing session as signed out', () => {
    expect(classifySessionError(new AuthSessionMissingError())).toBe('missing')
  })

  it.each([
    ['refresh_token_not_found', 400],
    ['refresh_token_already_used', 400],
    ['bad_jwt', 401],
    ['user_not_found', 403],
  ])('treats %s (%i) as a stale session', (code, status) => {
    expect(classifySessionError(new AuthApiError('rejected', status, code))).toBe('stale')
  })

  it('keeps server, rate limit and network trouble as failures', () => {
    expect(classifySessionError(new AuthApiError('down', 500, 'unexpected_failure'))).toBe('failure')
    expect(classifySessionError(new AuthApiError('slow down', 429, 'over_request_rate_limit'))).toBe('failure')
    expect(classifySessionError(new AuthRetryableFetchError('offline', 0))).toBe('failure')
    expect(classifySessionError(new Error('boom'))).toBe('failure')
  })
})
