// Content is written from the editor's browser through RLS, so a stored href is
// untrusted input. Anything that is not on the allow-list renders as plain text.
const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto', 'tel'])
const SCHEME_PATTERN = /^([a-z][a-z\d+.-]*):/i
// The URL parser strips leading and trailing C0 controls and spaces, and drops
// tabs and newlines anywhere, so `java\tscript:` is still `javascript:`.
// Matching control characters is the point here, hence no-control-regex is off.
// eslint-disable-next-line no-control-regex
const EDGE_WHITESPACE = /^[\u0000- ]+|[\u0000- ]+$/g
const TAB_OR_NEWLINE = /[\t\n\r]/g
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR = /[\u0000-\u001F\u007F]/

/**
 * The href if it is safe to render, otherwise null.
 *
 * Allowed: `http(s):`, `mailto:`, `tel:`, protocol-relative `//host`,
 * site paths `/…` and in-page anchors `#…`.
 */
export function toSafeHref(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null
  }

  const href = raw.replace(EDGE_WHITESPACE, '').replace(TAB_OR_NEWLINE, '')

  if (!href || CONTROL_CHAR.test(href)) {
    return null
  }

  const scheme = SCHEME_PATTERN.exec(href)?.[1]

  if (scheme) {
    return ALLOWED_SCHEMES.has(scheme.toLowerCase()) ? href : null
  }

  // Browsers read `\` as `/` in http(s) URLs, so `/\evil.com` is another host,
  // not a site path. A backslash has no use in a site path or an anchor.
  if (href.includes('\\')) {
    return null
  }

  return href.startsWith('/') || href.startsWith('#') ? href : null
}

export interface CmsResolvedLink {
  href: string
  target?: '_blank'
  rel?: string
}

/** A site path `/…`: the only kind of href a link resolver changes. */
export function isSitePath(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//')
}

/**
 * Attributes of a rendered link, or null when there is nothing safe to link to.
 * `localize` maps a site path to the current locale (the Client's link
 * resolver, C-79); its result goes through the allow-list again.
 */
export function resolveCmsLink(
  raw: unknown,
  newTab = false,
  localize?: (href: string) => string,
): CmsResolvedLink | null {
  let href = toSafeHref(raw)

  if (!href) {
    return null
  }

  if (localize && isSitePath(href)) {
    href = toSafeHref(localize(href)) ?? href
  }

  return newTab ? { href, target: '_blank', rel: 'noopener noreferrer' } : { href }
}

/** Dev-only hint for a stored href that was dropped as unsafe. */
export function warnUnsafeHref(component: string, raw: unknown): void {
  if (import.meta.dev && typeof raw === 'string' && raw.trim() && !toSafeHref(raw)) {
    console.warn(`[nuxt-cms-core] ${component}: href "${raw}" is not allowed and renders as text. `
      + 'Use http(s):, mailto:, tel:, a site path "/…" or an anchor "#…".')
  }
}
