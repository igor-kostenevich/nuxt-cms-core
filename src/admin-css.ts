/**
 * Third-party stylesheets of the admin, kept inside it (C-21, C-103). A
 * library's CSS sets variables on `:root` and has unprefixed classes; loaded
 * as is, it would reach the Client's pages too (Edit Mode renders them in the
 * same document) and override a Client that themes the same library.
 *
 * Core imports such a file with `?cms-admin`; only that import is changed —
 * the same file imported by the Client stays as the library ships it. The
 * rules go into `@scope (.cms-admin)` (no extra specificity), `:root` becomes
 * the admin's root, and `@keyframes` stay global (scoping does not apply to
 * them; their names are the library's own).
 */

export const ADMIN_CSS_QUERY = 'cms-admin'

const KEYFRAMES = /@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g

/** The stylesheet with every rule scoped to `.cms-admin`. */
export function scopeAdminCss(css: string): string {
  const keyframes = css.match(KEYFRAMES) ?? []
  const rules = css.replace(KEYFRAMES, '').replace(/:root(?![\w-])/g, ':scope')

  return `${keyframes.join('\n')}\n@scope (.cms-admin) {\n${rules}\n}\n`
}

/** Whether a module id is a stylesheet Core imported with `?cms-admin`. */
export function isAdminCss(id: string): boolean {
  const [path, query = ''] = id.split('?', 2)
  return path!.endsWith('.css') && new URLSearchParams(query).has(ADMIN_CSS_QUERY)
}

/** Vite plugin: scopes the stylesheets marked `?cms-admin` before Vite's CSS handling. */
export function adminCssPlugin() {
  return {
    name: 'nuxt-cms-core:admin-css',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      return isAdminCss(id) ? { code: scopeAdminCss(code), map: null } : undefined
    },
  }
}
