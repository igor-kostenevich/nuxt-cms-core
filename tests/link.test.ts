import { describe, expect, it } from 'vitest'
import { resolveCmsLink, toSafeHref } from '../app/primitives/link'

describe('toSafeHref', () => {
  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    '  javascript:alert(1)',
    '\u0001javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
  ])('rejects a dangerous scheme: %j', (href) => {
    expect(toSafeHref(href)).toBeNull()
  })

  it.each([
    '',
    '   ',
    'about',
    'www.example.com',
    './about',
    '?q=1',
    '/ab\u0000out',
    '/\\evil.com',
    '\\\\evil.com',
  ])('rejects what is neither an allowed scheme nor a site path: %j', (href) => {
    expect(toSafeHref(href)).toBeNull()
  })

  it.each([null, undefined, 42, {}, ['/about']])('rejects a non-string value: %j', (href) => {
    expect(toSafeHref(href)).toBeNull()
  })

  it.each([
    '/about',
    '/about#team',
    '#contacts',
    '//cdn.example.com/file.pdf',
    'https://example.com',
    'HTTP://example.com',
    'mailto:hello@example.com',
    'tel:+380441234567',
  ])('allows %j', (href) => {
    expect(toSafeHref(href)).toBe(href)
  })

  it('trims edge whitespace and drops tabs and newlines like the URL parser', () => {
    expect(toSafeHref('  /about\n')).toBe('/about')
    expect(toSafeHref('https://exa\tmple.com')).toBe('https://example.com')
  })
})

describe('resolveCmsLink', () => {
  it('returns null for an unsafe href', () => {
    expect(resolveCmsLink('javascript:alert(1)', true)).toBeNull()
  })

  it('adds target and rel only for a new tab', () => {
    expect(resolveCmsLink('/about')).toEqual({ href: '/about' })
    expect(resolveCmsLink('https://example.com', true)).toEqual({
      href: 'https://example.com',
      target: '_blank',
      rel: 'noopener noreferrer',
    })
  })
})
