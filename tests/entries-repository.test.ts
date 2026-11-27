import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CmsDataError } from '../app/data/errors'
import { createEntriesRepository } from '../app/data/repositories/entries.repository'
import { createPagesRepository } from '../app/data/repositories/pages.repository'

vi.mock('#imports', () => ({ useRuntimeConfig: vi.fn() }))

const calls: { method: string, args: unknown[] }[] = []
let response: { data: unknown, error: unknown }

// Records the PostgREST chain of the session client; `.rpc()`, `.maybeSingle()`
// and `.limit()` resolve with `response`. Not a thenable (see pages-repository.test.ts).
const session: object = new Proxy({}, {
  get(_target, method: string) {
    if (method === 'then') {
      return undefined
    }

    if (method === 'auth') {
      return { getSession: async () => ({ data: { session: { access_token: 'access-1' } } }) }
    }

    return (...args: unknown[]) => {
      calls.push({ method, args })

      if (method === 'rpc') {
        return Object.assign(Promise.resolve(response), {
          maybeSingle: () => Promise.resolve(response),
        })
      }

      return ['maybeSingle', 'limit'].includes(method) ? Promise.resolve(response) : session
    }
  },
})

vi.mock('../app/data/supabase-auth', () => ({ getSupabaseAuthClient: () => session }))
vi.mock('../app/data/storage/supabase-storage', () => ({
  createSupabaseStorage: () => ({ publicUrl: (path: string) => `https://storage.test/${path}`, upload: vi.fn(), remove: vi.fn() }),
}))
vi.mock('../app/data/supabase', async (original) => {
  const actual = await original<typeof import('../app/data/supabase')>()
  return {
    ...actual,
    readSupabasePublicConfig: () => ({ url: 'https://db.test', key: 'publishable-1' }),
    getSupabaseClient: () => session,
  }
})

const ENTRY = '00000000-0000-4000-8000-000000000e01'
const REVISION = '00000000-0000-4000-8000-000000000r01'.replace('r', 'a')

function rpc(): [string, Record<string, unknown>] {
  const call = calls.find(item => item.method === 'rpc')
  return call?.args as [string, Record<string, unknown>]
}

beforeEach(() => {
  calls.length = 0
  response = { data: null, error: null }
})

describe('EntriesRepository', () => {
  it('creates with the client id, the lock flag and the bootstrap locale', async () => {
    response = { data: { id: ENTRY, draft_updated_at: '2026-11-24T10:00:00Z', lock_token: 'token-1' }, error: null }

    await expect(createEntriesRepository(undefined, { bootstrapLocale: 'uk' })
      .create('vacancy', { title: 'Designer' }, { id: ENTRY, takeLock: true }))
      .resolves.toEqual({ id: ENTRY, draftUpdatedAt: '2026-11-24T10:00:00Z', lockToken: 'token-1' })

    expect(rpc()).toEqual(['cms_entry_create', {
      entry_type: 'vacancy',
      content: { title: 'Designer' },
      take_lock: true,
      entry_id: ENTRY,
      bootstrap_locale: 'uk',
    }])
  })

  it('a create without the lock returns no token', async () => {
    response = { data: { id: ENTRY, draft_updated_at: '2026-11-24T10:00:00Z', lock_token: null }, error: null }

    const created = await createEntriesRepository().create('post', { title: 'T', slug: 't' }, { id: ENTRY, takeLock: false })

    expect(created.lockToken).toBeNull()
    expect(rpc()[1].take_lock).toBe(false)
  })

  it('names a taken address and media in use (CMSSL, CMSMU)', async () => {
    response = { data: null, error: { code: 'CMSSL', message: 'taken', details: '', hint: '' } }
    const taken = await createEntriesRepository().publish('post', ENTRY, 'en', 'token-1').catch((cause: unknown) => cause)

    expect(taken).toBeInstanceOf(CmsDataError)
    expect((taken as CmsDataError).code).toBe('slug_taken')

    response = { data: null, error: { code: 'CMSMU', message: 'used', details: '', hint: '' } }
    const used = await createEntriesRepository().archive('post', ENTRY).catch((cause: unknown) => cause)
    expect((used as CmsDataError).code).toBe('media_in_use')
  })

  it('publishes without requiring an address unless asked', async () => {
    response = { data: '2026-11-24T11:00:00Z', error: null }
    const repository = createEntriesRepository()

    await repository.publish('vacancy', ENTRY, 'en', 'token-1')
    expect(rpc()[1]).toMatchObject({ entry_type: 'vacancy', entry_id: ENTRY, require_slug: false })

    calls.length = 0
    await repository.publish('post', ENTRY, 'en', 'token-1', { requireSlug: true })
    expect(rpc()[1]).toMatchObject({ require_slug: true })
  })

  it('reads the editable state by type and id, with media', async () => {
    response = {
      data: {
        default_locale: 'en',
        base: null,
        draft: { title: 'Draft' },
        draft_updated_at: '2026-11-24T10:00:00Z',
        published: null,
        published_at: null,
        media: [],
      },
      error: null,
    }

    await expect(createEntriesRepository().getEditable('post', ENTRY, null)).resolves.toMatchObject({
      key: ENTRY,
      locale: 'en',
      defaultLocale: 'en',
      draft: { title: 'Draft' },
      media: {},
    })
    expect(rpc()).toEqual(['cms_entry_get_editable', { entry_type: 'post', entry_id: ENTRY, entry_locale: null, bootstrap_locale: 'en' }])
  })

  it('deletes an entry for good with the lock of the session, and names an entry still on the site (CMSEL)', async () => {
    response = { data: null, error: null }
    calls.length = 0
    await createEntriesRepository().remove('post', ENTRY, 'token-1')
    expect(rpc()).toEqual(['cms_entry_delete', { entry_type: 'post', entry_id: ENTRY, lock_token: 'token-1' }])

    response = { data: null, error: { code: 'CMSEL', message: 'live', details: '', hint: '' } }
    await expect(createEntriesRepository().remove('post', ENTRY, 'token-1')).rejects.toMatchObject({ code: 'entry_live' })
  })

  it('takes an entry off the site under the lock of the editing session', async () => {
    response = { data: null, error: null }
    calls.length = 0
    await createEntriesRepository().takeOff('post', ENTRY, 'token-1')
    expect(rpc()).toEqual(['cms_entry_take_off', { entry_type: 'post', entry_id: ENTRY, lock_token: 'token-1' }])
  })

  it('tells the editor that an entry is off the site', async () => {
    response = {
      data: { default_locale: 'en', base: null, draft: null, draft_updated_at: null, published: { title: 'Was live' }, published_at: '2026-11-20T10:00:00Z', media: [], off_site: true },
      error: null,
    }

    await expect(createEntriesRepository().getEditable('post', ENTRY, null)).resolves.toMatchObject({ offSite: true })

    response = {
      data: { default_locale: 'en', base: null, draft: null, draft_updated_at: null, published: { title: 'Live' }, published_at: '2026-11-20T10:00:00Z', media: [], off_site: false },
      error: null,
    }

    await expect(createEntriesRepository().getEditable('post', ENTRY, null)).resolves.toMatchObject({ offSite: false })
  })

  it('maps the admin list: rows, total of every match, order version', async () => {
    response = {
      data: [
        { id: ENTRY, title: 'Designer', slug: null, status: 'changed', updated_at: 'u', published_at: 'p', first_published_at: 'f', archived_at: null, sort_order: 0, total: 7, order_version: 'v1' },
      ],
      error: null,
    }

    await expect(createEntriesRepository().list('vacancy', { search: '  des ', sort: 'title', limit: 20, offset: 40, statuses: ['draft', 'changed'] })).resolves.toEqual({
      items: [{ id: ENTRY, title: 'Designer', slug: null, status: 'changed', updatedAt: 'u', publishedAt: 'p', firstPublishedAt: 'f', archivedAt: null, sortOrder: 0 }],
      total: 7,
      orderVersion: 'v1',
    })
    expect(rpc()).toEqual(['cms_entries_admin_list', {
      entry_type: 'vacancy',
      search: 'des',
      archived: false,
      sort: 'title',
      page_limit: 20,
      page_offset: 40,
      bootstrap_locale: 'en',
      status_filter: ['draft', 'changed'],
    }])
  })

  it('an empty list has total 0 and no version', async () => {
    response = { data: [], error: null }
    await expect(createEntriesRepository().list('vacancy')).resolves.toEqual({ items: [], total: 0, orderVersion: null })
  })

  it('refuses an unknown status from the backend', async () => {
    response = { data: [{ id: ENTRY, status: 'deleted', total: 1 }], error: null }
    await expect(createEntriesRepository().list('vacancy')).rejects.toBeInstanceOf(CmsDataError)
  })

  it('reorders with the full list and the version read', async () => {
    response = { data: 'v2', error: null }

    await expect(createEntriesRepository().reorder('vacancy', [ENTRY], 'v1')).resolves.toBe('v2')
    expect(rpc()).toEqual(['cms_entry_reorder', { entry_type: 'vacancy', ids: [ENTRY], expected_version: 'v1' }])
  })

  it('checks an address: ok, invalid, taken with the holder', async () => {
    const repository = createEntriesRepository()

    response = { data: { status: 'ok', holder_title: null, holder_archived: null }, error: null }
    await expect(repository.checkSlug('post', null, 'en', 'kava')).resolves.toEqual({ status: 'ok' })

    response = { data: { status: 'invalid', holder_title: null, holder_archived: null }, error: null }
    await expect(repository.checkSlug('post', null, 'en', 'Kava')).resolves.toEqual({ status: 'invalid' })

    response = { data: { status: 'taken', holder_title: 'Old', holder_archived: true }, error: null }
    await expect(repository.checkSlug('post', ENTRY, 'en', 'kava')).resolves.toEqual({ status: 'taken', holderTitle: 'Old', holderArchived: true })
  })

  it('makes no request for ids that are not uuids', async () => {
    const repository = createEntriesRepository()

    await expect(repository.status(['nope', ''])).resolves.toEqual([])
    await expect(repository.getRevision('nope', ENTRY, 'en')).resolves.toBeNull()
    await expect(repository.getRevision(REVISION, 'nope', 'en')).resolves.toBeNull()
    expect(calls).toEqual([])
  })

  it('reads revisions of the entry with named columns, newest first', async () => {
    response = { data: [{ id: REVISION, locale: 'en', created_at: '2026-11-24T12:00:00Z' }], error: null }

    await expect(createEntriesRepository().listRevisions(ENTRY, 'en')).resolves.toEqual([
      { id: REVISION, locale: 'en', createdAt: '2026-11-24T12:00:00Z' },
    ])
    expect(calls.find(call => call.method === 'from')?.args).toEqual(['cms_page_revisions'])
    expect(calls.find(call => call.method === 'select')?.args).toEqual(['id, locale, created_at'])
    expect(calls.filter(call => call.method === 'eq').map(call => call.args)).toEqual([['page_id', ENTRY], ['locale', 'en']])
  })

  it('never selects every column (cms_entries hides created_by)', () => {
    const source = readFileSync(new URL('../app/data/repositories/entries.repository.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/select\(\s*['"`]\*/)
    expect(source).not.toMatch(/from\(\s*['"`]cms_entries['"`]\s*\)/)
  })
})

describe('Lock release on tab close', () => {
  it('sends the entry release with keepalive once prepared, and nothing before', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null)))
    vi.stubGlobal('fetch', fetchMock)

    const repository = createEntriesRepository()
    repository.releaseLockOnUnload('vacancy', ENTRY, 'token-1')
    expect(fetchMock).not.toHaveBeenCalled()

    await repository.prepareUnloadRelease()
    repository.releaseLockOnUnload('vacancy', ENTRY, 'token-1')

    expect(fetchMock).toHaveBeenCalledWith('https://db.test/rest/v1/rpc/cms_entry_lock_release', expect.objectContaining({
      method: 'POST',
      keepalive: true,
      headers: expect.objectContaining({ apikey: 'publishable-1', Authorization: 'Bearer access-1' }),
      body: JSON.stringify({ entry_type: 'vacancy', entry_id: ENTRY, lock_token: 'token-1' }),
    }))
    vi.unstubAllGlobals()
  })

  it('pages release the same way as before', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null)))
    vi.stubGlobal('fetch', fetchMock)

    const repository = createPagesRepository()
    await repository.prepareUnloadRelease()
    repository.releaseLockOnUnload('home', 'token-2')

    expect(fetchMock).toHaveBeenCalledWith('https://db.test/rest/v1/rpc/cms_page_lock_release', expect.objectContaining({
      keepalive: true,
      body: JSON.stringify({ page_key: 'home', lock_token: 'token-2' }),
    }))
    vi.unstubAllGlobals()
  })
})

describe('Public reads of entries (stage 3)', () => {
  it('reads one entry by address with the anonymous client: translation applied, media, slugs', async () => {
    response = {
      data: {
        id: ENTRY,
        default_locale: 'en',
        base: { title: 'Kava', slug: 'kava', body: 'Original' },
        base_published_at: '2026-11-20T10:00:00Z',
        translation: { title: 'Кава', slug: 'kava-uk' },
        translation_published_at: '2026-11-21T10:00:00Z',
        first_published_at: '2026-11-20T10:00:00Z',
        media: [],
        slugs: { en: 'kava', uk: 'kava-uk', bad: 3 },
      },
      error: null,
    }

    await expect(createEntriesRepository().getPublished('post', 'kava-uk', 'uk')).resolves.toEqual({
      id: ENTRY,
      type: 'post',
      locale: 'uk',
      defaultLocale: 'en',
      content: { title: 'Кава', slug: 'kava-uk', body: 'Original' },
      publishedAt: '2026-11-21T10:00:00Z',
      firstPublishedAt: '2026-11-20T10:00:00Z',
      media: {},
      translated: true,
      slug: 'kava-uk',
      slugs: { en: 'kava', uk: 'kava-uk' },
    })
    expect(rpc()).toEqual(['cms_entry_get_localized', { entry_type: 'post', slug: 'kava-uk', entry_locale: 'uk', bootstrap_locale: 'en' }])
  })

  it('no public entry: null (the page decides the 404)', async () => {
    response = { data: null, error: null }
    await expect(createEntriesRepository().getPublished('post', 'nope', null)).resolves.toBeNull()
  })

  it('an untranslated entry in another language is marked, and falls back to the original', async () => {
    response = {
      data: [{ id: ENTRY, default_locale: 'en', base: { title: 'Chai' }, base_published_at: 'p', translation: null, translation_published_at: null, first_published_at: 'f', slug: 'chai', media: [], total: 1 }],
      error: null,
    }

    const list = await createEntriesRepository().listPublished('post', 'uk', { limit: 3 })

    expect(list.total).toBe(1)
    expect(list.entries[0]).toMatchObject({ locale: 'uk', defaultLocale: 'en', content: { title: 'Chai' }, translated: false, slug: 'chai' })
    expect(rpc()[1]).toMatchObject({ entry_type: 'post', entry_locale: 'uk', sort: 'newest', page_limit: 3, page_offset: 0 })
  })

  it('chosen ids: as many as chosen, invalid ones dropped, none left means no request', async () => {
    response = { data: [], error: null }
    const repository = createEntriesRepository()

    await expect(repository.listPublished('post', null, { ids: ['nope'] })).resolves.toEqual({ entries: [], total: 0 })
    expect(calls).toEqual([])

    await repository.listPublished('post', null, { ids: [ENTRY, 'nope'] })
    expect(rpc()[1]).toMatchObject({ ids: [ENTRY], page_limit: 1 })
  })

  it('more than 100 ids is refused before the request (the server refuses too, 23514)', async () => {
    const ids = Array.from({ length: 101 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`)

    await expect(createEntriesRepository().listPublished('post', null, { ids })).rejects.toMatchObject({ code: 'validation' })
    expect(calls).toEqual([])
  })
})
