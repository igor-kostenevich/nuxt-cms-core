import { beforeEach, describe, expect, it, vi } from 'vitest'
import { storeCmsFormSubmission } from '../server/cms/form-store'
import { resolveCmsForms } from '../src/forms'

// The adapter tells a new submission from a retry of the same sending: only
// a new one runs cms:forms:submitted (C-97). The route answers `ok` to both.

let response: { data: unknown, error: unknown } = { data: null, error: null }

vi.mock('../server/cms/supabase', () => ({
  getCmsServiceClient: () => ({ rpc: async () => response }),
  readCmsSecret: () => 'test-secret',
}))

const [form] = resolveCmsForms({ contact: { fields: [{ key: 'email', type: 'email', role: 'email', required: true }] } }).forms

const input = { form: form!, values: { email: 'a@example.test' }, token: '00000000-0000-4000-8000-000000000001', address: null, page: '/contact', locale: 'en' }

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('storeCmsFormSubmission', () => {
  it('reports a new row as created, with its id', async () => {
    response = { data: [{ status: 'ok', submission_id: 'new-id' }], error: null }
    await expect(storeCmsFormSubmission(input)).resolves.toEqual({ status: 'created', submissionId: 'new-id' })
  })

  it('reports a retry of a stored sending as duplicate, without the id', async () => {
    response = { data: [{ status: 'duplicate', submission_id: 'old-id' }], error: null }
    await expect(storeCmsFormSubmission(input)).resolves.toEqual({ status: 'duplicate' })
  })

  it('keeps the other outcomes', async () => {
    for (const [status, expected] of [
      ['token_reused', 'token_reused'],
      ['rate_limited', 'rate_limited'],
      ['form_limited', 'rate_limited'],
      ['disabled', 'disabled'],
      ['something_new', 'unavailable'],
    ]) {
      response = { data: [{ status, submission_id: null }], error: null }
      await expect(storeCmsFormSubmission(input)).resolves.toEqual({ status: expected })
    }
  })

  it('is unavailable on an error, an empty result, or ok without an id', async () => {
    for (const next of [
      { data: null, error: { message: 'down' } },
      { data: [], error: null },
      { data: [{ status: 'ok', submission_id: null }], error: null },
    ]) {
      response = next
      await expect(storeCmsFormSubmission(input)).resolves.toEqual({ status: 'unavailable' })
    }
  })
})
