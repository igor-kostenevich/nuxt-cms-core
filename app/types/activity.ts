/**
 * An event of the Activity log (012). Written only by the database in the
 * transaction of the action; the admin reads it.
 */
export interface CmsActivityEvent {
  id: string
  /** Exactly as the database returned it: also the cursor of the next page. */
  createdAt: string
  /** Snapshot at the time of the action; stays when the user is deleted. Null for system events. */
  actorEmail: string | null
  action: string
  entityType: string
  entityId: string | null
  /** Snapshot of the name at the time of the action. */
  entityLabel: string | null
  locale: string | null
  revisionId: string | null
  details: Record<string, unknown> | null
}

export const CMS_ACTIVITY_CATEGORIES = ['all', 'pages', 'content', 'media', 'settings', 'submissions'] as const

export type CmsActivityCategory = (typeof CMS_ACTIVITY_CATEGORIES)[number]

/** Where the next page starts: the last event shown. */
export interface CmsActivityCursor {
  createdAt: string
  id: string
}
