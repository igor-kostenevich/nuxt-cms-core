import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectionItems, defaultIdsIssue, warnDefaultIds, withDefaultIds } from '../app/primitives/collection'
import { applyTranslation } from '../app/primitives/translation'

const defaults = [
  { title: 'One', cta: { label: 'Go', href: '/a' } },
  { title: 'Two', cta: { label: 'Go', href: '/b' } },
]

describe('collectionItems', () => {
  it('uses stored items when the list is stored', () => {
    expect(collectionItems([{ id: 'x1', title: 'Stored' }, { title: 'no id' }], defaults))
      .toEqual([{ id: 'x1', title: 'Stored' }])
  })

  it('gives code defaults stable default-N ids', () => {
    expect(collectionItems(null, defaults).map(item => item.id)).toEqual(['default-0', 'default-1'])
  })

  it('lays a translation of code defaults over them, by id and field by field (C-78)', () => {
    const items = collectionItems({ 'default-1': { title: 'Два', cta: { label: 'Вперед' } }, 'gone': { title: 'x' } }, defaults)

    expect(items).toEqual([
      { id: 'default-0', title: 'One', cta: { label: 'Go', href: '/a' } },
      // The href stays the default language's: only the label is translated.
      { id: 'default-1', title: 'Два', cta: { label: 'Вперед', href: '/b' } },
    ])
  })

  it('ignores prototype keys in a stored translation', () => {
    const items = collectionItems(JSON.parse('{"default-0": {"__proto__": {"polluted": true}, "title": "Один"}}'), defaults)

    expect(items[0]!.title).toBe('Один')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('stable ids of code defaults (C-88)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses the ids the code gives', () => {
    expect(withDefaultIds([{ id: 'design', title: 'Design' }, { id: 'build', title: 'Build' }]).map(item => item.id))
      .toEqual(['design', 'build'])
  })

  it('falls back to positions for the whole list when an id is missing, invalid or used twice', () => {
    const cases = [
      [{ id: 'design' }, { title: 'no id' }],
      [{ id: 'design' }, { id: 'bad id' }],
      [{ id: 'design' }, { id: 'design' }],
      [{ id: 'design' }, { id: 7 }],
    ]

    for (const defaults of cases) {
      expect(withDefaultIds(defaults).map(item => item.id), JSON.stringify(defaults)).toEqual(['default-0', 'default-1'])
    }

    expect(defaultIdsIssue([{ title: 'x' }])).toBe('missing')
    expect(defaultIdsIssue([{ id: 'a' }, { id: 'a' }])).toBe('invalid')
    expect(defaultIdsIssue([{ id: 'a' }, { id: 'b' }])).toBeNull()
    expect(defaultIdsIssue([])).toBeNull()
  })

  it('keeps an override on its item when the code reorders the defaults', () => {
    const overrides = { build: { title: 'Розробка' } }
    const before = collectionItems(overrides, [{ id: 'design', title: 'Design' }, { id: 'build', title: 'Build' }])
    const after = collectionItems(overrides, [{ id: 'build', title: 'Build' }, { id: 'design', title: 'Design' }])

    expect(before.find(item => item.id === 'build')!.title).toBe('Розробка')
    expect(after[0]).toEqual({ id: 'build', title: 'Розробка' })
    expect(after[1]).toEqual({ id: 'design', title: 'Design' })
  })

  it('keeps the hint out of production builds (import.meta.dev is off here)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    warnDefaultIds('test.ids', [{ title: 'no id' }])

    expect(warn).not.toHaveBeenCalled()
  })
})

describe('public render of a collection with pinned ids and a translation (C-88)', () => {
  // A collection that had translations by position: the developer pinned the
  // old ids in the current order and added a new item with its own id.
  const defaults = [
    { id: 'default-0', title: 'Strategy' },
    { id: 'default-1', title: 'Design' },
    { id: 'pricing', title: 'Pricing' },
  ]
  const translation = {
    'services.default-0.title': 'Стратегія',
    'services.pricing.title': 'Ціни',
  }

  /** What the site shows: base with the translation applied (getByKey), then CmsCollection. */
  function render(base: Record<string, unknown>, codeDefaults = defaults) {
    const page = applyTranslation(base, translation) as { services?: unknown }
    return collectionItems(page.services, codeDefaults).map(item => [item.id, item.title])
  }

  it('(a) applies the translation to code defaults the original never stored', () => {
    expect(render({})).toEqual([
      ['default-0', 'Стратегія'],
      ['default-1', 'Design'],
      ['pricing', 'Ціни'],
    ])
  })

  it('(b) applies the translation to the list the original stored with the same ids', () => {
    // What Edit Mode stores on the first change: the code defaults with their ids.
    const stored = { services: withDefaultIds(defaults).map(item => ({ ...item })) }
    stored.services[1]!.title = 'Brand design'

    expect(render(stored)).toEqual([
      ['default-0', 'Стратегія'],
      ['default-1', 'Brand design'],
      ['pricing', 'Ціни'],
    ])
  })

  it('keeps the translation on its item when the code reorders pinned defaults', () => {
    const reordered = [defaults[2]!, defaults[1]!, defaults[0]!]

    expect(render({}, reordered)).toEqual([
      ['pricing', 'Ціни'],
      ['default-1', 'Design'],
      ['default-0', 'Стратегія'],
    ])
  })

  it('does not put a translation on another item when ids change without a pin', () => {
    // The developer renamed the ids instead of pinning: the old addresses no
    // longer match, so the code text shows rather than a wrong translation.
    const renamed = [{ id: 'strategy', title: 'Strategy' }, { id: 'design', title: 'Design' }]

    expect(render({}, renamed)).toEqual([
      ['strategy', 'Strategy'],
      ['design', 'Design'],
    ])
  })
})
