import { describe, expect, it, vi } from 'vitest'
import { createEditorEngine, type EditorRepository } from '../app/editor/engine'
import type { FieldRegistration } from '../app/editor/kinds'
import { createPendingDocumentRepository } from '../app/editor/pending'
import { fieldDefaults, fieldValueIssue, resolveContentFields, type CmsContentField } from '../src/content-fields'

// 014, C-103: fields of Core's entry form on the Editor Engine.

function repository(published: Record<string, unknown>, translation: Record<string, unknown> | null = null): EditorRepository {
  return {
    getEditable: vi.fn(async (key: string, locale: string | null) => ({
      key,
      locale: locale ?? 'en',
      defaultLocale: 'en',
      base: (locale ?? 'en') === 'en' ? null : published,
      draft: null,
      draftUpdatedAt: null,
      published: (locale ?? 'en') === 'en' ? published : translation,
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

const schema = resolveContentFields({
  title: { type: 'text', label: 'Title' },
  employment: { type: 'select', label: 'Employment', default: 'full', options: [{ value: 'full', label: 'Full' }, { value: 'part', label: 'Part' }] },
  skills: { type: 'multiselect', label: 'Skills', required: true, options: [{ value: 'vue', label: 'Vue' }, { value: 'sql', label: 'SQL' }] },
  remote: { type: 'boolean', label: 'Remote', default: false },
}).fields!

/** A field as useFormField registers it: the schema's own judgement of the value. */
function register(engine: ReturnType<typeof createEditorEngine>, key: string, field: CmsContentField, translatable = false) {
  engine.registerField({
    id: key,
    key,
    kind: translatable ? 'input' : 'value',
    el: {} as HTMLElement,
    label: key,
    form: true,
    validate: (value: unknown) => fieldValueIssue(field, value),
    api: undefined,
  } as FieldRegistration)
}

async function form(published: Record<string, unknown>, locale: string | null = null, translation: Record<string, unknown> | null = null) {
  const engine = createEditorEngine({ repository: repository(published, translation), locale, historyLimit: 20 })
  await engine.load('vacancy-1')

  for (const [key, field] of Object.entries(schema)) {
    register(engine, key, field, field.type === 'text')
  }

  return engine
}

describe('Core\'s entry form on the Engine', () => {
  it('each field is judged by its schema: empty multiselect required, an option no longer offered', async () => {
    const engine = await form({ title: 'QA', employment: 'contract', remote: false })

    expect(engine.issues.value.map(issue => `${issue.key}:${issue.kind}`)).toEqual(['employment:option', 'skills:required'])
    // The stored value stays as it was: nothing is cleaned up silently.
    expect(engine.get('employment')).toBe('contract')

    engine.set('employment', 'part')
    engine.set('skills', ['vue'])
    expect(engine.issues.value).toEqual([])
  })

  it('false is an answer; each discrete change is one Undo step', async () => {
    const engine = await form({ title: 'QA', employment: 'full', skills: ['vue'] })

    engine.set('remote', true)
    engine.set('remote', false)
    engine.set('skills', ['vue', 'sql'])
    expect(engine.issues.value).toEqual([])

    engine.undo()
    expect(engine.get('skills')).toEqual(['vue'])
    engine.undo()
    expect(engine.get('remote')).toBe(true)
    engine.redo()
    expect(engine.get('remote')).toBe(false)
  })

  it('in a translation only texts change; structure keeps the original', async () => {
    const engine = await form({ title: 'QA', employment: 'full', skills: ['vue'], remote: false }, 'uk')

    engine.set('title', 'Тестувальник')
    engine.set('employment', 'part')
    engine.set('skills', ['sql'])
    engine.set('remote', true)

    expect(engine.get('title')).toBe('Тестувальник')
    expect(engine.get('employment')).toBe('full')
    expect(engine.get('skills')).toEqual(['vue'])
    expect(engine.get('remote')).toBe(false)
  })
})

describe('defaults', () => {
  it('a new entry starts with them, without being "changed"', async () => {
    const pending = createPendingDocumentRepository({
      repository: repository({}),
      create: vi.fn(),
      defaultLocale: 'en',
      initial: () => fieldDefaults(schema),
    })
    const engine = createEditorEngine({ repository: pending.repository, locale: null, historyLimit: 20 })
    await engine.load('new')

    expect(engine.get('employment')).toBe('full')
    expect(engine.get('remote')).toBe(false)
    expect(engine.dirty.value).toBe(false)
  })

  it('an existing entry never gets them, also when the schema adds a field', async () => {
    const existing = repository({ title: 'Old vacancy' })
    const pending = createPendingDocumentRepository({
      repository: existing,
      create: vi.fn(),
      defaultLocale: 'en',
      id: 'vacancy-1',
      initial: () => fieldDefaults(schema),
    })
    const engine = createEditorEngine({ repository: pending.repository, locale: null, historyLimit: 20 })
    await engine.load('vacancy-1')

    expect(engine.get('employment')).toBeUndefined()
    expect(engine.get('remote')).toBeUndefined()
    expect(engine.dirty.value).toBe(false)
  })
})
