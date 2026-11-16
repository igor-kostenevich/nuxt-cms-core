import { describe, expect, it, vi } from 'vitest'
import { CmsDataError } from '../app/data/errors'
import { createEditorEngine, type EditorRepository } from '../app/editor/engine'
import { getAt, setAt, stableStringify } from '../app/editor/paths'

function fakeRepository(overrides: Partial<EditorRepository> = {}): EditorRepository {
  return {
    getByKey: vi.fn(async () => ({
      key: 'home',
      locale: 'uk',
      content: { hero: { title: 'Live' } },
      publishedAt: '2026-11-15T10:00:00Z',
    })),
    getDraft: vi.fn(async () => null),
    saveDraft: vi.fn(async () => '2026-11-15T11:00:00Z'),
    publish: vi.fn(async () => '2026-11-15T12:00:00Z'),
    restore: vi.fn(async () => '2026-11-15T13:00:00Z'),
    listRevisions: vi.fn(async () => []),
    acquireLock: vi.fn(async () => 'token-1'),
    heartbeatLock: vi.fn(async () => undefined),
    releaseLock: vi.fn(async () => undefined),
    forceUnlock: vi.fn(async () => undefined),
    getLockStatus: vi.fn(async () => null),
    prepareUnloadRelease: vi.fn(async () => undefined),
    releaseLockOnUnload: vi.fn(),
    ...overrides,
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
      getDraft: vi.fn(async () => ({
        key: 'home',
        locale: 'uk',
        content: { hero: { title: 'Draft' } },
        updatedAt: '2026-11-15T11:00:00Z',
      })),
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
      getByKey: vi.fn(async () => ({
        key: 'home',
        locale: 'uk',
        content: { cta: { href: '/a', label: 'Go' } },
        publishedAt: '2026-11-15T10:00:00Z',
      })),
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
      const { engine, repository } = await loadedEngine(fakeRepository({
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
      expect(repository.getDraft).not.toHaveBeenCalled()

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
        getByKey: vi.fn(async () => ({
          key: 'home',
          locale: 'uk',
          content: { hero: { title: published } },
          publishedAt: '2026-11-15T10:00:00Z',
        })),
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
        getByKey: vi.fn(async () => ({
          key: 'home',
          locale: 'uk',
          content: { hero: { title: published, lead: 'L' } },
          publishedAt: '2026-11-15T10:00:00Z',
        })),
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
