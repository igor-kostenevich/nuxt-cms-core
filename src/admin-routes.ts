/**
 * Build-time guard of the admin namespace (MASTER_PLAN C-98).
 *
 * `/admin/*` belongs to CMS Core. In a Nuxt layer a page of the Client
 * Project silently replaces a Core page with the same path, and a project
 * middleware replaces a layer middleware with the same name. So the module
 * checks the resolved routes and fails the build instead.
 */

export const ADMIN_PREFIX = '/admin'
/** The named route middleware that gates admin pages (app/middleware/cms-auth.ts). */
export const ADMIN_GATE = 'cms-auth'
/** Core admin routes that are open without a CMS session. */
export const PUBLIC_ADMIN_PATHS: readonly string[] = ['/admin/login']

/** The part of a Nuxt page route the check reads (`NuxtPage`). */
export interface AdminRouteInput {
  path: string
  file?: string
  alias?: string | string[]
  meta?: Record<string, unknown>
  children?: AdminRouteInput[]
}

export type AdminRouteViolation =
  /** A route of the Client Project (or one without a file) answers under /admin. */
  | { reason: 'client-route', path: string, file?: string }
  /** A Core admin route that is not public has no `cms-auth`, itself or on a parent. */
  | { reason: 'missing-gate', path: string, file?: string }

// A leading optional segment (`/:locale?`, `/:locale(en|uk)?`) can be empty,
// so `/:locale?/admin/x` also answers `/admin/x`.
const LEADING_OPTIONAL_SEGMENT = /^\/:[^/]+\?(?=\/|$)/

/**
 * Whether a route path can answer a URL under /admin. vue-router matches
 * case-insensitively and ignores a trailing slash by default.
 */
export function isAdminRoutePath(path: string): boolean {
  let normalized = path.replace(/\/{2,}/g, '/').toLowerCase()

  while (LEADING_OPTIONAL_SEGMENT.test(normalized)) {
    normalized = normalized.replace(LEADING_OPTIONAL_SEGMENT, '')
  }

  normalized = normalized.replace(/\/+$/, '')

  return normalized === ADMIN_PREFIX || normalized.startsWith(`${ADMIN_PREFIX}/`)
}

/**
 * Admin namespace violations in a resolved route tree. `isCoreFile` tells
 * whether a page file belongs to Core. Children inherit the gate of a parent:
 * Nuxt runs the middleware of every matched route.
 */
export function findAdminRouteViolations(
  routes: readonly AdminRouteInput[],
  isCoreFile: (file: string) => boolean,
): AdminRouteViolation[] {
  const violations: AdminRouteViolation[] = []

  function visit(route: AdminRouteInput, parentPath: string, parentGated: boolean) {
    const path = joinPath(parentPath, route.path)
    const gated = parentGated || hasGate(route.meta)
    const core = route.file !== undefined && isCoreFile(route.file)
    const aliases = toArray(route.alias).filter((alias): alias is string => typeof alias === 'string')
    const answers = [path, ...aliases.map(alias => joinPath(parentPath, alias))]

    if (!core && answers.some(isAdminRoutePath)) {
      violations.push({ reason: 'client-route', path, file: route.file })
    }

    if (core && isAdminRoutePath(path) && !gated && !PUBLIC_ADMIN_PATHS.includes(normalizePath(path))) {
      violations.push({ reason: 'missing-gate', path, file: route.file })
    }

    for (const child of route.children ?? []) {
      visit(child, path, gated)
    }
  }

  for (const route of routes) {
    visit(route, '', false)
  }

  return violations
}

/** One build error that lists every violation, with paths relative to `rootDir`. */
export function formatAdminRouteViolations(violations: readonly AdminRouteViolation[], rootDir: string): string {
  const lines = violations.map(({ reason, path, file }) => {
    const where = file ? ` (${relativeTo(rootDir, file)})` : ''

    return reason === 'client-route'
      ? `  - ${path}${where}: ${ADMIN_PREFIX}/* is reserved for CMS Core; move the page to another path.`
      : `  - ${path}${where}: a Core admin page needs definePageMeta({ middleware: ['${ADMIN_GATE}'] }).`
  })

  return ['nuxt-cms-core: admin routes are not allowed:', ...lines].join('\n')
}

function relativeTo(rootDir: string, file: string): string {
  const root = rootDir.replace(/\/+$/, '')

  return file.startsWith(`${root}/`) ? file.slice(root.length + 1) : file
}

function hasGate(meta: Record<string, unknown> | undefined): boolean {
  const middleware = meta?.middleware

  return toArray(middleware).includes(ADMIN_GATE)
}

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

function joinPath(parent: string, path: string): string {
  if (path.startsWith('/')) {
    return path
  }

  return path === '' ? parent : `${parent.replace(/\/+$/, '')}/${path}`
}

function normalizePath(path: string): string {
  return path.toLowerCase().replace(/\/+$/, '')
}
