import { describe, expect, it } from 'vitest'
import {
  hashClientAddress,
  isPrivateAddress,
  normalizeClientAddress,
  parseClientAddressSource,
  resolveClientAddress,
  type CmsClientAddressSource,
} from '../server/cms/client-address'

const production = { vercel: false, dev: false }

function request(headers: Record<string, string>, socket?: string) {
  return { header: (name: string) => headers[name], socket }
}

describe('parseClientAddressSource', () => {
  it('trusts no header by default outside Vercel', () => {
    expect(parseClientAddressSource(undefined, production)).toEqual({ kind: 'none' })
    expect(parseClientAddressSource('auto', production)).toEqual({ kind: 'none' })
    expect(parseClientAddressSource('', { vercel: true, dev: false })).toEqual({ kind: 'vercel' })
    expect(parseClientAddressSource('auto', { vercel: false, dev: true })).toEqual({ kind: 'socket' })
  })

  it('reads the explicit sources', () => {
    expect(parseClientAddressSource('socket', production)).toEqual({ kind: 'socket' })
    expect(parseClientAddressSource(' Cloudflare ', production)).toEqual({ kind: 'cloudflare' })
    expect(parseClientAddressSource('proxy', production)).toEqual({ kind: 'proxy', hops: 1 })
    expect(parseClientAddressSource('proxy:2', production)).toEqual({ kind: 'proxy', hops: 2 })
  })

  it('refuses what it does not know', () => {
    expect(parseClientAddressSource('x-forwarded-for', production)).toBeNull()
    expect(parseClientAddressSource('proxy:0', production)).toBeNull()
    expect(parseClientAddressSource('true', production)).toBeNull()
  })
})

describe('resolveClientAddress', () => {
  const spoofed = { 'x-forwarded-for': '6.6.6.6, 203.0.113.9', 'cf-connecting-ip': '6.6.6.6' }

  it('ignores every header with none or socket', () => {
    expect(resolveClientAddress({ kind: 'none' }, request(spoofed, '198.51.100.1'))).toBeNull()
    expect(resolveClientAddress({ kind: 'socket' }, request(spoofed, '198.51.100.1'))).toBe('198.51.100.1')
    expect(resolveClientAddress({ kind: 'socket' }, request(spoofed, '::ffff:198.51.100.1'))).toBe('198.51.100.1')
  })

  it('has no address rather than a shared one', () => {
    expect(resolveClientAddress({ kind: 'socket' }, request({}))).toBeNull()
    expect(resolveClientAddress({ kind: 'vercel' }, request({}))).toBeNull()
    expect(resolveClientAddress({ kind: 'cloudflare' }, request({ 'cf-connecting-ip': 'unknown' }))).toBeNull()
  })

  it('takes the address of the platform header', () => {
    expect(resolveClientAddress({ kind: 'vercel' }, request({ 'x-forwarded-for': '203.0.113.9' }))).toBe('203.0.113.9')
    expect(resolveClientAddress({ kind: 'cloudflare' }, request({ 'cf-connecting-ip': '203.0.113.9' }))).toBe('203.0.113.9')
  })

  it('takes the entry the trusted proxies wrote, not the one the client sent', () => {
    const one: CmsClientAddressSource = { kind: 'proxy', hops: 1 }
    const two: CmsClientAddressSource = { kind: 'proxy', hops: 2 }

    expect(resolveClientAddress(one, request(spoofed, '127.0.0.1'))).toBe('203.0.113.9')
    expect(resolveClientAddress(two, request(spoofed, '10.0.0.2'))).toBe('6.6.6.6')
    expect(resolveClientAddress(two, request({ 'x-forwarded-for': '203.0.113.9' }, '10.0.0.2'))).toBeNull()
  })

  it('does not believe the header when the request skipped the proxy', () => {
    expect(resolveClientAddress({ kind: 'proxy', hops: 1 }, request(spoofed, '198.51.100.1'))).toBeNull()
    expect(resolveClientAddress({ kind: 'proxy', hops: 1 }, request(spoofed))).toBeNull()
  })
})

describe('normalizeClientAddress', () => {
  it('cuts IPv6 to its /64 network', () => {
    expect(normalizeClientAddress('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64')
    expect(normalizeClientAddress('2001:DB8:1:2:ffff:ffff:ffff:ffff')).toBe('2001:db8:1:2::/64')
    expect(normalizeClientAddress('[2001:db8::1]')).toBe('2001:db8:0:0::/64')
    expect(normalizeClientAddress('fe80::1%eth0')).toBe('fe80:0:0:0::/64')
  })

  it('keeps IPv4 and refuses what is not an address', () => {
    expect(normalizeClientAddress(' 203.0.113.9 ')).toBe('203.0.113.9')
    expect(normalizeClientAddress('unknown')).toBeNull()
    expect(normalizeClientAddress('203.0.113.9:443')).toBeNull()
    expect(normalizeClientAddress(undefined)).toBeNull()
  })
})

describe('isPrivateAddress', () => {
  it('knows the addresses a proxy of the site has', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.1', '192.168.1.1', '::1', 'fd00::1', 'fe80::1']) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }

    for (const ip of ['172.32.0.1', '8.8.8.8', '2001:db8::1', '::2']) {
      expect(isPrivateAddress(ip), ip).toBe(false)
    }
  })
})

describe('hashClientAddress', () => {
  it('is stable per secret and does not show the address', () => {
    const hash = hashClientAddress('203.0.113.9', 'secret')

    expect(hash).toHaveLength(32)
    expect(hash).toBe(hashClientAddress('203.0.113.9', 'secret'))
    expect(hash).not.toBe(hashClientAddress('203.0.113.9', 'other'))
    expect(hash).not.toContain('203')
  })
})
