import { describe, expect, it, vi } from 'vitest'
import { createEditorEngine, type EditorRepository } from '../app/editor/engine'
import { entryChoiceProblem, moveEntryId } from '../app/editor/entries-choice'
import type { FieldRegistration } from '../app/editor/kinds'
import type { CmsEntryState } from '../app/types/entries'

// 014 §7 stage 6: a section of entries (<CmsEntries field-key>) stores only its
// choice in the page's document: Automatic { limit } or Manual { ids }.

const post = (patch: Partial<CmsEntryState> = {}): CmsEntryState => ({
  id: 'p1',
  type: 'post',
  title: 'Post',
  archived: false,
  publishedLocales: ['en'],
  ...patch,
})

describe('entryChoiceProblem', () => {
  const where = { type: 'post', defaultLocale: 'en', locale: 'en' }

  it('a published entry of the type is shown', () => {
    expect(entryChoiceProblem(post(), where)).toBeNull()
  })

  it('explains entries the site leaves out', () => {
    expect(entryChoiceProblem(undefined, where)).toBe('missing')
    expect(entryChoiceProblem(post({ type: 'vacancy' }), where)).toBe('missing')
    expect(entryChoiceProblem(post({ archived: true }), where)).toBe('archived')
    expect(entryChoiceProblem(post({ publishedLocales: [] }), where)).toBe('unpublished')
    // A translation alone does not publish an entry: the original does.
    expect(entryChoiceProblem(post({ publishedLocales: ['uk'] }), where)).toBe('unpublished')
  })

  it('in a language without a translation the original is shown', () => {
    expect(entryChoiceProblem(post(), { ...where, locale: 'uk' })).toBe('untranslated')
    expect(entryChoiceProblem(post({ publishedLocales: ['en', 'uk'] }), { ...where, locale: 'uk' })).toBeNull()
  })
})

describe('moveEntryId', () => {
  it('moves by one step and stops at the ends', () => {
    expect(moveEntryId(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b'])
    expect(moveEntryId(['a', 'b', 'c'], 'a', 1)).toEqual(['b', 'a', 'c'])
    expect(moveEntryId(['a', 'b'], 'a', -1)).toEqual(['a', 'b'])
    expect(moveEntryId(['a', 'b'], 'x', 1)).toEqual(['a', 'b'])
  })
})

function repository(defaultLocale = 'en'): EditorRepository {
  return {
    getEditable: vi.fn(async (key: string, locale: string | null) => ({
      key,
      locale: locale ?? defaultLocale,
      defaultLocale,
      base: (locale ?? defaultLocale) === defaultLocale ? null : { blog: { posts: { mode: 'manual', ids: ['p1'] } } },
      draft: null,
      draftUpdatedAt: null,
      published: (locale ?? defaultLocale) === defaultLocale ? { blog: { posts: { mode: 'manual', ids: ['p1'] } } } : {},
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

function section(engine: ReturnType<typeof createEditorEngine>): FieldRegistration {
  return {
    id: 'posts',
    key: 'blog.posts',
    kind: 'entries',
    el: {} as HTMLElement,
    api: { type: () => 'post', limit: () => 3, max: () => 6, shown: () => ['p1'] },
    foreign: () => engine.isForeign('blog.posts', engine.get('blog.posts')),
  }
}

describe('a section of entries in the Engine', () => {
  it('stores the choice in the page document, with Undo', async () => {
    const engine = createEditorEngine({ repository: repository(), locale: null, historyLimit: 20 })
    await engine.load('home')
    engine.registerField(section(engine))

    engine.set('blog.posts', { mode: 'manual', ids: ['p2', 'p1'] })
    expect(engine.get('blog.posts')).toEqual({ mode: 'manual', ids: ['p2', 'p1'] })
    expect(engine.changed('blog.posts')).toBe(true)

    engine.set('blog.posts', { mode: 'automatic', limit: 4 })
    engine.undo()
    expect(engine.get('blog.posts')).toEqual({ mode: 'manual', ids: ['p2', 'p1'] })
  })

  it('is structure: a translation does not change it', async () => {
    const engine = createEditorEngine({ repository: repository(), locale: 'uk', historyLimit: 20 })
    await engine.load('home')
    engine.registerField(section(engine))

    engine.set('blog.posts', { mode: 'automatic', limit: 2 })
    expect(engine.get('blog.posts')).toEqual({ mode: 'manual', ids: ['p1'] })
    expect(engine.dirty.value).toBe(false)
  })
})
