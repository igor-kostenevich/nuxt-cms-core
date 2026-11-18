interface TitledRoute {
  path: string
  name?: unknown
  meta: Record<string, unknown>
  /** A resolved route: its last record holds the path pattern. */
  matched?: readonly { path: string }[]
}

/** Optional segments (`[[locale]]` → `/:locale?`) are not part of the page. */
const OPTIONAL_SEGMENT = /\/:[^/]+\?/g

/** The path of a route pattern without its optional segments (`/:locale?/about` → `/about`). */
export function pagePath(pattern: string): string {
  return pattern.replace(OPTIONAL_SEGMENT, '') || '/'
}

/**
 * Name of a Client page in the editor: `meta.title`, else the route name made
 * readable (`about-us` → «About us»). The home page gets `homeLabel`.
 */
export function pageTitle(route: TitledRoute, homeLabel: string): string {
  if (typeof route.meta.title === 'string') {
    return route.meta.title
  }

  const pattern = route.matched?.at(-1)?.path ?? route.path
  const page = pagePath(pattern)

  if (page === '/') {
    return homeLabel
  }

  // A route with an optional segment: its name carries the segment too
  // (`locale-about`), so the page path names it instead.
  const source = page === pattern ? String(route.name ?? page) : page
  const text = source.replace(/^\//, '').replace(/[-_/]+/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}
