/**
 * Links into Edit Mode from admin screens (Texts, Activity). The path comes
 * from `cms_pages.edit_path`, which anyone with `pages.edit` writes (the editor
 * records where a page was opened), so it is untrusted: a path like
 * `/../settings` or `/%2e%2e/settings` would lead an admin to another admin
 * screen, and `?` / `#` would add a query of the writer's choice.
 *
 * A safe path is a site path: it starts with one `/`, has no query, fragment,
 * backslash, empty segment or dot segment, and no encoded form of them
 * (`%2e`, `%2f`, `%5c`, `%3f`, `%23`, `%25`). As a second guard the path is
 * decoded once and checked again.
 * Anything else gives no link.
 */

const FORBIDDEN = /[?#\\\s]/
// Encoded `/`, `\`, `?`, `#`, `.` and `%`: a site path has no reason to encode
// them, and decoded they change the segments or the query.
const ENCODED_RESERVED = /%(?:2f|5c|3f|23|2e|25)/i

function plainPath(path: string): boolean {
  if (!path.startsWith('/') || FORBIDDEN.test(path)) {
    return false
  }

  // The root is one slash; anywhere else an empty segment is `//`.
  const segments = path === '/' ? [] : path.slice(1).replace(/\/$/, '').split('/')
  return segments.every(segment => segment !== '' && segment !== '.' && segment !== '..')
}

/** The path when it is a safe site path to open in Edit Mode, else null. */
export function safeEditPath(path: string | null | undefined): string | null {
  if (!path || path.length > 500 || ENCODED_RESERVED.test(path) || !plainPath(path)) {
    return null
  }

  let decoded: string

  try {
    decoded = decodeURIComponent(path)
  } catch {
    return null
  }

  return !decoded.includes('%') && plainPath(decoded) ? path : null
}

/** `/admin/edit<path>?<query>` for a safe path, else null. */
export function editorUrl(path: string | null | undefined, query?: URLSearchParams): string | null {
  const safe = safeEditPath(path)

  if (!safe) {
    return null
  }

  const search = query && query.size > 0 ? `?${query}` : ''
  return `/admin/edit${safe}${search}`
}
