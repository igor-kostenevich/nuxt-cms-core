interface TitledRoute {
  path: string
  name?: unknown
  meta: Record<string, unknown>
}

/**
 * Name of a Client page in the editor: `meta.title`, else the route name made
 * readable (`about-us` → «About us»). The home page gets `homeLabel`.
 */
export function pageTitle(route: TitledRoute, homeLabel: string): string {
  if (typeof route.meta.title === 'string') {
    return route.meta.title
  }

  if (route.path === '/') {
    return homeLabel
  }

  const text = String(route.name ?? route.path).replace(/^\//, '').replace(/[-_/]+/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}
