import { describe, expect, it, vi } from 'vitest'
import { createEditorEngine, type EditorRepository } from '../app/editor/engine'
import type { FieldRegistration } from '../app/editor/kinds'
import { createEditorView } from '../app/editor/view'

// 014 §7: a primitive that shows data of another entry (outside <CmsEntries>)
// must not write into the document of the page. Its value is compared with the
// document at its address; only-foreign addresses refuse every write.

function repository(published: Record<string, unknown>, options: { base?: Record<string, unknown>, defaultLocale?: string } = {}): EditorRepository {
  const defaultLocale = options.defaultLocale ?? 'en'

  return {
    getEditable: vi.fn(async (key: string, locale: string | null) => ({
      key,
      locale: locale ?? defaultLocale,
      defaultLocale,
      base: (locale ?? defaultLocale) === defaultLocale ? null : options.base ?? null,
      draft: null,
      draftUpdatedAt: null,
      published,
      publishedAt: '2026-11-24T10:00:00Z',
      media: {},
    })),
    getLocaleStates: vi.fn(async () => []),
    registerFields: vi.fn(async () => undefined),
    saveDraft: vi.fn(async () => '2026-11-24T11:00:00Z'),
    publish: vi.fn(async () => '2026-11-24T12:00:00Z'),
    restore: vi.fn(async () => null),
    listRevisions: vi.fn(async () => []),
    getRevision: vi.fn(async () => null),
    acquireLock: vi.fn(async () => 'token'),
    heartbeatLock: vi.fn(async () => undefined),
    releaseLock: vi.fn(async () => undefined),
    forceUnlock: vi.fn(async () => undefined),
    getLockStatus: vi.fn(async () => null),
    prepareUnloadRelease: vi.fn(async () => undefined),
    releaseLockOnUnload: vi.fn(),
  }
}

/** A field as useEditorField registers it, with its value from the page code. */
function field(id: string, key: string, kind: FieldRegistration['kind'], engine: ReturnType<typeof createEditorEngine>, value: () => unknown): FieldRegistration {
  return {
    id,
    key,
    kind,
    el: {} as HTMLElement,
    api: kind === 'collection' ? { key, count: () => 0, max: () => undefined, canAdd: () => true, add: () => null } : undefined,
    foreign: () => engine.isForeign(key, value()),
  } as FieldRegistration
}

async function home() {
  const engine = createEditorEngine({
    repository: repository({ hero: { title: 'Home title' } }),
    locale: null,
    historyLimit: 20,
  })
  await engine.load('home')
  return engine
}

describe('014 §7: fields with data of another entry', () => {
  it('a value from the document is the page\'s own; another value is foreign', async () => {
    const engine = await home()

    expect(engine.isForeign('hero.title', 'Home title')).toBe(false)
    expect(engine.isForeign('hero.subtitle', undefined)).toBe(false)
    expect(engine.isForeign('hero.subtitle', null)).toBe(false)
    expect(engine.isForeign('title', 'A post title')).toBe(true)
  })

  it('a field with no value is never foreign, whatever the document holds there', async () => {
    const engine = await home()

    // The page shows the default from its code (no value): nothing of another entry.
    expect(engine.isForeign('hero.title', null)).toBe(false)
    expect(engine.isForeign('hero.title', undefined)).toBe(false)
  })

  it('refuses writes to an address only a foreign field holds', async () => {
    const engine = await home()
    engine.registerField(field('own', 'hero.title', 'text', engine, () => engine.get('hero.title')))
    engine.registerField(field('post', 'title', 'text', engine, () => 'A post title'))

    engine.beginEdit('title')
    engine.set('title', 'Overwritten')
    engine.endEdit()
    engine.reset('title')

    expect(engine.get('title')).toBeUndefined()
    expect(engine.dirty.value).toBe(false)
    expect(engine.writable('title')).toBe(false)

    engine.set('hero.title', 'New home title')
    expect(engine.get('hero.title')).toBe('New home title')
  })

  it('an address held by an own field stays writable even if a foreign one shares it', async () => {
    const engine = await home()
    engine.registerField(field('own', 'hero.title', 'text', engine, () => engine.get('hero.title')))
    engine.registerField(field('post', 'hero.title', 'text', engine, () => 'Post title'))

    engine.set('hero.title', 'Still mine')
    expect(engine.get('hero.title')).toBe('Still mine')
  })

  it('refuses collection changes on a foreign list', async () => {
    const engine = await home()
    const tags = [{ id: 'a1', name: 'Coffee' }]
    engine.registerField(field('tags', 'tags', 'collection', engine, () => tags))

    expect(engine.addItem('tags', { name: 'Tea' })).toBeNull()
    engine.removeItem('tags', 'a1')
    expect(engine.get('tags')).toBeUndefined()
  })

  it('items of a collection still from code are the page\'s own, not foreign', async () => {
    const engine = await home()
    engine.registerCollectionDefaults('services', () => [{ id: 's1', title: 'Strategy' }])

    expect(engine.valueOf('services.s1.title')).toBe('Strategy')
    expect(engine.isForeign('services.s1.title', 'Strategy')).toBe(false)
    expect(engine.isForeign('services.s1.title', 'Something else')).toBe(true)

    engine.registerField(field('service', 'services.s1.title', 'text', engine, () => 'Strategy'))
    engine.set('services.s1.title', 'Strategy & direction')
    expect(engine.get('services.s1.title')).toBe('Strategy & direction')
  })

  it('in a translation, the shown translated value is the page\'s own', async () => {
    const engine = createEditorEngine({
      repository: repository({ 'hero.title': 'Заголовок' }, { base: { hero: { title: 'Home title' } } }),
      locale: 'uk',
      historyLimit: 20,
    })
    await engine.load('home')

    expect(engine.translating.value).toBe(true)
    expect(engine.isForeign('hero.title', 'Заголовок')).toBe(false)
    expect(engine.isForeign('hero.title', 'Home title')).toBe(true)
  })

  it('a foreign field cannot be selected: no panel opens for it', async () => {
    const engine = await home()
    const view = createEditorView(engine)
    engine.registerField(field('post-image', 'cover', 'image', engine, () => ({ mediaId: 'm1' })))
    engine.registerField(field('own', 'hero.title', 'text', engine, () => engine.get('hero.title')))

    view.select('post-image')
    expect(view.selection.value).toBeNull()

    view.select('own')
    expect(view.selection.value).toBe('own')
  })
})
