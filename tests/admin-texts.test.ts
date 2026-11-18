import { describe, expect, it } from 'vitest'
import { buildTextGroups, draftSummary, isTextTarget, throughStoredList, type PageTextRow, type SiteTextRow } from '../app/admin/texts'

const pages = [{
  key: 'home',
  editPath: '/',
  fields: [
    { address: 'hero.title', kind: 'text', label: 'Title', defaultText: 'From code', section: null, position: null, tag: null, item: null },
    { address: 'hero.cta', kind: 'button', label: null, defaultText: 'Start', section: null, position: null, tag: null, item: null },
    { address: 'hero.lead', kind: 'richText', label: null, defaultText: 'Lead from code', section: null, position: null, tag: null, item: null },
    { address: 'work.items.default-1.title', kind: 'text', label: null, defaultText: 'Atlas', section: null, position: null, tag: null, item: null },
  ],
}]

const contents = [
  { key: 'home', locale: 'uk', draft: null, draftUpdatedAt: null, published: { hero: { title: 'Привіт', cta: { label: 'Почати', href: '/' } } } },
  { key: 'home', locale: 'en', draft: { 'hero.title': 'Hello' }, draftUpdatedAt: '2026-11-18T12:36:42.041292+00:00', published: null },
]

const codeTexts = [
  { key: 'nav.about', text: 'About', context: 'Menu' },
  { key: 'form.sent', text: 'Thanks!' },
]

const siteTexts = [
  { key: 'nav.about', locale: 'uk', value: 'Про нас' },
  { key: 'nav.about', locale: 'en', value: 'About us' },
]

function build(locale: string) {
  return buildTextGroups({ pages, contents, siteTexts, codeTexts, defaultLocale: 'uk', locale, textsTitle: group => group })
}

describe('Texts screen rows (C-86)', () => {
  it('shows stored texts of the default language, else the text from code', () => {
    const rows = build('uk')[0]!.rows as PageTextRow[]

    expect(rows.map(row => [row.address, row.original, row.missing])).toEqual([
      ['hero.title', 'Привіт', false],
      ['hero.cta', 'Почати', false],
      ['hero.lead', 'Lead from code', false],
      ['work.items.default-1.title', 'Atlas', false],
    ])
  })

  it('pairs each text with its translation and marks the missing ones', () => {
    const rows = build('en')[0]!.rows as PageTextRow[]
    const byAddress = Object.fromEntries(rows.map(row => [row.address, row]))

    expect(byAddress['hero.title']).toMatchObject({ translation: 'Hello', missing: false, leaf: 'hero.title' })
    expect(byAddress['hero.cta']).toMatchObject({ translation: '', missing: true, leaf: 'hero.cta.label' })
    expect(byAddress['hero.lead']).toMatchObject({ rich: true, missing: true })
    // An item that is still a code default is translated by its default-N id.
    expect(byAddress['work.items.default-1.title']).toMatchObject({ translatable: true, missing: true, original: 'Atlas' })
    expect(build('en')[0]!.missing).toBe(3)
  })

  it('groups site texts by their first key segment, with the stored value or the code text', () => {
    const groups = build('en').filter(group => group.kind === 'texts')

    expect(groups.map(group => group.title)).toEqual(['nav', 'form'])
    const about = groups[0]!.rows[0] as SiteTextRow
    expect(about).toMatchObject({ original: 'Про нас', translation: 'About us', missing: false, context: 'Menu' })
    const sent = groups[1]!.rows[0] as SiteTextRow
    expect(sent).toMatchObject({ original: 'Thanks!', translation: '', missing: true })
  })
})

describe('editing the original on the Texts screen (C-89)', () => {
  it('shows what the draft stores for a text, and whether it can go back to the code', () => {
    const rows = build('uk')[0]!.rows as PageTextRow[]
    const byAddress = Object.fromEntries(rows.map(row => [row.address, row]))

    // Stored by the original: it can go back to the text from code.
    expect(byAddress['hero.title']).toMatchObject({ stored: 'Привіт', resettable: true })
    expect(byAddress['hero.cta']).toMatchObject({ stored: 'Почати', resettable: true, leaf: 'hero.cta.label' })
    // Shown from code: nothing stored, nothing to reset.
    expect(byAddress['work.items.default-1.title']).toMatchObject({ stored: '', resettable: false })
  })

  it('does not offer the text from code inside a list the original stored', () => {
    const stored = [{
      key: 'home',
      locale: 'uk',
      draft: { work: { items: [{ id: 'default-1', title: 'Atlas 2' }] } },
      draftUpdatedAt: '2026-11-18T12:00:00.000001+00:00',
      published: null,
    }]
    const rows = buildTextGroups({ pages, contents: stored, siteTexts, codeTexts, defaultLocale: 'uk', locale: 'uk', textsTitle: group => group })[0]!.rows as PageTextRow[]
    const item = rows.find(row => row.address === 'work.items.default-1.title')!

    expect(item).toMatchObject({ stored: 'Atlas 2', inStoredList: true, resettable: false })
  })

  it('knows a text outside a stored list before anything is stored for it', () => {
    const rows = build('uk')[0]!.rows as PageTextRow[]

    // Emptied while its first write is in flight, the text still goes back to the code.
    expect(rows.find(row => row.address === 'work.items.default-1.title'))
      .toMatchObject({ stored: '', inStoredList: false, resettable: false })
  })

  it('keeps rows of different languages apart: what is typed belongs to one language', () => {
    const ids = (locale: string) => build(locale).flatMap(group => group.rows.map(row => row.id))
    const original = ids('uk')
    const translation = ids('en')

    expect(new Set(original).size).toBe(original.length)
    expect(original.filter(id => translation.includes(id))).toEqual([])
  })

  it('tells an address through a stored list', () => {
    const doc = { work: { items: [{ id: 'a', title: 'x' }] }, hero: { title: 'y' } }

    expect(throughStoredList(doc, 'work.items.a.title')).toBe(true)
    expect(throughStoredList(doc, 'hero.title')).toBe(false)
    expect(throughStoredList(doc, 'services.design.title')).toBe(false)
    expect(throughStoredList(null, 'hero.title')).toBe(false)
  })
})

describe('what publishing a draft would change (C-89)', () => {
  const fields = [
    { address: 'hero.title', kind: 'text' },
    { address: 'hero.cta', kind: 'button' },
    { address: 'hero.image', kind: 'image' },
    { address: 'about.body', kind: 'richText' },
    { address: 'services.a.title', kind: 'text' },
  ]
  const published = {
    hero: { title: 'Hi', cta: { label: 'Go', href: '/a' }, image: { mediaId: 'm1', alt: 'Studio' } },
    services: [{ id: 'a', title: 'One' }, { id: 'b', title: 'Two' }],
  }

  it('counts text changes of the original, also a text new to the draft', () => {
    const draft = structuredClone(published) as Record<string, unknown> & typeof published
    draft.hero.title = 'Hello'
    draft.hero.cta.label = 'Start'
    draft.services[0]!.title = 'First'

    expect(draftSummary(published, draft, fields, true)).toEqual({ texts: 3, other: false })
    expect(draftSummary({}, { hero: { cta: { label: 'Start' } } }, fields, true)).toEqual({ texts: 1, other: false })
  })

  it('flags changes made in the editor: image, href, order, rich text', () => {
    const image = structuredClone(published)
    image.hero.image.mediaId = 'm2'
    const href = structuredClone(published)
    href.hero.cta.href = '/b'
    const order = structuredClone(published)
    order.services.reverse()
    const rich = { ...structuredClone(published), about: { body: { type: 'doc', content: [] } } }

    for (const draft of [image, href, order, rich]) {
      expect(draftSummary(published, draft, fields, true).other, JSON.stringify(draft)).toBe(true)
    }

    const both = structuredClone(image)
    both.hero.title = 'Hello'
    expect(draftSummary(published, both, fields, true)).toEqual({ texts: 1, other: true })
  })

  it('does not take a link, media or structure for a text because the registry says so', () => {
    // The registry is written by the client: a forged or outdated entry.
    const forged = [
      ...fields,
      { address: 'hero.cta.href', kind: 'text' },
      { address: 'hero.image.mediaId', kind: 'text' },
      { address: 'hero.image', kind: 'text' },
    ]
    const href = structuredClone(published)
    href.hero.cta.href = 'https://example.com'
    const media = structuredClone(published)
    media.hero.image.mediaId = 'm2'
    const replaced = { ...structuredClone(published), hero: { ...published.hero, image: 'Studio' } }

    for (const draft of [href, media, replaced]) {
      expect(draftSummary(published, draft, forged, true), JSON.stringify(draft)).toEqual({ texts: 0, other: true })
    }

    expect(draftSummary({}, { 'hero.cta.href': '/b' }, [{ address: 'hero.cta.href', kind: 'text' }], false))
      .toEqual({ texts: 0, other: true })

    // A switch or a rich text document reached through a forged text entry.
    const hidden = { ...structuredClone(published), quote: { visibility: { hidden: 'yes' } } }
    const doc = { ...structuredClone(published), about: { body: { type: 'doc', content: [] } } }
    const docChanged = { ...structuredClone(published), about: { body: { type: 'x', content: [] } } }

    expect(draftSummary(published, hidden, [{ address: 'quote.visibility.hidden', kind: 'text' }], true))
      .toEqual({ texts: 0, other: true })
    expect(draftSummary(doc, docChanged, [{ address: 'about.body.type', kind: 'text' }], true))
      .toEqual({ texts: 0, other: true })
  })

  it('tells a leaf that can hold a text, like cms_page_text_target', () => {
    const doc = {
      hero: { title: 'Hi', cta: { label: 'Go', href: '/a' }, image: { mediaId: 'm1', alt: 'Studio' } },
      about: { body: { type: 'doc', content: [] } },
      services: [{ id: 'a', title: 'One' }],
    }

    for (const address of ['hero.title', 'hero.cta.label', 'hero.image.alt', 'services.a.title', 'hero.new', 'faq.items.q1.answer']) {
      expect(isTextTarget(doc, address, true), address).toBe(true)
    }

    for (const address of ['hero.cta.href', 'hero.image.mediaId', 'hero.cta.newTab', 'hero.image.focal', 'hero.image.decorative',
      'quote.visibility.hidden', 'services.a.id', 'hero.image', 'services', 'about.body', 'about.body.type', 'hero.title.x']) {
      expect(isTextTarget(doc, address, true), address).toBe(false)
    }

    expect(isTextTarget({ 'hero.title': 'Hi' }, 'hero.title', false)).toBe(true)
    expect(isTextTarget({ 'hero.cta.href': '/a' }, 'hero.cta.href', false)).toBe(false)
  })

  it('makes a row read-only where the page holds no text any more', () => {
    const outdated = [{
      ...pages[0]!,
      fields: [{ address: 'hero.cta', kind: 'text', label: null, defaultText: 'Start', section: null, position: null, tag: null, item: null }],
    }]
    const rows = buildTextGroups({ pages: outdated, contents, siteTexts, codeTexts, defaultLocale: 'uk', locale: 'uk', textsTitle: group => group })[0]!.rows as PageTextRow[]

    // The field became a button: the original stores an object there.
    expect(rows[0]).toMatchObject({ address: 'hero.cta', translatable: false })
  })

  it('compares a translation leaf by leaf', () => {
    expect(draftSummary({ 'hero.title': 'Привіт' }, { 'hero.title': 'Вітаю', 'hero.cta.label': 'Почати' }, fields, false))
      .toEqual({ texts: 2, other: false })
    expect(draftSummary(null, { 'about.body': { type: 'doc', content: [] } }, fields, false))
      .toEqual({ texts: 0, other: true })
  })
})
