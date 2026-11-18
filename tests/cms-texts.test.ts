import { describe, expect, it } from 'vitest'
import { resolveCmsTexts } from '../src/texts'

describe('cms.texts.ts', () => {
  it('takes plain strings and texts with a context, sorted by key', () => {
    expect(resolveCmsTexts({
      'nav.about': 'About',
      'form.sent': { text: 'Thanks!', context: 'Toast after sending' },
    })).toEqual({
      texts: [
        { key: 'form.sent', text: 'Thanks!', context: 'Toast after sending' },
        { key: 'nav.about', text: 'About' },
      ],
      ignored: [],
    })
  })

  it('drops bad keys and missing texts with a reason, instead of failing the build', () => {
    const { texts, ignored } = resolveCmsTexts({
      'bad key': 'x',
      'nav..about': 'x',
      'empty': '',
      'number': 42,
      'long': 'x'.repeat(2001),
      'ok': 'Fine',
    })

    expect(texts.map(text => text.key)).toEqual(['ok'])
    expect(ignored).toEqual([
      { key: 'bad key', reason: 'key' },
      { key: 'nav..about', reason: 'key' },
      { key: 'empty', reason: 'text' },
      { key: 'number', reason: 'text' },
      { key: 'long', reason: 'text' },
    ])
  })

  it('treats a missing or odd file as no texts', () => {
    expect(resolveCmsTexts(undefined).texts).toEqual([])
    expect(resolveCmsTexts(['a']).texts).toEqual([])
  })
})
