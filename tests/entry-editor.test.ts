import { describe, expect, it, vi } from 'vitest'
import { CmsDataError } from '../app/data/errors'
import { createEditorEngine, type EditorRepository } from '../app/editor/engine'
import type { FieldRegistration } from '../app/editor/kinds'
import { createPendingDocumentRepository } from '../app/editor/pending'

// G2 spike (014): the compact entry editor on the existing Engine. An
// in-memory store stands in for the entries RPCs; the lock is per user.

interface StoredEntry {
  draft: Record<string, Record<string, unknown>>
  published: Record<string, Record<string, unknown>>
  lock: { user: string, token: string } | null
}

function memoryEntries(user: string, store = new Map<string, StoredEntry>()) {
  let next = 1
  const defaultLocale = 'en'

  const lockError = () => new CmsDataError('locked', 'Being edited by another user')
  const entry = (id: string) => {
    const found = store.get(id)

    if (!found) {
      throw new CmsDataError('not_found', 'No entry')
    }

    return found
  }
  const checkToken = (id: string, token: string) => {
    if (entry(id).lock?.token !== token) {
      throw new CmsDataError('lock_lost', 'Lock lost')
    }
  }

  const repository: EditorRepository = {
    getEditable: vi.fn(async (id: string, locale: string | null) => {
      const found = entry(id)
      const shown = locale ?? defaultLocale
      return {
        key: id,
        locale: shown,
        defaultLocale,
        base: shown === defaultLocale ? null : (found.draft[defaultLocale] ?? found.published[defaultLocale] ?? null),
        draft: found.draft[shown] ?? null,
        draftUpdatedAt: found.draft[shown] ? '2026-11-24T10:00:00Z' : null,
        published: found.published[shown] ?? null,
        publishedAt: found.published[shown] ? '2026-11-24T09:00:00Z' : null,
        media: {},
      }
    }),
    getLocaleStates: vi.fn(async () => []),
    registerFields: vi.fn(async () => undefined),
    saveDraft: vi.fn(async (id: string, locale: string, content: Record<string, unknown>, token: string) => {
      checkToken(id, token)
      entry(id).draft[locale] = structuredClone(content)
      return '2026-11-24T10:00:00Z'
    }),
    publish: vi.fn(async (id: string, locale: string, token: string) => {
      checkToken(id, token)
      const found = entry(id)
      found.published[locale] = found.draft[locale]!
      found.draft = Object.fromEntries(Object.entries(found.draft).filter(([code]) => code !== locale))
      return '2026-11-24T11:00:00Z'
    }),
    restore: vi.fn(async () => null),
    listRevisions: vi.fn(async () => []),
    getRevision: vi.fn(async () => null),
    acquireLock: vi.fn(async (id: string) => {
      const found = entry(id)

      if (found.lock && found.lock.user !== user) {
        throw lockError()
      }

      found.lock = { user, token: `${user}-${next++}` }
      return found.lock.token
    }),
    heartbeatLock: vi.fn(async (id: string, token: string) => checkToken(id, token)),
    releaseLock: vi.fn(async (id: string, token: string) => {
      if (entry(id).lock?.token === token) {
        entry(id).lock = null
      }
    }),
    forceUnlock: vi.fn(async () => undefined),
    getLockStatus: vi.fn(async () => ({ userId: 'other', email: 'other@example.test', acquiredAt: '', heartbeatAt: '' }) as never),
    prepareUnloadRelease: vi.fn(async () => undefined),
    releaseLockOnUnload: vi.fn(),
  }

  /** cms_entry_create: document, draft and lock in one call; refuses an empty title. */
  const create = vi.fn(async (content: Record<string, unknown>, locale: string) => {
    if (typeof content.title !== 'string' || !content.title.trim()) {
      throw new CmsDataError('validation', 'A title is required')
    }

    const id = `entry-${next++}`
    const token = `${user}-${next++}`
    store.set(id, { draft: { [locale]: structuredClone(content) }, published: {}, lock: { user, token } })
    return { id, draftUpdatedAt: '2026-11-24T10:00:00Z', lockToken: token }
  })

  return { repository, create, store }
}

/** What a form field (useFormField) registers (the composable itself needs a component). */
function field(key: string, kind: 'input' | 'value', extra: Partial<FieldRegistration> = {}): FieldRegistration {
  return { id: `f-${key}`, key, kind, el: {} as HTMLElement, api: undefined, ...extra } as FieldRegistration
}

function newEntryEngine(user = 'me', store?: Map<string, StoredEntry>) {
  const entries = memoryEntries(user, store)
  const pending = createPendingDocumentRepository({
    repository: entries.repository,
    create: entries.create,
    defaultLocale: 'en',
  })
  const engine = createEditorEngine({ repository: pending.repository, locale: null, historyLimit: 50 })
  engine.registerField(field('title', 'input', { label: 'Title', required: true, maxLength: 10 }))
  engine.registerField(field('employment', 'value'))
  return { engine, pending, entries }
}

describe('G2: a new entry is created on its first save', () => {
  it('opens editable with nothing stored and no lock taken', async () => {
    const { engine, pending, entries } = newEntryEngine()
    await engine.load('new')

    expect(engine.status.value).toBe('ready')
    expect(engine.readOnly.value).toBe(false)
    expect(pending.id.value).toBeNull()
    expect(entries.store.size).toBe(0)
    expect(entries.repository.acquireLock).not.toHaveBeenCalled()
  })

  it('creates exactly one entry on Save, then saves into it', async () => {
    const { engine, pending, entries } = newEntryEngine()
    await engine.load('new')

    engine.set('title', 'Designer')
    expect(await engine.save()).toBe(true)
    expect(entries.create).toHaveBeenCalledTimes(1)
    expect(pending.id.value).toBe('entry-1')

    engine.set('title', 'Designer 2')
    expect(await engine.save()).toBe(true)
    expect(entries.create).toHaveBeenCalledTimes(1)
    expect(entries.store.get('entry-1')!.draft.en).toEqual({ title: 'Designer 2' })
    // The lock taken by create is the one used: no second acquire.
    expect(entries.repository.acquireLock).not.toHaveBeenCalled()
  })

  it('publishes a new entry in one click: create, then publish', async () => {
    const { engine, entries } = newEntryEngine()
    await engine.load('new')

    engine.set('title', 'Designer')
    expect(await engine.publish()).toBe(true)
    expect(entries.create).toHaveBeenCalledTimes(1)
    expect(entries.store.get('entry-1')!.published.en).toEqual({ title: 'Designer' })
    expect(engine.dirty.value).toBe(false)
  })

  it('keeps typing done while the create request is in flight', async () => {
    const { engine, entries } = newEntryEngine()
    let finish!: () => void
    const gate = new Promise<void>((resolve) => {
      finish = resolve
    })
    const create = entries.create.getMockImplementation()!
    entries.create.mockImplementationOnce(async (content, locale) => {
      await gate
      return create(content, locale)
    })

    await engine.load('new')
    engine.set('title', 'Designer')
    const saving = engine.save()
    // The save reads the document when it runs: type only once create is in flight.
    await vi.waitFor(() => expect(entries.create).toHaveBeenCalled())
    engine.set('title', 'Designer!')
    finish()
    await saving

    expect(engine.get('title')).toBe('Designer!')
    expect(engine.dirty.value).toBe(true)
    expect(engine.canUndo.value).toBe(true)
  })

  it('a failed create leaves nothing stored and the entry still new', async () => {
    const { engine, pending, entries } = newEntryEngine()
    await engine.load('new')

    engine.set('employment', 'full')
    expect(await engine.save()).toBe(false)
    expect(engine.saveError.value).toBeInstanceOf(CmsDataError)
    expect(pending.id.value).toBeNull()
    expect(entries.store.size).toBe(0)

    engine.set('title', 'Designer')
    expect(await engine.save()).toBe(true)
    expect(pending.id.value).toBe('entry-1')
  })

  it('closing before a save releases nothing and stores nothing', async () => {
    const { engine, entries } = newEntryEngine()
    await engine.load('new')
    engine.set('title', 'Draft only in memory')
    await engine.dispose()

    expect(entries.store.size).toBe(0)
    expect(entries.repository.releaseLock).not.toHaveBeenCalled()
  })

  it('releases the lock taken by create when the editor closes', async () => {
    const { engine, entries } = newEntryEngine()
    await engine.load('new')
    engine.set('title', 'Designer')
    await engine.save()
    await engine.dispose()

    expect(entries.store.get('entry-1')!.lock).toBeNull()
  })
})

describe('G2: form fields on the Engine', () => {
  it('validates an empty new entry: no value is an empty required field', async () => {
    const { engine } = newEntryEngine()
    await engine.load('new')

    expect(engine.issues.value).toEqual([expect.objectContaining({ key: 'title', kind: 'required' })])
    expect(await engine.publish()).toBe(false)

    engine.set('title', 'Far too long title')
    expect(engine.issues.value).toEqual([expect.objectContaining({ key: 'title', kind: 'maxLength' })])
  })

  it('Undo / Redo: typing until blur is one step', async () => {
    const { engine } = newEntryEngine()
    await engine.load('new')

    engine.beginEdit('title')
    engine.set('title', 'D')
    engine.set('title', 'De')
    engine.endEdit()
    engine.set('employment', 'part')

    engine.undo()
    expect(engine.get('employment')).toBeUndefined()
    engine.undo()
    expect(engine.get('title')).toBeUndefined()
    engine.redo()
    expect(engine.get('title')).toBe('De')
  })

  it('translation: an input is translated, a choice stays the original', async () => {
    const store = new Map<string, StoredEntry>()
    store.set('entry-9', {
      draft: {},
      published: { en: { title: 'Designer', employment: 'full' } },
      lock: null,
    })
    const entries = memoryEntries('me', store)
    const pending = createPendingDocumentRepository({ repository: entries.repository, create: entries.create, defaultLocale: 'en', id: 'entry-9' })
    const engine = createEditorEngine({ repository: pending.repository, locale: 'uk', historyLimit: 50 })
    engine.registerField(field('title', 'input', { required: true }))
    engine.registerField(field('employment', 'value'))
    await engine.load('entry-9')

    expect(engine.translating.value).toBe(true)
    expect(engine.isUntranslated(engine.fields.get('f-title')!)).toBe(true)
    expect(engine.isUntranslated(engine.fields.get('f-employment')!)).toBe(false)

    engine.set('title', 'Дизайнер')
    engine.set('employment', 'part')
    expect(engine.get('title')).toBe('Дизайнер')
    expect(engine.get('employment')).toBe('full')

    await engine.save()
    expect(store.get('entry-9')!.draft.uk).toEqual({ title: 'Дизайнер' })
  })

  it('a second session gets the entry read-only, and nothing is written', async () => {
    const store = new Map<string, StoredEntry>()
    store.set('entry-9', { draft: {}, published: { en: { title: 'Designer' } }, lock: { user: 'other', token: 't' } })
    const entries = memoryEntries('me', store)
    const pending = createPendingDocumentRepository({ repository: entries.repository, create: entries.create, defaultLocale: 'en', id: 'entry-9' })
    const engine = createEditorEngine({ repository: pending.repository, locale: null, historyLimit: 50 })
    engine.registerField(field('title', 'input'))
    await engine.load('entry-9')

    expect(engine.lock.value).toBe('locked')
    expect(engine.readOnly.value).toBe(true)
    engine.set('title', 'Mine')
    expect(engine.get('title')).toBe('Designer')
    expect(await engine.save()).toBe(false)
  })
})
