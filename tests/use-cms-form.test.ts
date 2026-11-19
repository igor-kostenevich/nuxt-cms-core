import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('#cms/forms', () => ({
  cmsForms: [{ key: 'contact', fields: [{ key: 'name', type: 'text', required: true, maxLength: 100 }] }],
}))
// `#imports` re-exports it from here; mocking `#imports` alone does not reach the composable.
vi.mock('#app/composables/router', () => ({ useRoute: () => ({ path: '/contact' }) }))
vi.mock('../app/primitives/locale', () => ({ useCmsLocaleState: () => ref(null) }))
vi.mock('../app/composables/useCmsText', () => ({ useCmsText: () => ({ t: (key: string) => key, has: () => false }) }))

// `$fetch` reaches the composable as an auto-import of ofetch.
const fetchMock = vi.fn()
vi.mock('ofetch', async (original) => {
  const fetch = Object.assign((...args: unknown[]) => fetchMock(...args), { create: () => fetch })
  return { ...await original<object>(), $fetch: fetch }
})

const { useCmsForm } = await import('../app/composables/useCmsForm')

type Answer = { ok: true } | { ok: false, data?: { status: string, errors?: { field: string, code: string }[] } }

const sent: { token: string, values: Record<string, unknown> }[] = []
let answers: Answer[] = []

beforeEach(() => {
  sent.length = 0
  answers = []
  fetchMock.mockImplementation(async (_url: string, options: { body: { token: string, values: Record<string, unknown> } }) => {
    sent.push(options.body)
    const answer = answers.shift() ?? { ok: true }

    if (!answer.ok) {
      throw Object.assign(new Error('refused'), { data: answer.data })
    }

    return { status: 'ok' }
  })
})

describe('useCmsForm', () => {
  it('starts a new sending after the server refused the token, with the same values', async () => {
    const contact = useCmsForm('contact')
    contact.values.name = 'Olena'
    await Promise.resolve()

    answers = [{ ok: false, data: { status: 'invalid', errors: [{ field: '_form', code: 'resubmit' }] } }, { ok: true }]

    expect(await contact.submit()).toBe(false)
    expect(contact.problem.value).toBe('invalid')
    expect(contact.fieldError('_form')).toBe('forms.errors.resubmit')
    expect(sent).toHaveLength(1)

    // Nothing is sent again by itself; the visitor presses Send.
    expect(await contact.submit()).toBe(true)
    expect(sent).toHaveLength(2)
    expect(sent[1]!.values).toEqual({ name: 'Olena' })
    expect(sent[1]!.token).not.toBe(sent[0]!.token)
    expect(contact.status.value).toBe('sent')
  })

  it('keeps the token for a retry after a lost answer, so the server stores it once', async () => {
    const contact = useCmsForm('contact')
    contact.values.name = 'Olena'
    await Promise.resolve()

    answers = [{ ok: false }, { ok: true }]

    expect(await contact.submit()).toBe(false)
    expect(contact.problem.value).toBe('network')
    expect(await contact.submit()).toBe(true)
    expect(sent[1]!.token).toBe(sent[0]!.token)
  })
})
