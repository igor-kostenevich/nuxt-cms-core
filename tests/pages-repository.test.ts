import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CmsDataError } from '../app/data/errors'
import { createPagesRepository } from '../app/data/repositories/pages.repository'

vi.mock('#imports', () => ({ useRuntimeConfig: vi.fn() }))

const calls: { method: string, args: unknown[] }[] = []
let response: { data: unknown, error: unknown }

// Records the PostgREST chain and resolves `.maybeSingle()` with `response`.
const builder = new Proxy({}, {
  get(_target, method: string) {
    return (...args: unknown[]) => {
      calls.push({ method, args })
      return method === 'maybeSingle' ? Promise.resolve(response) : builder
    }
  },
})

vi.mock('../app/data/supabase', async (importOriginal) => ({
  ...await importOriginal<typeof import('../app/data/supabase')>(),
  getSupabaseClient: () => builder,
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
