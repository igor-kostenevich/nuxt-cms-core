/**
 * CMS route prefixes. A path is "under" a prefix only on a segment boundary:
 * `/admin/settings` is under `/admin`, `/administer` is not. Case does not
 * matter, as in vue-router's default matching: `/ADMIN/settings` opens the
 * same page as `/admin/settings`.
 */
export const ADMIN_PATH = '/admin'
export const EDIT_PATH = '/admin/edit'
export const LOGIN_PATH = '/admin/login'

export function isPathUnder(path: string, prefix: string): boolean {
  const lower = path.toLowerCase()
  return lower === prefix || lower.startsWith(`${prefix}/`)
}

export function isAdminPath(path: string): boolean {
  return isPathUnder(path, ADMIN_PATH)
}

export function isEditPath(path: string): boolean {
  return isPathUnder(path, EDIT_PATH)
}

export function isLoginPath(path: string): boolean {
  return isPathUnder(path, LOGIN_PATH)
}
