import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CmsDataError } from '../app/data/errors'
import { createPagesRepository } from '../app/data/repositories/pages.repository'

vi.mock('#imports', () => ({ useRuntimeConfig: vi.fn() }))

const calls: { client: 'anon' | 'session', method: string, args: unknown[] }[] = []
let response: { data: unknown, error: unknown }

// Records the PostgREST chain and resolves `.maybeSingle()` / `.rpc()` / `.limit()` with `response`.
// `.rpc()` is awaited directly or continued with `.maybeSingle()`.
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

        if (method === 'rpc') {
          return Object.assign(Promise.resolve(response), {
            maybeSingle: (...rest: unknown[]) => {
              calls.push({ client, method: 'maybeSingle', args: rest })
              return Promise.resolve(response)
            },
          })
        }

        return ['maybeSingle', 'limit'].includes(method) ? Promise.resolve(response) : builder
      }
    },
  })

  return builder
}

vi.mock('../app/data/storage/supabase-storage', () => ({
  createSupabaseStorage: () => ({
    publicUrl: (path: string) => `https://storage.test/cms-media/${path}`,
    upload: vi.fn(),
    remove: vi.fn(),
  }),
}))

const mediaRow = {
  id: '00000000-0000-4000-8000-000000000001',
  display_name: 'hero.jpg',
  storage_path: '3f2c0a4e-0000-4000-8000-000000000000.jpg',
  mime: 'image/jpeg',
  size: 1024,
  width: 1600,
  height: 900,
  default_alt: 'Studio',
  default_focal: { x: 40, y: 60 },
  created_at: '2026-11-17T10:00:00+00:00',
  updated_at: '2026-11-17T10:00:00+00:00',
}

const media = {
  [mediaRow.id]: {
    id: mediaRow.id,
    name: 'hero.jpg',
    url: `https://storage.test/cms-media/${mediaRow.storage_path}`,
    mime: 'image/jpeg',
    size: 1024,
    width: 1600,
    height: 900,
    defaultAlt: 'Studio',
    defaultFocal: { x: 40, y: 60 },
    createdAt: '2026-11-17T10:00:00+00:00',
    updatedAt: '2026-11-17T10:00:00+00:00',
  },
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

function localizedRow(overrides: Record<string, unknown> = {}) {
  return {
    default_locale: 'uk',
    base: { hero: { title: 'Заголовок', image: { mediaId: mediaRow.id, alt: 'Студія' } }, cta: { label: 'Почати', href: '/about' } },
    base_published_at: '2026-11-15T12:00:00+00:00',
    translation: null,
    translation_published_at: null,
    media: [mediaRow],
    locales: ['uk'],
    ...overrides,
  }
}

describe('PagesRepository.getByKey', () => {
  it('reads published content and its media by page key and locale in one request', async () => {
    response = { data: localizedRow(), error: null }

    await expect(createPagesRepository(undefined, { bootstrapLocale: 'uk' }).getByKey('home', 'uk')).resolves.toEqual({
      key: 'home',
      locale: 'uk',
      content: { hero: { title: 'Заголовок', image: { mediaId: mediaRow.id, alt: 'Студія' } }, cta: { label: 'Почати', href: '/about' } },
      publishedAt: '2026-11-15T12:00:00+00:00',
      media,
      defaultLocale: 'uk',
      translated: true,
      locales: ['uk'],
    })

    expect(argsOf('rpc')).toEqual([
      ['cms_page_get_localized', { page_key: 'home', page_locale: 'uk', bootstrap_locale: 'uk' }],
    ])
    // The public read never touches the session client.
    expect(calls.every(call => call.client === 'anon')).toBe(true)
  })

  it('applies the translation of the locale to the default locale (C-78)', async () => {
    response = {
      data: localizedRow({
        translation: { 'hero.title': 'Title', 'cta.label': 'Start', 'hero.image.alt': 'Studio' },
        translation_published_at: '2026-11-16T09:00:00+00:00',
        locales: ['uk', 'en'],
      }),
      error: null,
    }

    const page = await createPagesRepository().getByKey('home', 'en')

    expect(page?.content).toEqual({
      hero: { title: 'Title', image: { mediaId: mediaRow.id, alt: 'Studio' } },
      // The href belongs to the default locale: only the label is translated.
      cta: { label: 'Start', href: '/about' },
    })
    expect(page?.publishedAt).toBe('2026-11-16T09:00:00+00:00')
    expect(page?.translated).toBe(true)
    expect(page?.locales).toEqual(['uk', 'en'])
  })

  it('falls back to the default locale when the locale has no translation', async () => {
    response = { data: localizedRow(), error: null }

    const page = await createPagesRepository().getByKey('home', 'de')

    expect(page?.locale).toBe('de')
    expect(page?.translated).toBe(false)
    expect(page?.content.hero).toEqual({ title: 'Заголовок', image: { mediaId: mediaRow.id, alt: 'Студія' } })
  })

  it('reads the default locale when no locale is given', async () => {
    response = { data: localizedRow(), error: null }

    const page = await createPagesRepository().getByKey('home', null)

    expect(argsOf('rpc')[0]?.[1]).toMatchObject({ page_locale: null })
    expect(page?.locale).toBe('uk')
    expect(page?.translated).toBe(true)
  })

  // A code-defined page without a row renders its defaults, so this is not an error.
  it('returns null when the page has no published content', async () => {
    response = { data: null, error: null }
    await expect(createPagesRepository().getByKey('about', 'uk')).resolves.toBeNull()

    response = { data: localizedRow({ base: null, base_published_at: null }), error: null }
    await expect(createPagesRepository().getByKey('about', 'uk')).resolves.toBeNull()
  })

  it('rejects content that is not an object', async () => {
    response = { data: localizedRow({ base: [] }), error: null }

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

describe('PagesRepository.getEditable', () => {
  it('reads Draft, Published and the base of a translation through the session client', async () => {
    response = {
      data: {
        default_locale: 'uk',
        base: { hero: { title: 'Заголовок' } },
        draft: { 'hero.title': 'Draft' },
        draft_updated_at: '2026-11-15T13:00:00+00:00',
        published: { 'hero.title': 'Title' },
        published_at: '2026-11-15T12:00:00+00:00',
        media: [],
      },
      error: null,
    }

    await expect(createPagesRepository(undefined, { bootstrapLocale: 'uk' }).getEditable('home', 'en')).resolves.toEqual({
      key: 'home',
      locale: 'en',
      defaultLocale: 'uk',
      base: { hero: { title: 'Заголовок' } },
      draft: { 'hero.title': 'Draft' },
      draftUpdatedAt: '2026-11-15T13:00:00+00:00',
      published: { 'hero.title': 'Title' },
      publishedAt: '2026-11-15T12:00:00+00:00',
      media: {},
    })

    expect(calls.every(call => call.client === 'session')).toBe(true)
    expect(argsOf('rpc')).toEqual([
      ['cms_page_get_editable', { page_key: 'home', page_locale: 'en', bootstrap_locale: 'uk' }],
    ])
  })

  it('resolves a null locale to the default one', async () => {
    response = {
      data: {
        default_locale: 'uk',
        base: null,
        draft: null,
        draft_updated_at: null,
        published: null,
        published_at: null,
        media: [],
      },
      error: null,
    }

    const editable = await createPagesRepository().getEditable('about', null)
    expect(editable.locale).toBe('uk')
    expect(editable.published).toBeNull()
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

  it('lists revisions of one page and locale, newest first, without content', async () => {
    response = {
      data: [{ id: 'r2', locale: 'uk', created_at: '2026-11-15T12:00:00+00:00', page: { key: 'home' } }],
      error: null,
    }

    await expect(createPagesRepository().listRevisions('home', 'uk')).resolves.toEqual([
      { id: 'r2', locale: 'uk', createdAt: '2026-11-15T12:00:00+00:00' },
    ])
    expect(calls.every(call => call.client === 'session')).toBe(true)
    expect(argsOf('from')).toEqual([['cms_page_revisions']])
    expect(argsOf('select')[0]?.[0]).not.toContain('content')
    expect(argsOf('eq')).toEqual([['page.key', 'home'], ['locale', 'uk']])
    expect(argsOf('order')).toEqual([['created_at', { ascending: false }]])
  })

  it('reads the lock holder without the token, and null when nobody holds it', async () => {
    response = {
      data: [{
        holder_email: 'anna@example.test',
        acquired_at: '2026-11-15T12:00:00+00:00',
        heartbeat_at: '2026-11-15T12:01:00+00:00',
        is_mine: false,
        is_stale: false,
      }],
      error: null,
    }
    const repository = createPagesRepository()

    await expect(repository.getLockStatus('home')).resolves.toEqual({
      holderEmail: 'anna@example.test',
      acquiredAt: '2026-11-15T12:00:00+00:00',
      heartbeatAt: '2026-11-15T12:01:00+00:00',
      mine: false,
      stale: false,
    })
    expect(argsOf('rpc')).toEqual([['cms_page_lock_status', { page_key: 'home' }]])

    response = { data: [], error: null }
    await expect(repository.getLockStatus('home')).resolves.toBeNull()
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

describe('PagesRepository on the Texts screen (C-89)', () => {
  it('writes texts of a language into its draft and returns the draft time', async () => {
    response = { data: '2026-11-18T12:36:42.041292+00:00', error: null }

    await expect(createPagesRepository().setTexts('home', 'uk', { 'hero.title': 'Привіт', 'hero.cta.label': null }))
      .resolves.toBe('2026-11-18T12:36:42.041292+00:00')
    expect(argsOf('rpc')).toEqual([['cms_page_set_texts', {
      page_key: 'home',
      page_locale: 'uk',
      entries: { 'hero.title': 'Привіт', 'hero.cta.label': null },
    }]])
  })

  it('tells a page open in Edit Mode apart from other failures', async () => {
    response = { data: null, error: postgrestError('CMSLK') }
    expect((await rejection(createPagesRepository().setTexts('home', 'uk', { 'hero.title': 'x' }))).code).toBe('locked')
  })

  // The marker is compared in SQL to the microsecond: it must reach the RPC unchanged.
  it('publishes the chosen pages with their draft time exactly as read', async () => {
    response = { data: [{ published: 1, skipped_keys: ['about'] }], error: null }
    const pages = [
      { key: 'about', draftUpdatedAt: '2026-11-18T12:00:00.000001+00:00' },
      { key: 'home', draftUpdatedAt: '2026-11-18T12:36:42.041292+00:00' },
    ]

    await expect(createPagesRepository().publishLanguage('en', pages)).resolves.toEqual({ published: 1, skipped: ['about'] })
    expect(argsOf('rpc')).toEqual([['cms_language_publish', { page_locale: 'en', pages }]])
  })

  it('reads an empty publish result as nothing published', async () => {
    response = { data: [], error: null }
    await expect(createPagesRepository().publishLanguage('en', [])).resolves.toEqual({ published: 0, skipped: [] })
  })
})
