import type { CmsPageEditable } from '../types/pages'

/** A type of Pages as Edit Mode needs it (from #cms/content). */
export interface EditableType {
  key: string
  route: string | null
}

/** `/blog/[slug]` → `/blog/`. */
export function routePrefix(route: string): string {
  return route.slice(0, -'[slug]'.length)
}

/**
 * The type of Pages whose route a site path is under: `/blog/x` → the type of
 * `/blog/[slug]`. Exactly one segment after the prefix; null otherwise.
 */
export function typeOfPath<T extends EditableType>(path: string, types: readonly T[]): T | null {
  return types.find((type) => {
    if (!type.route) {
      return false
    }

    const prefix = routePrefix(type.route)
    const rest = path.slice(prefix.length)
    return path.startsWith(prefix) && rest.length > 0 && !rest.includes('/')
  }) ?? null
}

function slugOf(content: Record<string, unknown> | null | undefined): string | null {
  const slug = content?.slug
  return typeof slug === 'string' && slug ? slug : null
}

/**
 * The address Edit Mode shows an entry at in the edited language (014 §5):
 * draft before publication; a translation's own address, else the original's
 * (its draft, else its publication: `base`).
 */
export function editSlugOf(editable: CmsPageEditable): string | null {
  return slugOf(editable.draft) ?? slugOf(editable.published) ?? slugOf(editable.base)
}

/**
 * Publish in a list of entries opens the entry in Edit Mode and asks to publish
 * it there. The request travels in the history state of that navigation, not in
 * the address: a link sent by someone else cannot publish on open (with the
 * question turned off it would publish at once). Only the list sets it.
 */
const PUBLISH_ON_OPEN = 'cmsPublishOnOpen'

/** The history state of a navigation that publishes the entry on open. */
export function publishOnOpenState(entryId: string): Record<string, string> {
  return { [PUBLISH_ON_OPEN]: entryId }
}

/**
 * Did the navigation to this entry ask to publish it on open: once. The state
 * is cleared, so a reload or Back does not ask again.
 */
export function takePublishOnOpen(entryId: string): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const state = window.history.state as Record<string, unknown> | null

  if (!state || state[PUBLISH_ON_OPEN] !== entryId) {
    return false
  }

  window.history.replaceState({ ...state, [PUBLISH_ON_OPEN]: null }, '')
  return true
}
