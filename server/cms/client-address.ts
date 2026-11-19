import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'

/**
 * Where the visitor address for the rate limits of forms comes from (011,
 * R-10). Pure helpers, unit tested; the route reads the headers and the socket.
 *
 * A client can write any header, so none is trusted by default. The source is
 * the runtime option `cms.clientAddress` (NUXT_CMS_CLIENT_ADDRESS):
 *
 *   auto        (default) `vercel` on Vercel, `socket` in development, else `none`
 *   none        no address: only the limit of the form for everyone counts
 *   socket      the TCP peer: the server takes connections from visitors directly
 *   vercel      `x-forwarded-for`, which Vercel overwrites with the visitor address
 *   cloudflare  `cf-connecting-ip`: only when the origin accepts nothing but Cloudflare
 *   proxy[:N]   N reverse proxies in front (1 by default): the N-th address of
 *               `x-forwarded-for` from the right, and only when the TCP peer is a
 *               loopback or private address, so a request that skipped the proxy
 *               is not believed
 *
 * No trustworthy address means null, never a shared "unknown" visitor: one
 * sender would fill that bucket for everyone.
 */

export type CmsClientAddressSource =
  | { kind: 'none' }
  | { kind: 'socket' }
  | { kind: 'vercel' }
  | { kind: 'cloudflare' }
  | { kind: 'proxy', hops: number }

export interface CmsClientAddressEnvironment {
  vercel: boolean
  dev: boolean
}

/** The source the option names; null when the option is not one of them. */
export function parseClientAddressSource(option: string | undefined, environment: CmsClientAddressEnvironment): CmsClientAddressSource | null {
  const value = (option ?? '').trim().toLowerCase()

  if (value === '' || value === 'auto') {
    if (environment.vercel) {
      return { kind: 'vercel' }
    }

    return environment.dev ? { kind: 'socket' } : { kind: 'none' }
  }

  if (value === 'none' || value === 'socket' || value === 'vercel' || value === 'cloudflare') {
    return { kind: value }
  }

  const proxy = /^proxy(?::(\d{1,2}))?$/.exec(value)

  if (proxy) {
    const hops = proxy[1] === undefined ? 1 : Number(proxy[1])
    return hops >= 1 ? { kind: 'proxy', hops } : null
  }

  return null
}

export interface CmsClientAddressRequest {
  header: (name: string) => string | undefined
  socket: string | undefined
}

/** The visitor address the source vouches for, normalized; null when there is none. */
export function resolveClientAddress(source: CmsClientAddressSource, request: CmsClientAddressRequest): string | null {
  switch (source.kind) {
    case 'none':
      return null
    case 'socket':
      return normalizeClientAddress(request.socket)
    case 'vercel':
      return normalizeClientAddress(request.header('x-forwarded-for')?.split(',')[0])
    case 'cloudflare':
      return normalizeClientAddress(request.header('cf-connecting-ip'))
    case 'proxy': {
      const peer = normalizeIp(request.socket)

      if (!peer || !isPrivateAddress(peer)) {
        return null
      }

      const chain = (request.header('x-forwarded-for') ?? '').split(',').map(part => part.trim()).filter(Boolean)
      return chain.length >= source.hops ? normalizeClientAddress(chain[chain.length - source.hops]) : null
    }
  }
}

/** A valid IP without IPv4-mapped prefix or zone; null when it is not one. */
function normalizeIp(value: string | undefined): string | null {
  if (!value) {
    return null
  }

  let ip = value.trim().replace(/^\[(.*)\]$/, '$1').replace(/%.*$/, '')
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)

  if (mapped) {
    ip = mapped[1]!
  }

  return isIP(ip) ? ip.toLowerCase() : null
}

/** The eight groups of an IPv6 address, each as a number. */
function ipv6Groups(ip: string): number[] {
  const [head = '', tail] = ip.split('::')
  const parse = (part: string) => part ? part.split(':') : []
  let left = parse(head)
  let right = tail === undefined ? [] : parse(tail)

  // An embedded IPv4 tail (`::1.2.3.4`) is two groups.
  const embed = (groups: string[]) => {
    const last = groups[groups.length - 1]

    if (last?.includes('.')) {
      const [a, b, c, d] = last.split('.').map(Number) as [number, number, number, number]
      groups.splice(-1, 1, ((a << 8) | b).toString(16), ((c << 8) | d).toString(16))
    }

    return groups
  }

  if (tail === undefined) {
    left = embed(left)
  } else {
    right = embed(right)
  }

  const missing = 8 - left.length - right.length
  return [...left, ...Array<string>(Math.max(missing, 0)).fill('0'), ...right].map(group => Number.parseInt(group, 16))
}

/**
 * The address a limit counts: an IPv4 address as is, an IPv6 address cut to
 * its /64 network, since one host gets a whole /64 and could rotate within it.
 */
export function normalizeClientAddress(value: string | undefined): string | null {
  const ip = normalizeIp(value)

  if (!ip || isIP(ip) === 4) {
    return ip
  }

  return `${ipv6Groups(ip).slice(0, 4).map(group => group.toString(16)).join(':')}::/64`
}

/** Loopback, private, link-local or unique local: an address a proxy of the site has. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a = 0, b = 0] = ip.split('.').map(Number)
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
  }

  const groups = ipv6Groups(ip)
  const first = groups[0] ?? 0
  const loopback = groups.slice(0, 7).every(group => group === 0) && groups[7] === 1
  return loopback || (first & 0xFE00) === 0xFC00 || (first & 0xFFC0) === 0xFE80
}

/**
 * A short pseudonym of the visitor's address for rate limits: HMAC with a key
 * derived from the secret, so the address itself is never stored and the
 * value cannot be reversed by reading the database.
 */
export function hashClientAddress(address: string, secret: string): string {
  const key = createHmac('sha256', secret).update('cms-forms:client').digest()
  return createHmac('sha256', key).update(address).digest('hex').slice(0, 32)
}
