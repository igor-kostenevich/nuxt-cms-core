import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CmsDataError } from '../app/data/errors'
import { createLanguagesRepository } from '../app/data/repositories/languages.repository'

vi.mock('#imports', () => ({ useRuntimeConfig: vi.fn() }))

const calls: { client: 'anon' | 'session', method: string, args: unknown[] }[] = []
let response: { data: unknown, error: unknown }

// Records the PostgREST chain; `.returns()` and `.rpc()` resolve with `response`.
function recorder(client: 'anon' | 'session') {
  const builder: object = new Proxy({}, {
    get(_target, method: string) {
      if (method === 'then') {
        return undefined
      }

      return (...args: unknown[]) => {
        calls.push({ client, method, args })
        return ['returns', 'rpc'].includes(method) ? Promise.resolve(response) : builder
      }
    },
  })

  return builder
}

const anon = recorder('anon')
const session = recorder('session')

vi.mock('../app/data/supabase', async importOriginal => ({
  ...await importOriginal<typeof import('../app/data/supabase')>(),
  getSupabaseClient: () => anon,
}))

vi.mock('../app/data/supabase-auth', () => ({
  getSupabaseAuthClient: () => session,
}))

function argsOf(method: string) {
  return calls.filter(call => call.method === method).map(call => call.args)
}

beforeEach(() => {
  calls.length = 0
})

const rows = [
  { code: 'uk', name: 'Ukrainian', native_name: 'Українська', active: true, is_default: true },
  { code: 'en', name: 'English', native_name: 'English', active: true, is_default: false },
]

describe('LanguagesRepository', () => {
  it('reads the active languages for the public site in switcher order', async () => {
    response = { data: rows, error: null }

    await expect(createLanguagesRepository().listActive()).resolves.toEqual([
      { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', active: true, isDefault: true },
      { code: 'en', name: 'English', nativeName: 'English', active: true, isDefault: false },
    ])
    expect(calls.every(call => call.client === 'anon')).toBe(true)
    expect(argsOf('eq')).toEqual([['active', true]])
    expect(argsOf('order')).toEqual([['sort_order'], ['code']])
  })

  it('reads every language through the session client for Settings', async () => {
    response = { data: rows, error: null }

    await createLanguagesRepository().listAll()

    expect(calls.every(call => call.client === 'session')).toBe(true)
    expect(argsOf('eq')).toEqual([])
  })

  it('changes languages through database functions only', async () => {
    response = { data: null, error: null }
    const repository = createLanguagesRepository()

    await repository.add({ code: 'uk', name: 'Ukrainian', nativeName: 'Українська' }, { makeDefault: true })
    await repository.add({ code: 'de', name: 'German', nativeName: 'Deutsch' })
    await repository.setActive('de', false)
    await repository.reorder(['uk', 'de'])
    await repository.remove('de')

    expect(argsOf('rpc')).toEqual([
      ['cms_language_add', { code: 'uk', name: 'Ukrainian', native_name: 'Українська', make_default: true }],
      ['cms_language_add', { code: 'de', name: 'German', native_name: 'Deutsch', make_default: false }],
      ['cms_language_set_active', { code: 'de', active: false }],
      ['cms_language_reorder', { codes: ['uk', 'de'] }],
      ['cms_language_delete', { code: 'de' }],
    ])
    expect(calls.every(call => call.client === 'session')).toBe(true)
  })

  it.each([
    ['CMSCF', 'conflict'],
    ['23514', 'validation'],
    ['42501', 'permission_denied'],
  ])('maps %s to %s', async (code, expected) => {
    response = { data: null, error: { code, message: 'rejected', details: '', hint: '' } }

    const error = await createLanguagesRepository().remove('de').catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(CmsDataError)
    expect((error as CmsDataError).code).toBe(expected)
  })
})
