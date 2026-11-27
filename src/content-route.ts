/**
 * Routes of entry types (014). A type declares a pattern such as
 * `/blog/[slug]`; the router has `/:locale?/blog/:slug()`. Both are brought to
 * one form, without optional segments (the language prefix of
 * `[[locale]]`), so the module can check the routes at build time and Edit
 * Mode can find the route of a type at runtime. Plain functions: no Vue, no Nuxt.
 */

export interface RouteLike {
  path: string
  name?: string | symbol | null
}

/**
 * `/:locale?/blog/:slug()` → `/blog/[slug]`. Null for a catch-all
 * (`:slug(.*)*`): it would take every address and cannot be an entry route.
 */
export function routePattern(path: string): string | null {
  if (/\(\.\*\)/.test(path) || /:[\w]+[*+]/.test(path)) {
    return null
  }

  const normalized = path
    // Optional segments: `[[locale]]`, `[[page]]`.
    .replace(/\/:[\w]+(?:\(\))?\?/g, '')
    .replace(/:([\w]+)(?:\(\))?/g, '[$1]')

  return normalized === '' ? '/' : normalized
}

/** Routes the pattern of a type matches (one is right; more is a conflict). */
export function findTypeRoutes<T extends RouteLike>(routes: readonly T[], pattern: string): T[] {
  return routes.filter(route => routePattern(route.path) === pattern)
}

/**
 * Slugs a static neighbour takes: `/blog/archive` next to `/blog/[slug]` makes
 * `archive` an address no entry can have.
 */
export function reservedSlugs(routes: readonly RouteLike[], pattern: string): string[] {
  const prefix = pattern.slice(0, -'[slug]'.length)
  const slugs = new Set<string>()

  for (const route of routes) {
    const path = routePattern(route.path)

    if (path?.startsWith(prefix)) {
      const rest = path.slice(prefix.length)

      if (rest && !rest.includes('/') && !rest.includes('[')) {
        slugs.add(rest)
      }
    }
  }

  return [...slugs].sort()
}

