import { describe, expect, it, vi } from 'vitest'
import { CmsDataError } from '../app/data/errors'
import { createEditorEngine, registryEntries, type EditorRepository } from '../app/editor/engine'
import { canSetAt, getAt, setAt, stableStringify } from '../app/primitives/paths'

interface FakeSources {
  /** Published content of the edited locale; null: not published. */
  getByKey?: () => Promise<{ content: Record<string, unknown>, publishedAt: string } | null>
  /** Saved draft of the edited locale; null: none. */
  getDraft?: () => Promise<{ content: Record<string, unknown>, updatedAt: string } | null>
  /** Base of a translation: content of the default locale. */
  base?: Record<string, unknown> | null
  defaultLocale?: string
}

/**
 * A repository whose `getEditable` is built from what the tests describe:
 * published content, a draft and, for a translation, its base.
 */
function fakeRepository(overrides: Partial<EditorRepository> & FakeSources = {}): EditorRepository {
  const { getByKey: published, getDraft: draft, base = null, defaultLocale = 'uk', ...rest } = overrides
  const readPublished = published ?? (async () => ({ content: { hero: { title: 'Live' } }, publishedAt: '2026-11-15T10:00:00Z' }))
  const readDraft = draft ?? (async () => null)

  return {
    getEditable: vi.fn(async (key: string, locale: string | null) => {
      const [page, saved] = await Promise.all([readPublished(), readDraft()])

      return {
        key,
        locale: locale ?? defaultLocale,
        defaultLocale,
        base: (locale ?? defaultLocale) === defaultLocale ? null : base,
        draft: saved?.content ?? null,
        draftUpdatedAt: saved?.updatedAt ?? null,
        published: page?.content ?? null,
        publishedAt: page?.publishedAt ?? null,
        media: {},
      }
    }),
    getLocaleStates: vi.fn(async () => []),
    registerFields: vi.fn(async () => undefined),
    saveDraft: vi.fn(async () => '2026-11-15T11:00:00Z'),
    publish: vi.fn(async () => '2026-11-15T12:00:00Z'),
    restore: vi.fn(async () => '2026-11-15T13:00:00Z'),
    listRevisions: vi.fn(async () => []),
    getRevision: vi.fn(async () => null),
    acquireLock: vi.fn(async () => 'token-1'),
    heartbeatLock: vi.fn(async () => undefined),
    releaseLock: vi.fn(async () => undefined),
    forceUnlock: vi.fn(async () => undefined),
    getLockStatus: vi.fn(async () => null),
    prepareUnloadRelease: vi.fn(async () => undefined),
    releaseLockOnUnload: vi.fn(),
    ...rest,
  }
}

async function loadedEngine(repository = fakeRepository()) {
  const engine = createEditorEngine({ repository, locale: 'uk', historyLimit: 3 })
  await engine.load('home')
  return { engine, repository }
}

describe('paths', () => {
  const document = {
    hero: { title: 'A' },
    services: [{ id: 'a1', title: 'One' }, { id: 'b2', title: 'Two' }],
  }

  it('addresses collection items by id, not by index', () => {
    expect(getAt(document, 'services.b2.title')).toBe('Two')
    expect(getAt(document, 'services.1.title')).toBeUndefined()
  })

  it('tells whether setAt would write, without writing', () => {
    const paths = ['hero.title', 'cta.label', 'services.b2.title', 'services.zz.title', 'hero.title.deep', 'services']

    for (const path of paths) {
      const target: Record<string, unknown> = structuredClone(document)
      expect(canSetAt(document, path), path).toBe(setAt(target, path, 'x'))
    }
  })

  it('creates missing objects but never a missing collection item', () => {
    const target: Record<string, unknown> = structuredClone(document)

    expect(setAt(target, 'cta.label', 'Go')).toBe(true)
    expect(target.cta).toEqual({ label: 'Go' })
    expect(setAt(target, 'services.zz.title', 'Ghost')).toBe(false)
  })
})

describe('stableStringify', () => {
  it('ignores key order at every level', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [{ y: 1, x: 2 }] } }))
      .toBe(stableStringify({ a: { c: [{ x: 2, y: 1 }], d: 2 }, b: 1 }))
  })
})

describe('Editor Engine', () => {
  it('starts from the draft when one exists, else from published content', async () => {
    const { engine } = await loadedEngine(fakeRepository({
      getDraft: async () => ({
        content: { hero: { title: 'Draft' } },
        updatedAt: '2026-11-15T11:00:00Z',
      }),
    }))

    expect(engine.get('hero.title')).toBe('Draft')
    expect(engine.hasDraft.value).toBe(true)
    expect(engine.dirty.value).toBe(false)
    expect(engine.hasUnpublished.value).toBe(true)
  })

  it('tracks dirty state against the last save', async () => {
    const { engine, repository } = await loadedEngine()

    engine.set('hero.title', 'New')
    expect(engine.dirty.value).toBe(true)

    await engine.save()
    expect(repository.saveDraft).toHaveBeenCalledWith('home', 'uk', { hero: { title: 'New' } }, 'token-1')
    expect(engine.dirty.value).toBe(false)
    expect(engine.hasDraft.value).toBe(true)
  })

  it('keeps no draft when the saved content equals the published one', async () => {
    const { engine } = await loadedEngine(fakeRepository({ saveDraft: vi.fn(async () => null) }))

    engine.set('hero.title', 'Live!')
    engine.set('hero.title', 'Live')
    await engine.save()

    expect(engine.hasDraft.value).toBe(false)
  })

  it('publishes unsaved changes by saving first, then clears Undo (D-20)', async () => {
    const { engine, repository } = await loadedEngine()

    engine.set('hero.title', 'New')
    expect(engine.canUndo.value).toBe(true)

    await expect(engine.publish()).resolves.toBe(true)
    expect(repository.saveDraft).toHaveBeenCalledOnce()
    expect(repository.publish).toHaveBeenCalledWith('home', 'uk', 'token-1')
    expect(engine.hasUnpublished.value).toBe(false)
    expect(engine.canUndo.value).toBe(false)
  })

  it('does not publish while a required field is empty', async () => {
    const { engine, repository } = await loadedEngine()
    const el = {} as HTMLElement

    engine.registerField({ id: 'f1', key: 'hero.title', kind: 'text', el, required: true, api: undefined })
    engine.set('hero.title', '  ')

    expect(engine.issues.value).toEqual([{ fieldId: 'f1', key: 'hero.title', kind: 'required', label: undefined }])
    await expect(engine.publish()).resolves.toBe(false)
    expect(repository.publish).not.toHaveBeenCalled()
  })

  it('reports text over maxLength, and a field left at its code default is not empty', async () => {
    const { engine } = await loadedEngine()
    const el = {} as HTMLElement

    engine.registerField({ id: 'f1', key: 'hero.lead', kind: 'text', el, required: true, maxLength: 3, api: undefined })
    expect(engine.issues.value).toEqual([])

    engine.set('hero.lead', 'Long')
    expect(engine.issues.value.map(issue => issue.kind)).toEqual(['maxLength'])
  })

  it('groups one typing session into one Undo step', async () => {
    const { engine } = await loadedEngine()

    engine.beginEdit('hero.title')
    engine.set('hero.title', 'N')
    engine.set('hero.title', 'Ne')
    engine.set('hero.title', 'New')
    engine.endEdit()

    engine.undo()
    expect(engine.get('hero.title')).toBe('Live')
    engine.redo()
    expect(engine.get('hero.title')).toBe('New')
  })

  it('caps the Undo stack at historyLimit', async () => {
    const { engine } = await loadedEngine()

    for (const title of ['1', '2', '3', '4', '5']) {
      engine.set('hero.title', title)
    }

    engine.undo()
    engine.undo()
    engine.undo()
    engine.undo()
    expect(engine.get('hero.title')).toBe('2')
  })

  it('resets a field to its published value', async () => {
    const { engine } = await loadedEngine()

    engine.set('hero.title', 'New')
    engine.set('hero.extra', 'x')
    engine.reset('hero.title')
    engine.reset('hero.extra')

    expect(engine.document.value).toEqual({ hero: { title: 'Live' } })
  })

  it('serializes saves, so a second Save waits for the first', async () => {
    const order: string[] = []
    let finishFirst!: () => void
    const { engine } = await loadedEngine(fakeRepository({
      saveDraft: vi.fn(async (_key, _locale, content) => {
        const title = (content as { hero: { title: string } }).hero.title
        order.push(`start ${title}`)

        if (title === 'A') {
          await new Promise<void>((resolve) => {
            finishFirst = resolve
          })
        }

        order.push(`end ${title}`)
        return '2026-11-15T11:00:00Z'
      }),
    }))

    engine.set('hero.title', 'A')
    const first = engine.save()
    await vi.waitFor(() => expect(finishFirst).toBeTypeOf('function'))

    // A second Save while the first is in flight waits for it.
    engine.set('hero.title', 'B')
    const second = engine.save()
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(order).toEqual(['start A'])
    finishFirst()
    await Promise.all([first, second])

    expect(order).toEqual(['start A', 'end A', 'start B', 'end B'])
    expect(engine.dirty.value).toBe(false)
  })

  it('releases a lock that arrives after the editor was disposed', async () => {
    let grant!: (token: string) => void
    const repository = fakeRepository({
      acquireLock: vi.fn(() => new Promise<string>((resolve) => {
        grant = resolve
      })),
    })
    const engine = createEditorEngine({ repository, locale: 'uk', historyLimit: 100 })

    const loading = engine.load('home')
    await engine.dispose()
    grant('late-token')
    await loading

    expect(repository.releaseLock).toHaveBeenCalledWith('home', 'late-token')
    expect(engine.lock.value).not.toBe('held')
  })

  it('is not dirty when the same content comes back with keys in another order', async () => {
    const { engine } = await loadedEngine(fakeRepository({
      getByKey: async () => ({
        content: { cta: { href: '/a', label: 'Go' } },
        publishedAt: '2026-11-15T10:00:00Z',
      }),
    }))

    engine.set('cta', { label: 'Go', href: '/a' })

    expect(engine.dirty.value).toBe(false)
    expect(engine.changed('cta')).toBe(false)
  })

  it('gives every Undo step its own id', async () => {
    const { engine } = await loadedEngine()

    expect(engine.lastStepId.value).toBe(0)
    engine.set('hero.title', 'A')
    const first = engine.lastStepId.value
    engine.set('hero.title', 'B')

    expect(engine.lastStepId.value).toBeGreaterThan(first)
    engine.undo()
    expect(engine.lastStepId.value).toBe(first)
  })

  it('resets the whole page to the published version as one Undo step', async () => {
    const { engine } = await loadedEngine()

    engine.set('hero.title', 'New')
    engine.set('hero.lead', 'Lead')
    engine.resetAll()

    expect(engine.document.value).toEqual({ hero: { title: 'Live' } })
    engine.undo()
    expect(engine.get('hero.lead')).toBe('Lead')
  })

  describe('collections', () => {
    it('copies code defaults into the document on the first change', async () => {
      const { engine } = await loadedEngine()

      engine.registerCollectionDefaults('services', () => [
        { id: 'default-0', title: 'Strategy' },
        { id: 'default-1', title: 'Design' },
      ])

      expect(engine.get('services')).toBeUndefined()
      engine.set('services.default-1.title', 'Brand')

      expect(engine.get('services')).toEqual([
        { id: 'default-0', title: 'Strategy' },
        { id: 'default-1', title: 'Brand' },
      ])
    })

    it('copies code defaults with their own ids (C-88)', async () => {
      const { engine } = await loadedEngine()

      engine.registerCollectionDefaults('services', () => [
        { id: 'design', title: 'Design' },
        { id: 'build', title: 'Build' },
      ])
      engine.set('services.build.title', 'Development')

      expect(engine.get('services')).toEqual([
        { id: 'design', title: 'Design' },
        { id: 'build', title: 'Development' },
      ])
    })

    it('keeps a text the Texts screen stored for a code default item when it copies the list (C-89)', async () => {
      // The Texts screen writes the original of an item from code as an
      // override object, without copying the list: { services: { build: { title } } }.
      const { engine } = await loadedEngine(fakeRepository({
        getByKey: async () => ({ content: { services: { build: { title: 'Development' } } }, publishedAt: '2026-11-15T10:00:00Z' }),
      }))

      engine.registerCollectionDefaults('services', () => [
        { id: 'design', title: 'Design', href: '/design' },
        { id: 'build', title: 'Build', href: '/build' },
      ])

      expect(engine.collectionItems('services').map(item => item.title)).toEqual(['Design', 'Development'])

      engine.moveItem('services', 'build', -1)

      expect(engine.get('services')).toEqual([
        { id: 'build', title: 'Development', href: '/build' },
        { id: 'design', title: 'Design', href: '/design' },
      ])
    })

    it('resets a field of a default item to its code default, not to empty', async () => {
      const { engine } = await loadedEngine()

      engine.registerCollectionDefaults('services', () => [{ id: 'default-0', title: 'Strategy' }])
      engine.set('services.default-0.title', 'Changed')
      engine.reset('services.default-0.title')

      expect(engine.get('services.default-0.title')).toBe('Strategy')
      expect(engine.changed('services.default-0.title')).toBe(false)
    })

    it('records nothing for a move or delete that changes nothing', async () => {
      const { engine } = await loadedEngine()

      engine.registerCollectionDefaults('faq', () => [{ id: 'default-0', q: 'A' }, { id: 'default-1', q: 'B' }])
      engine.moveItem('faq', 'default-0', -1)
      engine.moveItem('faq', 'default-1', 5)
      engine.removeItem('faq', 'missing')

      expect(engine.canUndo.value).toBe(false)
      expect(engine.dirty.value).toBe(false)
      expect(engine.get('faq')).toBeUndefined()
    })

    it('adds, duplicates, moves and removes items with stable ids', async () => {
      const { engine } = await loadedEngine()

      const first = engine.addItem('faq', { q: 'One' })!
      const second = engine.addItem('faq', { q: 'Two' })!
      const copy = engine.duplicateItem('faq', first)!

      expect(engine.collectionItems('faq').map(item => item.id)).toEqual([first, copy, second])
      expect(new Set([first, second, copy]).size).toBe(3)

      engine.moveItem('faq', second, 0)
      expect(engine.collectionItems('faq').map(item => item.q)).toEqual(['Two', 'One', 'One'])

      engine.removeItem('faq', copy)
      expect(engine.collectionItems('faq').map(item => item.id)).toEqual([second, first])

      engine.undo()
      expect(engine.collectionItems('faq').map(item => item.id)).toEqual([second, first, copy])
    })
  })

  describe('Content Lock', () => {
    it('opens read-only when another user holds the lock', async () => {
      const { engine } = await loadedEngine(fakeRepository({
        getDraft: async () => ({ content: { hero: { title: 'Their draft' } }, updatedAt: '2026-11-15T11:00:00Z' }),
        acquireLock: vi.fn(async () => {
          throw new CmsDataError('locked', 'locked')
        }),
        getLockStatus: vi.fn(async () => ({
          holderEmail: 'anna@example.test',
          acquiredAt: '2026-11-15T10:00:00Z',
          heartbeatAt: '2026-11-15T10:01:00Z',
          mine: false,
          stale: false,
        })),
      }))

      expect(engine.status.value).toBe('ready')
      expect(engine.lock.value).toBe('locked')
      expect(engine.lockHolder.value?.holderEmail).toBe('anna@example.test')
      // A read-only viewer sees Published: the Draft is the lock holder's work.
      expect(engine.hasDraft.value).toBe(false)

      engine.set('hero.title', 'Nope')
      expect(engine.get('hero.title')).toBe('Live')
    })

    it('becomes lost when a save finds the lock gone, and keeps local changes', async () => {
      const { engine } = await loadedEngine(fakeRepository({
        saveDraft: vi.fn(async () => {
          throw new CmsDataError('lock_lost', 'lost')
        }),
      }))

      engine.set('hero.title', 'Mine')
      await expect(engine.save()).resolves.toBe(false)

      expect(engine.lock.value).toBe('lost')
      expect(engine.saveStatus.value).toBe('error')
      expect(engine.get('hero.title')).toBe('Mine')
    })

    it('reloads server content on take over, so a publication made meanwhile is not lost', async () => {
      let published = 'Live'
      let locked = true
      const { engine } = await loadedEngine(fakeRepository({
        getByKey: async () => ({
          content: { hero: { title: published } },
          publishedAt: '2026-11-15T10:00:00Z',
        }),
        acquireLock: vi.fn(async () => {
          if (locked) {
            throw new CmsDataError('locked', 'locked')
          }

          return 'token-2'
        }),
      }))

      expect(engine.lock.value).toBe('locked')

      // Someone else publishes, then leaves.
      published = 'Their version'
      locked = false
      await engine.takeOver()

      expect(engine.lock.value).toBe('held')
      expect(engine.get('hero.title')).toBe('Their version')
      expect(engine.hasUnpublished.value).toBe(false)
      expect(engine.canUndo.value).toBe(false)
    })

    it('keeps local changes on take over, compared against the fresh published version', async () => {
      let published = 'Live'
      let token = 0
      const { engine } = await loadedEngine(fakeRepository({
        getByKey: async () => ({
          content: { hero: { title: published, lead: 'L' } },
          publishedAt: '2026-11-15T10:00:00Z',
        }),
        acquireLock: vi.fn(async () => `token-${++token}`),
        heartbeatLock: vi.fn(async () => {
          throw new CmsDataError('lock_lost', 'lost')
        }),
      }))

      engine.set('hero.lead', 'Mine')
      await engine.heartbeat()
      published = 'Their version'
      await engine.takeOver()

      expect(engine.get('hero.lead')).toBe('Mine')
      expect(engine.changed('hero.title')).toBe(true)
      expect(engine.dirty.value).toBe(true)
    })

    it('stays lost, with its changes guarded, when taking the lock back fails', async () => {
      let attempts = 0
      const { engine } = await loadedEngine(fakeRepository({
        acquireLock: vi.fn(async () => {
          attempts++

          if (attempts > 1) {
            throw new CmsDataError('locked', 'locked')
          }

          return 'token-1'
        }),
        heartbeatLock: vi.fn(async () => {
          throw new CmsDataError('lock_lost', 'lost')
        }),
      }))

      engine.set('hero.title', 'Mine')
      await engine.heartbeat()
      await engine.takeOver()

      expect(engine.lock.value).toBe('lost')
      expect(engine.dirty.value).toBe(true)
      expect(engine.get('hero.title')).toBe('Mine')
    })

    it('takes the lock back and saves with the new token', async () => {
      let token = 0
      const { engine, repository } = await loadedEngine(fakeRepository({
        acquireLock: vi.fn(async () => `token-${++token}`),
        heartbeatLock: vi.fn(async () => {
          throw new CmsDataError('lock_lost', 'lost')
        }),
      }))

      engine.set('hero.title', 'Mine')
      await engine.heartbeat()
      expect(engine.lock.value).toBe('lost')

      await engine.takeOver()
      await engine.save()
      expect(repository.saveDraft).toHaveBeenCalledWith('home', 'uk', { hero: { title: 'Mine' } }, 'token-2')
    })
  })
})

describe('Editor Engine in a translation (C-78)', () => {
  const base = {
    hero: {
      title: 'Привіт',
      cta: { label: 'Почати', href: '/about' },
      image: { mediaId: 'm1', alt: 'Студія' },
    },
    services: [{ id: 'a1', title: 'Один' }],
  }

  async function translationEngine(overrides: Partial<EditorRepository> & FakeSources = {}) {
    const repository = fakeRepository({
      base,
      getByKey: async () => ({ content: { 'hero.title': 'Hello' }, publishedAt: '2026-11-16T10:00:00Z' }),
      ...overrides,
    })
    const engine = createEditorEngine({ repository, locale: 'en', historyLimit: 10 })
    await engine.load('home')

    const el = {} as HTMLElement
    engine.registerField({ id: 'title', key: 'hero.title', kind: 'text', el, api: undefined })
    engine.registerField({ id: 'cta', key: 'hero.cta', kind: 'link', el, api: { defaultLabel: () => '', defaultHref: () => undefined } })
    engine.registerField({ id: 'image', key: 'hero.image', kind: 'image', el, api: { defaultSrc: () => undefined, defaultAlt: () => '', decorative: () => false } })
    engine.registerField({ id: 'item', key: 'services.a1.title', kind: 'text', el, api: undefined })
    engine.registerField({ id: 'default-item', key: 'services.default-1.title', kind: 'text', el, api: undefined })

    return { engine, repository }
  }

  it('shows the base with the translation applied', async () => {
    const { engine } = await translationEngine()

    expect(engine.translating.value).toBe(true)
    expect(engine.defaultLocale.value).toBe('uk')
    expect(engine.get('hero.title')).toBe('Hello')
    // Untranslated: the default locale's text.
    expect(engine.get('hero.cta')).toEqual({ label: 'Почати', href: '/about' })
    expect(engine.isTranslated('hero.title', 'text')).toBe(true)
    expect(engine.isTranslated('hero.cta', 'link')).toBe(false)
    expect(engine.baseValue('hero.title')).toBe('Привіт')
  })

  it('stores only translated leaves: text, link label, image alt', async () => {
    const { engine, repository } = await translationEngine()

    engine.set('hero.cta', { label: 'Start', href: '/elsewhere', newTab: true })
    engine.set('hero.image', { mediaId: 'other', alt: 'Studio', decorative: true })
    engine.set('services.a1.title', 'One')
    await engine.save()

    expect(repository.saveDraft).toHaveBeenCalledWith('home', 'en', {
      'hero.title': 'Hello',
      'hero.cta.label': 'Start',
      'hero.image.alt': 'Studio',
      'services.a1.title': 'One',
    }, 'token-1')
    // The structure stays the default locale's.
    expect(engine.get('hero.cta')).toEqual({ label: 'Start', href: '/about' })
    expect(engine.get('hero.image')).toEqual({ mediaId: 'm1', alt: 'Studio' })
  })

  it('lists the fields still to translate, without the ones it cannot translate', async () => {
    const { engine } = await translationEngine()

    // Translated: hero.title. A code default item cannot be translated yet.
    expect([...engine.untranslated.value].sort()).toEqual(['hero.cta', 'hero.image', 'services.a1.title'])

    engine.set('hero.cta', { label: 'Start' })
    expect(engine.untranslated.value.has('hero.cta')).toBe(false)
  })

  it('does not translate an item that exists only as a code default', async () => {
    const { engine } = await translationEngine()

    expect(engine.canTranslate('services.default-1.title')).toBe(false)
    engine.set('services.default-1.title', 'Ghost')
    expect(engine.dirty.value).toBe(false)
  })

  it('translates an item that is still a code default, over the defaults', async () => {
    const { engine, repository } = await translationEngine()
    engine.registerCollectionDefaults('work.items', () => [{ id: 'default-0', title: 'Atlas', tag: 'Shop' }])
    engine.registerField({ id: 'work', key: 'work.items.default-0.title', kind: 'text', el: {} as HTMLElement, api: undefined })

    expect(engine.canTranslate('work.items.default-0.title')).toBe(true)
    engine.set('work.items.default-0.title', 'Атлас')

    expect(engine.isTranslated('work.items.default-0.title', 'text')).toBe(true)
    // The collection shows the code defaults with the translation laid over them.
    expect(engine.collectionItems('work.items')).toEqual([{ id: 'default-0', title: 'Атлас', tag: 'Shop' }])

    await engine.save()
    expect(repository.saveDraft).toHaveBeenLastCalledWith('home', 'en', expect.objectContaining({
      'work.items.default-0.title': 'Атлас',
    }), 'token-1')
  })

  it('writes a translated leaf in place: typing does not rebuild the page', async () => {
    const { engine } = await translationEngine()
    const shown = engine.document.value
    const cta = engine.get('hero.cta')

    engine.set('hero.title', 'Hi')

    expect(engine.document.value).toBe(shown)
    expect(engine.get('hero.cta')).toBe(cta)
    expect(engine.get('hero.title')).toBe('Hi')

    // Back to the default locale's text when the translation goes.
    engine.set('hero.cta', { label: 'Start' })
    engine.reset('hero.cta')
    expect(engine.get('hero.cta')).toEqual({ label: 'Почати', href: '/about' })
  })

  it('locks the structure: collections cannot change', async () => {
    const { engine } = await translationEngine()

    expect(engine.addItem('services')).toBeNull()
    engine.removeItem('services', 'a1')
    expect(engine.collectionItems('services').map(item => item.id)).toEqual(['a1'])
  })

  it('tracks dirty state, Undo and Reset on the translation', async () => {
    const { engine } = await translationEngine()

    engine.set('hero.title', 'Hi')
    expect(engine.dirty.value).toBe(true)
    expect(engine.changed('hero.title')).toBe(true)

    engine.undo()
    expect(engine.get('hero.title')).toBe('Hello')
    expect(engine.dirty.value).toBe(false)

    engine.set('hero.cta', { label: 'Start' })
    engine.reset('hero.cta')
    // Not published in this language: back to the default locale's label.
    expect(engine.get('hero.cta')).toEqual({ label: 'Почати', href: '/about' })
    expect(engine.isTranslated('hero.cta', 'link')).toBe(false)
  })

  it('switches locale without losing the lock, and edits the base again in the default locale', async () => {
    const { engine, repository } = await translationEngine()

    await engine.setLocale('uk')

    expect(engine.translating.value).toBe(false)
    expect(engine.lock.value).toBe('held')
    expect(repository.acquireLock).toHaveBeenCalledOnce()
    expect(repository.getEditable).toHaveBeenLastCalledWith('home', 'uk')
  })
})

describe('field registry (C-84)', () => {
  it('records the number of the collection item a field is in, whatever its id', () => {
    const list = { children: [] as unknown[] }
    const item = (id: string) => ({ hasAttribute: (name: string) => name === 'data-cms-item', id, parentElement: list })
    const first = item('design')
    const second = item('build')
    list.children = [first, { hasAttribute: () => false }, second]
    const inItem = (owner: unknown) => ({
      tagName: 'H3',
      closest: (selector: string) => (selector === '[data-cms-item]' ? owner : null),
    }) as unknown as HTMLElement

    const { fields } = registryEntries([
      { id: '1', key: 'services.design.title', kind: 'text', el: inItem(first), api: undefined },
      { id: '2', key: 'services.build.title', kind: 'text', el: inItem(second), api: undefined },
      { id: '3', key: 'hero.title', kind: 'text', el: inItem(null), api: undefined },
    ])

    expect(fields.map(field => [field.address, field.item])).toEqual([
      ['services.design.title', 1],
      ['services.build.title', 2],
      ['hero.title', undefined],
    ])
  })

  it('records translatable fields with their texts from code, and hidden optional blocks', () => {
    const el = {} as HTMLElement
    const { fields, hiddenPrefixes } = registryEntries([
      { id: '1', key: 'hero.title', kind: 'text', el, label: 'Title', defaultText: () => ' From code ', api: undefined },
      { id: '2', key: 'hero.title', kind: 'text', el, defaultText: () => 'Twice', api: undefined },
      { id: '3', key: 'hero.cta', kind: 'button', el, api: { defaultLabel: () => 'Start', defaultHref: () => '/' } },
      { id: '4', key: 'hero.image', kind: 'image', el, api: { defaultSrc: () => undefined, defaultAlt: () => 'Studio', decorative: () => false } },
      { id: '5', key: 'hero.decor', kind: 'image', el, api: { defaultSrc: () => undefined, defaultAlt: () => '', decorative: () => true } },
      { id: '6', key: 'hero.bg', kind: 'background', el, api: { defaultSrc: () => undefined, defaultAlt: () => '', decorative: () => true } },
      { id: '7', key: 'quote', kind: 'optional', el, api: { hidden: () => true, toggle: () => undefined } },
      { id: '8', key: 'services', kind: 'collection', el, api: {} as never },
    ])

    expect(fields).toEqual([
      { address: 'hero.title', kind: 'text', label: 'Title', defaultText: 'From code', section: undefined, position: 0, tag: undefined },
      { address: 'hero.cta', kind: 'button', label: undefined, defaultText: 'Start', section: undefined, position: 1, tag: undefined },
      { address: 'hero.image', kind: 'image', label: undefined, defaultText: 'Studio', section: undefined, position: 2, tag: undefined },
    ])
    expect(hiddenPrefixes).toEqual(['quote'])
  })
})
