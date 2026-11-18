import { describe, expect, it, vi } from 'vitest'
import { CmsDataError } from '../app/data/errors'
import { createTextsRepository } from '../app/data/repositories/texts.repository'

vi.mock('#imports', () => ({ useRuntimeConfig: vi.fn() }))

let tables: Record<string, { data: unknown, error: unknown }> = {}
const queries: { table: string, calls: [string, unknown[]][] }[] = []

// `from(table)` starts a chain that resolves at `.returns()` with the table's response.
const client = {
  from(table: string) {
    const query = { table, calls: [] as [string, unknown[]][] }
    queries.push(query)
    const builder: Record<string, (...args: unknown[]) => unknown> = new Proxy({}, {
      get: (_target, method: string) => method === 'then'
        ? undefined
        : (...args: unknown[]) => {
            query.calls.push([method, args])
            return method === 'returns' ? Promise.resolve(tables[table]) : builder
          },
    })
    return builder
  },
}

vi.mock('../app/data/supabase-auth', () => ({ getSupabaseAuthClient: () => client }))

describe('TextsRepository.listContents', () => {
  it('joins draft and published per page and locale, keeping the draft time as a string', async () => {
    queries.length = 0
    tables = {
      cms_page_draft: {
        data: [{ locale: 'en', content: { 'hero.title': 'Hello' }, updated_at: '2026-11-18T12:36:42.041292+00:00', page: { key: 'home' } }],
        error: null,
      },
      cms_page_published: {
        data: [
          { locale: 'en', content: { 'hero.title': 'Hi' }, page: { key: 'home' } },
          { locale: 'uk', content: { hero: { title: 'Привіт' } }, page: { key: 'about' } },
          // A row the session cannot see the page of is left out.
          { locale: 'uk', content: {}, page: null },
        ],
        error: null,
      },
    }

    const contents = await createTextsRepository().listContents(['uk', 'en'])

    expect(contents).toEqual([
      { key: 'home', locale: 'en', draft: { 'hero.title': 'Hello' }, draftUpdatedAt: '2026-11-18T12:36:42.041292+00:00', published: { 'hero.title': 'Hi' } },
      { key: 'about', locale: 'uk', draft: null, draftUpdatedAt: null, published: { hero: { title: 'Привіт' } } },
    ])
    expect(typeof contents[0]!.draftUpdatedAt).toBe('string')
    expect(queries.map(query => [query.table, query.calls.find(([method]) => method === 'in')?.[1]])).toEqual([
      ['cms_page_draft', ['locale', ['uk', 'en']]],
      ['cms_page_published', ['locale', ['uk', 'en']]],
    ])
  })

  it('fails as a whole when either table fails', async () => {
    tables = {
      cms_page_draft: { data: [], error: null },
      cms_page_published: { data: null, error: { code: '42501', message: 'rejected', details: '', hint: '' } },
    }

    const error = await createTextsRepository().listContents(['uk']).catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(CmsDataError)
    expect((error as CmsDataError).code).toBe('permission_denied')
  })
})
