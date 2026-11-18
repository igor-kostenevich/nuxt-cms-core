import { describe, expect, it } from 'vitest'
import fixture from './fixtures/translation.json'
import { applyTranslation, isTranslationAddress, pruneTranslation } from '../app/primitives/translation'

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
