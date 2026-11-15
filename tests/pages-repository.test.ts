import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CmsDataError } from '../app/data/errors'
import { createPagesRepository } from '../app/data/repositories/pages.repository'

vi.mock('#imports', () => ({ useRuntimeConfig: vi.fn() }))

const calls: { client: 'anon' | 'session', method: string, args: unknown[] }[] = []
let response: { data: unknown, error: unknown }

// Records the PostgREST chain and resolves `.maybeSingle()` / `.rpc()` with `response`.
// `client` tells the anonymous and the session client apart.
function recorder(client: 'anon' | 'session') {
  const builder: object = new Proxy({}, {
    get(_target, method: string) {
      // Not a thenable: the session client is returned from an async import,
      // and `await` would otherwise call `then` and wait forever.
      if (method === 'then') {
        return undefined
      }

      return (...args: unknown[]) => {
        calls.push({ client, method, args })
        return method === 'maybeSingle' || method === 'rpc' ? Promise.resolve(response) : builder
      }
    },
  })

  return builder
}

const anonBuilder = recorder('anon')
const sessionBuilder = recorder('session')

vi.mock('../app/data/supabase', async (importOriginal) => ({
  ...await importOriginal<typeof import('../app/data/supabase')>(),
  getSupabaseClient: () => anonBuilder,
}))

vi.mock('../app/data/supabase-auth', () => ({
  getSupabaseAuthClient: () => sessionBuilder,
}))

function argsOf(method: string) {
  return calls.filter(call => call.method === method).map(call => call.args)
}

beforeEach(() => {
  calls.length = 0
})

describe('PagesRepository.getByKey', () => {
  it('reads published content by page key and locale in one request', async () => {
    response = {
      data: {
        locale: 'uk',
        content: { hero: { title: 'Title' } },
        published_at: '2026-11-15T12:00:00+00:00',
        page: { key: 'home' },
      },
      error: null,
    }

    await expect(createPagesRepository().getByKey('home', 'uk')).resolves.toEqual({
      key: 'home',
      locale: 'uk',
      content: { hero: { title: 'Title' } },
      publishedAt: '2026-11-15T12:00:00+00:00',
    })

    expect(argsOf('from')).toEqual([['cms_page_published']])
    expect(argsOf('eq')).toEqual([['page.key', 'home'], ['locale', 'uk']])
    // The public read never touches the session client.
    expect(calls.every(call => call.client === 'anon')).toBe(true)
  })

  // A code-defined page without a row renders its defaults, so this is not an error.
  it('returns null when the page has no published content', async () => {
    response = { data: null, error: null }
    await expect(createPagesRepository().getByKey('about', 'uk')).resolves.toBeNull()
  })

  it('rejects content that is not an object', async () => {
    response = {
      data: { locale: 'uk', content: [], published_at: '2026-11-15T12:00:00+00:00', page: { key: 'home' } },
      error: null,
    }

    const error = await createPagesRepository().getByKey('home', 'uk').catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(CmsDataError)
    expect((error as CmsDataError).code).toBe('unknown')
  })

  it('maps backend errors through the adapter', async () => {
    response = { data: null, error: { code: '42501', message: 'rejected', details: '', hint: '' } }

    const error = await createPagesRepository().getByKey('home', 'uk').catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(CmsDataError)
    expect((error as CmsDataError).code).toBe('permission_denied')
  })
})

function postgrestError(code: string) {
  return { code, message: 'rejected', details: '', hint: '' }
}

async function rejection(promise: Promise<unknown>): Promise<CmsDataError> {
  const error = await promise.catch((cause: unknown) => cause)
  expect(error).toBeInstanceOf(CmsDataError)
  return error as CmsDataError
}

describe('PagesRepository.getDraft', () => {
  it('reads the draft through the session client', async () => {
    response = {
      data: {
        locale: 'uk',
        content: { hero: { title: 'Draft' } },
        updated_at: '2026-11-15T13:00:00+00:00',
        page: { key: 'home' },
      },
      error: null,
    }

    await expect(createPagesRepository().getDraft('home', 'uk')).resolves.toEqual({
      key: 'home',
      locale: 'uk',
      content: { hero: { title: 'Draft' } },
      updatedAt: '2026-11-15T13:00:00+00:00',
    })

    expect(calls.every(call => call.client === 'session')).toBe(true)
    expect(argsOf('from')).toEqual([['cms_page_draft']])
    expect(argsOf('eq')).toEqual([['page.key', 'home'], ['locale', 'uk']])
  })

  it('returns null when the page has no unpublished changes', async () => {
    response = { data: null, error: null }
    await expect(createPagesRepository().getDraft('home', 'uk')).resolves.toBeNull()
  })
})

describe('PagesRepository editing functions', () => {
  it('saves the draft with the lock token and returns the save time', async () => {
    response = { data: '2026-11-15T13:00:00+00:00', error: null }

    await expect(
      createPagesRepository().saveDraft('home', 'uk', { hero: { title: 'New' } }, 'token'),
    ).resolves.toBe('2026-11-15T13:00:00+00:00')

    expect(argsOf('rpc')).toEqual([['cms_page_save_draft', {
      page_key: 'home',
      page_locale: 'uk',
      content: { hero: { title: 'New' } },
      lock_token: 'token',
    }]])
  })

  // Saving the published content removes the draft: nothing is left to publish.
  it('returns null when no draft remains after saving', async () => {
    response = { data: null, error: null }
    await expect(createPagesRepository().saveDraft('home', 'uk', {}, 'token')).resolves.toBeNull()
  })

  it('publishes the saved draft without sending content', async () => {
    response = { data: '2026-11-15T14:00:00+00:00', error: null }

    await expect(createPagesRepository().publish('home', 'uk', 'token')).resolves.toBe('2026-11-15T14:00:00+00:00')
    expect(argsOf('rpc')).toEqual([['cms_page_publish', { page_key: 'home', page_locale: 'uk', lock_token: 'token' }]])
  })

  it('restores without replacing a draft unless asked to', async () => {
    response = { data: null, error: null }
    const repository = createPagesRepository()

    await repository.restore('home', 'uk', 'revision', 'token')
    await repository.restore('home', 'uk', 'revision', 'token', { replaceDraft: true })

    expect(argsOf('rpc').map(([, args]) => (args as { replace_draft: boolean }).replace_draft)).toEqual([false, true])
  })

  it('acquires, keeps, releases and force unlocks the Content Lock', async () => {
    response = { data: 'token', error: null }
    const repository = createPagesRepository()

    await expect(repository.acquireLock('home')).resolves.toBe('token')
    await repository.heartbeatLock('home', 'token')
    await repository.releaseLock('home', 'token')
    await repository.forceUnlock('home')

    expect(argsOf('rpc')).toEqual([
      ['cms_page_lock_acquire', { page_key: 'home' }],
      ['cms_page_lock_heartbeat', { page_key: 'home', lock_token: 'token' }],
      ['cms_page_lock_release', { page_key: 'home', lock_token: 'token' }],
      ['cms_page_lock_force_unlock', { page_key: 'home' }],
    ])
  })

  it.each([
    ['CMSLK', 'locked'],
    ['CMSLL', 'lock_lost'],
    ['CMSCF', 'conflict'],
    ['P0002', 'not_found'],
    ['23514', 'validation'],
    ['42501', 'permission_denied'],
  ])('maps the function error %s to %s', async (code, expected) => {
    response = { data: null, error: postgrestError(code) }
    expect((await rejection(createPagesRepository().publish('home', 'uk', 'token'))).code).toBe(expected)
  })
})
