import { describe, expect, it } from 'vitest'
import fixture from './fixtures/translation.json'
import fits from './fixtures/translation-fits.json'
import { applyTranslation, isTranslationAddress, pruneTranslation, translationFits } from '../app/primitives/translation'

// The same fixture is checked against cms_content_set in
// supabase/tests/database/cms_localization.test.sql: both sides must agree,
// because the Texts screen writes the original in SQL (010d).
describe('page translations (C-78)', () => {
  it('applies translated leaves to the base: missing objects are created, stale items skipped', () => {
    expect(applyTranslation(fixture.base, fixture.translation)).toEqual(fixture.applied)
  })

  it('does not change the base it applies to', () => {
    const base = structuredClone(fixture.base)
    applyTranslation(base, fixture.translation)
    expect(base).toEqual(fixture.base)
  })

  it('never writes through prototype keys', () => {
    applyTranslation({}, { '__proto__.polluted': 'yes', 'constructor.prototype.polluted': 'yes' })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(isTranslationAddress('__proto__.x')).toBe(false)
    expect(isTranslationAddress('hero.title')).toBe(true)
  })

  it('keeps only leaves the base can hold', () => {
    expect(pruneTranslation(fixture.base, fixture.translation)).toEqual(fixture.pruned)
  })

  it('shows a new original where a language has no translation, and the translation where it has one (C-89)', () => {
    // Published original before and after the Texts screen changed two texts.
    const before = { hero: { title: 'We build websites', lead: 'For small business' } }
    const after = { hero: { title: 'We build CRM systems', lead: 'For any business' } }
    const uk = { 'hero.lead': 'Для малого бізнесу' }

    expect(applyTranslation(before, uk)).toEqual({ hero: { title: 'We build websites', lead: 'Для малого бізнесу' } })
    // The untranslated title follows the new original; the translated lead stays.
    expect(applyTranslation(after, uk)).toEqual({ hero: { title: 'We build CRM systems', lead: 'Для малого бізнесу' } })
  })

  it('treats anything but an object as an empty base or translation', () => {
    expect(applyTranslation(null, { 'a.b': 'c' })).toEqual({ a: { b: 'c' } })
    expect(applyTranslation({ a: 1 }, null)).toEqual({ a: 1 })
  })
})

// A translation changes texts only. The same cases run against
// cms_page_text_fits in supabase/tests/database/cms_translation_texts.test.sql.
describe('translations change texts only (C-78)', () => {
  it.each(fits.cases.map(item => [item.address, JSON.stringify(item.value), item.fits, item.value] as const))(
    '%s = %s fits: %s',
    (address, _shown, expected, value) => {
      expect(translationFits(fits.base, address, value)).toBe(expected)
    },
  )

  const forged = {
    'quote.visibility.hidden': 'x',
    'quote.visibility': 'x',
    'hero.cta.newTab': 'false',
    'hero.cta': 'Go!',
    'hero.lead.type': 'x',
    'hero.title.deep': 'x',
  }

  it('skips a stored leaf that would change structure, and keeps the texts', () => {
    const shown = applyTranslation(fits.base, { ...forged, 'hero.title': 'Привіт', 'hero.cta.label': 'Вперед' })

    expect(shown.quote).toEqual(fits.base.quote)
    expect(shown.hero).toEqual({ ...fits.base.hero, title: 'Привіт', cta: { ...fits.base.hero.cta, label: 'Вперед' } })
  })

  it('translates a field the base does not store yet: its value is in code', () => {
    expect(applyTranslation({}, { 'about.title': 'Про нас', 'about.cta.label': 'Детальніше' }))
      .toEqual({ about: { title: 'Про нас', cta: { label: 'Детальніше' } } })
  })

  it('prunes leaves that no longer fit the base', () => {
    expect(pruneTranslation(fits.base, { ...forged, 'hero.title': 'Привіт' })).toEqual({ 'hero.title': 'Привіт' })
  })
})
