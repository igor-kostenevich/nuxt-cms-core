import type { CmsEntryStatus } from '../types/entries'
import type { AdminDocumentStatus } from './useAdminPages'

/** Tones of AdminBadge. */
export type AdminBadgeTone = 'neutral' | 'success' | 'warning' | 'muted'

/**
 * What the lists call an entry's status: one taken off the site is a draft
 * (its last publication and address are kept, but there is nothing to tell the
 * person apart from a draft; Publish puts the draft on the site).
 */
export function shownStatus<T extends string>(status: T): Exclude<T, 'archived'> | 'draft' {
  return (status === 'archived' ? 'draft' : status) as Exclude<T, 'archived'> | 'draft'
}

/** The badge tone of a page or entry status as shown (`shownStatus`): one look in every list and filter. */
export function documentStatusTone(status: AdminDocumentStatus | Exclude<CmsEntryStatus, 'archived'>): AdminBadgeTone {
  switch (status) {
    case 'published':
      return 'success'
    case 'changed':
    case 'draft':
      return 'warning'
    default:
      return 'neutral'
  }
}
