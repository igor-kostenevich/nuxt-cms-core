import { describe, expect, it } from 'vitest'
import { SLUG_FORMAT, slugify } from '../app/admin/slug'

describe('slugify', () => {
  it('lowercases and joins words with single hyphens', () => {
    expect(slugify('  Why We Prototype   in Code! ')).toBe('why-we-prototype-in-code')
  })

  it('transliterates Ukrainian and Russian', () => {
    expect(slugify('Спокійні інтерфейси')).toBe('spokiini-interfeisy')
    expect(slugify("Ґанок і м'ята")).toBe('ganok-i-miata')
    expect(slugify('Щастя є')).toBe('shchastia-ie')
    expect(slugify('Ёлка')).toBe('iolka')
  })

  it('drops accents', () => {
    expect(slugify('Café déjà vu')).toBe('cafe-deja-vu')
  })

  it('keeps at most 80 characters, never ending on a hyphen', () => {
    const slug = slugify(`${'a'.repeat(79)} b`)
    expect(slug.length).toBeLessThanOrEqual(80)
    expect(slug.endsWith('-')).toBe(false)
  })

  it('gives a valid address or an empty one', () => {
    for (const title of ['Hello', '2026 — plans', '!!!', 'Ж', 'a/b\\c']) {
      const slug = slugify(title)
      expect(slug === '' || SLUG_FORMAT.test(slug)).toBe(true)
    }
    expect(slugify('!!!')).toBe('')
  })
})
