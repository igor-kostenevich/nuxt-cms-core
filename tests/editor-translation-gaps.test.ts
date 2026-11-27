import { describe, expect, it, vi } from 'vitest'
import { createEditorEngine, type EditorRepository } from '../app/editor/engine'
import type { FieldRegistration } from '../app/editor/kinds'

// The question before Publish names the languages that still lack translated
// texts (014 UX): a hint from what the editor has on screen, never a gate.

const ORIGINAL = {
  hero: { title: 'Home', subtitle: '', cta: { label: 'Start', href: '/x' }, image: { mediaId: 'm1', alt: 'A photo' } },
  note: 'Same everywhere',
}

function repository(translations: Record<string, Record<string, unknown> | 'fail'>): EditorRepository {
  return {
    getEditable: vi.fn(async (key: string, locale: string | null) => {
      const code = locale ?? 'en'
      const translation = translations[code]

      if (translation === 'fail') {
        throw new Error('unreadable')
      }

      return {
        key,
        locale: code,
        defaultLocale: 'en',
        base: code === 'en' ? null : ORIGINAL,
        draft: null,
        draftUpdatedAt: null,
        published: code === 'en' ? ORIGINAL : translation ?? {},
        publishedAt: '2026-11-24T10:00:00Z',
        media: {},
      }
    }),
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

function field(id: string, key: string, kind: FieldRegistration['kind'], extra: Record<string, unknown> = {}): FieldRegistration {
  return {
    id,
    key,
    kind,
    el: {} as HTMLElement,
    api: { decorative: () => false, defaultAlt: () => '', defaultLabel: () => '', ...extra.api as object },
    ...extra,
  } as FieldRegistration
}

async function page(translations: Record<string, Record<string, unknown> | 'fail'>) {
  const engine = createEditorEngine({ repository: repository(translations), locale: null, historyLimit: 20 })
  await engine.load('home')
  engine.registerField(field('title', 'hero.title', 'text'))
  engine.registerField(field('subtitle', 'hero.subtitle', 'text'))
  engine.registerField(field('cta', 'hero.cta', 'link'))
  engine.registerField(field('image', 'hero.image', 'image'))
  // Not a text: nothing to translate.
  engine.registerField(field('note', 'note', 'switch'))
  return engine
}

describe('translation gaps', () => {
  it('counts the texts of the original a language has not translated', async () => {
    const engine = await page({ uk: { 'hero.title': 'Головна' }, de: {} })

    // title is translated in uk; subtitle is empty (nothing to translate);
    // cta.label and image.alt are not.
    await expect(engine.translationGaps(['uk', 'de'])).resolves.toEqual([
      { locale: 'uk', missing: 2 },
      { locale: 'de', missing: 3 },
    ])
  })

  it('a fully translated language is not listed', async () => {
    const engine = await page({ uk: { 'hero.title': 'Головна', 'hero.cta.label': 'Почати', 'hero.image.alt': 'Фото' } })

    await expect(engine.translationGaps(['uk'])).resolves.toEqual([])
  })

  it('a text that exists only as the default in the page code counts', async () => {
    const engine = await page({ uk: { 'hero.title': 'Головна', 'hero.cta.label': 'Почати', 'hero.image.alt': 'Фото' } })
    engine.registerField(field('hint', 'hero.subtitle', 'text', { defaultText: () => 'A line from code' }))

    await expect(engine.translationGaps(['uk'])).resolves.toEqual([{ locale: 'uk', missing: 1 }])
  })

  it('a decorative image has no alt to translate', async () => {
    const engine = await page({ uk: { 'hero.title': 'Головна', 'hero.cta.label': 'Почати' } })
    engine.registerField(field('image', 'hero.image', 'image', { api: { decorative: () => true } }))

    await expect(engine.translationGaps(['uk'])).resolves.toEqual([])
  })

  it('a language that cannot be read is left out, the rest are still reported', async () => {
    const engine = await page({ uk: 'fail', de: {} })

    await expect(engine.translationGaps(['uk', 'de'])).resolves.toEqual([{ locale: 'de', missing: 3 }])
  })

  it('without languages there is nothing to ask', async () => {
    const engine = await page({})

    await expect(engine.translationGaps([])).resolves.toEqual([])
  })
})
