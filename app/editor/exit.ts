import { isAdminPath, isEditPath, isLoginPath } from '../auth/paths'

/**
 * Where Exit of Edit Mode leads: the admin screen it was opened from (the
 * list of posts, Pages), not always the dashboard. Remembered when Edit Mode
 * is entered from the admin; moving between pages inside Edit Mode keeps it.
 */
let returnTo: string | null = null

/** Called when Edit Mode mounts, with the page the router came from (`history.state.back`). */
export function rememberExitFrom(back: unknown) {
  const path = typeof back === 'string' ? back.split(/[?#]/, 1)[0] ?? '' : ''

  // From another page of Edit Mode: the same session of editing goes on.
  if (path && isEditPath(path)) {
    return
  }

  returnTo = typeof back === 'string' && back.startsWith('/') && isAdminPath(path) && !isLoginPath(path) ? back : null
}

/** The place to go back to; null: the default (dashboard). */
export function exitTarget(): string | null {
  return returnTo
}
