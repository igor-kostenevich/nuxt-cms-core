import { beforeEach, describe, expect, it, vi } from 'vitest'
import { editSlugOf, routePrefix, typeOfPath } from '../app/editor/entry-route'
import { pageStatus } from '../app/admin/useAdminPages'

// Edit Mode of entries (014 stage 4): the route of a type, the address shown
// for a language, the repository the Engine talks to, and the identity of the
// session (the entry id: a new slug does not take the lock again).

vi.mock('#cms/config', () => ({ cmsConfig: { defaultLocale: 'en' } }))
vi.mock('#cms/content', () => ({ cmsContent: { pages: [], types: [] } }))

const pages = {
  getEditable: vi.fn(async (key: string) => ({ key })),
  publish: vi.fn(async () => 'p'),
  acquireLock: vi.fn(async () => 'page-token'),
  registerFields: vi.fn(async () => undefined),
  prepareUnloadRelease: vi.fn(async () => undefined),
  releaseLockOnUnload: vi.fn(),
}
const entries = {
  getEditable: vi.fn(async (type: string, id: string) => ({ type, id })),
  publish: vi.fn(async () => 'p'),
  acquireLock: vi.fn(async () => 'entry-token'),
  prepareUnloadRelease: vi.fn(async () => undefined),
  releaseLockOnUnload: vi.fn(),
}

vi.mock('../app/data/repositories/pages.repository', () => ({ createPagesRepository: () => pages }))
vi.mock('../app/data/repositories/entries.repository', () => ({ createEntriesRepository: () => entries }))

const { createDocumentRepository } = await import('../app/editor/document-repository')
const { createEditorEngine } = await import('../app/editor/engine')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('entry routes', () => {
  const types = [{ key: 'post', route: '/blog/[slug]' }, { key: 'job', route: null }]

  it('finds the type of a path: one segment after the prefix', () => {
    expect(routePrefix('/blog/[slug]')).toBe('/blog/')
    expect(typeOfPath('/blog/kava', types)?.key).toBe('post')
    expect(typeOfPath('/blog/', types)).toBeNull()
    expect(typeOfPath('/blog/kava/comments', types)).toBeNull()
    expect(typeOfPath('/about', types)).toBeNull()
  })

  it('the address of a language: draft first, then publication, then the original', () => {
    const editable = (draft: object | null, published: object | null, base: object | null) =>
      ({ key: 'e', locale: 'uk', defaultLocale: 'en', draft, published, base, draftUpdatedAt: null, publishedAt: null, media: {} }) as never

    expect(editSlugOf(editable({ slug: 'draft' }, { slug: 'live' }, null))).toBe('draft')
    expect(editSlugOf(editable(null, { slug: 'live' }, null))).toBe('live')
    // A translation without an own address shows the original's.
    expect(editSlugOf(editable({ title: 'Кава' }, null, { slug: 'kava' }))).toBe('kava')
    expect(editSlugOf(editable(null, null, null))).toBeNull()
  })

  it('status of a static page', () => {
    expect(pageStatus(undefined)).toBe('none')
    expect(pageStatus({ published: false, hasDraft: false })).toBe('none')
    expect(pageStatus({ published: false, hasDraft: true })).toBe('draft')
    expect(pageStatus({ published: true, hasDraft: false })).toBe('published')
    expect(pageStatus({ published: true, hasDraft: true })).toBe('changed')
  })
})

describe('the repository of the edited document', () => {
  it('a page until an entry binds; then the entry, by type and id', async () => {
    const documents = createDocumentRepository({ bootstrapLocale: 'en' })

    await documents.repository.getEditable('home', null)
    expect(pages.getEditable).toHaveBeenCalledWith('home', null)

    documents.edit({ kind: 'entry', type: 'post', requireSlug: true })
    await documents.repository.getEditable('e1', 'uk')
    await documents.repository.publish('e1', 'uk', 't1')
    await documents.repository.registerFields('e1', '/blog/x', [], [])

    expect(entries.getEditable).toHaveBeenCalledWith('post', 'e1', 'uk')
    expect(entries.publish).toHaveBeenCalledWith('post', 'e1', 'uk', 't1', { requireSlug: true })
    // Entries keep no field registry.
    expect(pages.registerFields).not.toHaveBeenCalled()
  })

  it('prepares the release on tab close for both, before anything binds', async () => {
    const documents = createDocumentRepository({ bootstrapLocale: 'en' })
    await documents.repository.prepareUnloadRelease()

    expect(pages.prepareUnloadRelease).toHaveBeenCalled()
    expect(entries.prepareUnloadRelease).toHaveBeenCalled()

    documents.edit({ kind: 'entry', type: 'post', requireSlug: true })
    documents.repository.releaseLockOnUnload('e1', 't1')
    expect(entries.releaseLockOnUnload).toHaveBeenCalledWith('post', 'e1', 't1')
  })
})

describe('the session of an entry', () => {
  it('a new slug is saved in the same session: the lock is taken once', async () => {
    const editable = { key: 'e1', locale: 'en', defaultLocale: 'en', base: null, draft: null, draftUpdatedAt: null, published: { title: 'Kava', slug: 'kava' }, publishedAt: 't', media: {} }
    entries.getEditable.mockResolvedValue(editable as never)
    const saveDraft = vi.fn(async () => 'saved')
    Object.assign(entries, { saveDraft, heartbeatLock: vi.fn(async () => undefined) })

    const documents = createDocumentRepository({ bootstrapLocale: 'en' })
    documents.edit({ kind: 'entry', type: 'post', requireSlug: true })
    const engine = createEditorEngine({ repository: documents.repository, locale: null, historyLimit: 10 })
    await engine.load('e1')

    engine.set('slug', 'kava-new')
    await engine.save()
    engine.set('slug', 'kava-newer')
    await engine.save()
    await engine.heartbeat()

    expect(entries.acquireLock).toHaveBeenCalledTimes(1)
    expect(saveDraft).toHaveBeenLastCalledWith('post', 'e1', 'en', { title: 'Kava', slug: 'kava-newer' }, 'entry-token')
    expect(engine.entity.value?.key).toBe('e1')
  })
})
