import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CmsDataError } from '../app/data/errors'
import { createMediaRepository } from '../app/data/repositories/media.repository'
import type { CmsStorageAdapter } from '../app/data/storage/storage-adapter'

vi.mock('#imports', () => ({ useRuntimeConfig: vi.fn() }))

const calls: { method: string, args: unknown[] }[] = []
const rpcResponses = new Map<string, { data: unknown, error: unknown }>()
let selectResponse: { data: unknown, error: unknown }

const row = {
  id: 'media-id',
  display_name: 'hero.jpg',
  storage_path: 'new.jpg',
  mime: 'image/jpeg',
  size: 10,
  width: 4,
  height: 3,
  default_alt: '',
  default_focal: null,
  created_at: '2026-11-17T10:00:00+00:00',
  updated_at: '2026-11-17T10:00:00+00:00',
}

// Records the PostgREST chain. `.rpc(name)` resolves with the response for
// that function; `.single()` and an awaited select resolve with `selectResponse`.
const builder: object = new Proxy({}, {
  get(_target, method: string) {
    if (method === 'then') {
      return undefined
    }

    return (...args: unknown[]) => {
      calls.push({ method, args })

      if (method === 'rpc') {
        return Promise.resolve(rpcResponses.get(args[0] as string) ?? { data: null, error: null })
      }

      if (method === 'single') {
        return Promise.resolve(selectResponse)
      }

      if (method === 'order' && calls.filter(call => call.method === 'order').length === 2) {
        return Promise.resolve(selectResponse)
      }

      return builder
    }
  },
})

vi.mock('../app/data/supabase-auth', () => ({
  getSupabaseAuthClient: () => builder,
}))

function fakeStorage() {
  return {
    upload: vi.fn<CmsStorageAdapter['upload']>().mockResolvedValue(undefined),
    remove: vi.fn<CmsStorageAdapter['remove']>().mockResolvedValue(undefined),
    publicUrl: (path: string) => `https://storage.test/${path}`,
  }
}

function argsOf(method: string) {
  return calls.filter(call => call.method === method).map(call => call.args)
}

const file = new File(['image'], 'hero.jpg', { type: 'image/jpeg' })

beforeEach(() => {
  calls.length = 0
  rpcResponses.clear()
  selectResponse = { data: row, error: null }
})

describe('MediaRepository.upload (C-71)', () => {
  it('puts the file into Storage under a new random path, then registers it', async () => {
    const storage = fakeStorage()
    rpcResponses.set('cms_media_create', { data: 'media-id', error: null })

    const media = await createMediaRepository(undefined, storage).upload({ file, width: 4, height: 3 })

    const [path, uploaded, type] = storage.upload.mock.calls[0]!
    expect(path).toMatch(/^[0-9a-f-]{36}\.jpg$/)
    expect(uploaded).toBe(file)
    expect(type).toBe('image/jpeg')
    expect(argsOf('rpc')).toEqual([['cms_media_create', {
      storage_path: path,
      display_name: 'hero.jpg',
      width: 4,
      height: 3,
    }]])
    expect(media.url).toBe('https://storage.test/new.jpg')
  })

  it('removes the uploaded file when the registration fails', async () => {
    const storage = fakeStorage()
    rpcResponses.set('cms_media_create', { data: null, error: { code: '42501', message: 'denied', details: '', hint: '' } })

    const error = await createMediaRepository(undefined, storage)
      .upload({ file, width: null, height: null })
      .catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(CmsDataError)
    expect((error as CmsDataError).code).toBe('permission_denied')
    expect(storage.remove).toHaveBeenCalledWith([storage.upload.mock.calls[0]![0]])
  })

  it('refuses a type the library does not take before any request', async () => {
    const storage = fakeStorage()
    const gif = new File(['gif'], 'a.gif', { type: 'image/gif' })

    const error = await createMediaRepository(undefined, storage)
      .upload({ file: gif, width: 1, height: 1 })
      .catch((cause: unknown) => cause)

    expect((error as CmsDataError).code).toBe('validation')
    expect(storage.upload).not.toHaveBeenCalled()
  })
})

describe('MediaRepository.replace (R-13)', () => {
  it('uploads a new object under the same id and removes the old one', async () => {
    const storage = fakeStorage()
    rpcResponses.set('cms_media_replace', { data: 'old.jpg', error: null })

    await createMediaRepository(undefined, storage).replace('media-id', { file, width: 4, height: 3 })

    const newPath = storage.upload.mock.calls[0]![0]
    expect(argsOf('rpc')[0]).toEqual(['cms_media_replace', {
      media_id: 'media-id',
      storage_path: newPath,
      width: 4,
      height: 3,
    }])
    expect(storage.remove).toHaveBeenCalledWith(['old.jpg'])
  })
})

describe('MediaRepository.list', () => {
  it('filters SVG and sorts by name', async () => {
    selectResponse = { data: [row], error: null }

    await createMediaRepository(undefined, fakeStorage()).list({ type: 'svg', sort: 'name' })

    expect(argsOf('eq')).toEqual([['mime', 'image/svg+xml']])
    expect(argsOf('order')[0]).toEqual(['display_name', { ascending: true }])
  })

  it('escapes LIKE wildcards in the search', async () => {
    selectResponse = { data: [], error: null }

    await createMediaRepository(undefined, fakeStorage()).list({ search: '50%_off' })

    expect(argsOf('ilike')).toEqual([['display_name', '%50\\%\\_off%']])
  })
})

describe('MediaRepository.getUsage (C-72)', () => {
  it('groups usage by media id', async () => {
    rpcResponses.set('cms_media_usage', {
      data: [
        { media_id: 'a', source: 'page', page_key: 'home', locale: 'en', is_draft: false },
        { media_id: 'a', source: 'brand.logo', page_key: null, locale: null, is_draft: false },
        { media_id: 'b', source: 'page', page_key: 'about', locale: 'en', is_draft: true },
      ],
      error: null,
    })

    const usage = await createMediaRepository(undefined, fakeStorage()).getUsage()

    expect(usage.get('a')).toEqual([
      { kind: 'page', pageKey: 'home', locale: 'en', draft: false },
      { kind: 'brand', slot: 'logo' },
    ])
    expect(usage.get('b')).toEqual([{ kind: 'page', pageKey: 'about', locale: 'en', draft: true }])
  })
})
