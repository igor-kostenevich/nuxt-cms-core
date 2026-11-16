import { isAdminPath, isLoginPath } from './paths'

const FALLBACK = '/admin'

/**
 * Post-login redirect target. Only same-origin CMS paths are allowed, so
 * `?redirect=` cannot send a user to another site.
 */
export function safeRedirect(value: unknown): string {
  if (Array.isArray(value)) {
    return safeRedirect(value[0])
  }

  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    return FALLBACK
  }

  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.includes('://')) {
    return FALLBACK
  }

  const withoutHash = value.split('#')[0] ?? ''
  const path = withoutHash.split('?')[0] ?? ''

  let decoded: string

  try {
    decoded = decodeURIComponent(path)
  } catch {
    return FALLBACK
  }

  if (decoded.includes('..') || decoded.includes('\\') || decoded.includes('//')) {
    return FALLBACK
  }

  const allowed = isAdminPath(decoded)

  if (!allowed) {
    return FALLBACK
  }

  if (isAuthScreen(decoded)) {
    return FALLBACK
  }

  return value
}

function isAuthScreen(path: string): boolean {
  return isLoginPath(path)
}
