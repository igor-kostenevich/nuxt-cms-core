import type { H3Event } from 'h3'
import type { CmsActivityCategory, CmsActivityCursor, CmsActivityEvent } from '../../types/activity'
import { CmsDataError } from '../errors'
import { UUID_PATTERN as UUID } from '../ids'
import { toCmsDataError } from '../supabase'

/**
 * The Activity log (012), read-only: events are written by the database in the
 * transaction of each action. RLS shows them to `activity.view` (owner, admin)
 * and nothing to others.
 */

const COLUMNS = 'id, created_at, actor_email, action, entity_type, entity_id, entity_label, locale, revision_id, details'

/** Entity types of each category. "all" has no filter. */
export const ACTIVITY_CATEGORY_TYPES: Record<Exclude<CmsActivityCategory, 'all'>, readonly string[]> = {
  pages: ['page'],
  content: ['entry'],
  media: ['media'],
  settings: ['settings', 'language', 'form'],
  submissions: ['submission'],
}

// The cursor goes into a filter string: only what the database returns there.
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/

interface ActivityRow {
  id: string
  created_at: string
  actor_email: string | null
  action: string
  entity_type: string
  entity_id: string | null
  entity_label: string | null
  locale: string | null
  revision_id: string | null
  details: unknown
}

function toEvent(row: ActivityRow): CmsActivityEvent {
  const details = typeof row.details === 'object' && row.details !== null && !Array.isArray(row.details)
    ? row.details as Record<string, unknown>
    : null

  return {
    id: row.id,
    createdAt: row.created_at,
    actorEmail: row.actor_email,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityLabel: row.entity_label,
    locale: row.locale,
    revisionId: row.revision_id,
    details,
  }
}

/**
 * Keyset condition "older than the cursor" on (created_at, id), the order of
 * the list. The time is passed back exactly as the database returned it, never
 * through a JavaScript Date (microseconds). Quoted: it has dots and colons.
 */
export function olderThan(cursor: CmsActivityCursor): string {
  if (!TIMESTAMP.test(cursor.createdAt) || !UUID.test(cursor.id)) {
    throw new CmsDataError('validation', 'Invalid activity cursor.')
  }

  return `created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`
}

async function getAuthClient(request?: H3Event) {
  const { getSupabaseAuthClient } = await import('../supabase-auth')
  return getSupabaseAuthClient(request)
}

export function createActivityRepository(request?: H3Event) {
  /**
   * A page of events, newest first. One extra row is read to know whether
   * there is more; `next` is the cursor of the following page, or null.
   */
  async function list(options: { category: CmsActivityCategory, before?: CmsActivityCursor | null, limit: number }) {
    let query = (await getAuthClient(request))
      .from('cms_activity')
      .select(COLUMNS)

    if (options.category !== 'all') {
      query = query.in('entity_type', [...ACTIVITY_CATEGORY_TYPES[options.category]])
    }

    if (options.before) {
      query = query.or(olderThan(options.before))
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(options.limit + 1)
      .returns<ActivityRow[]>()

    if (error) {
      throw toCmsDataError(error, 'Failed to load activity')
    }

    const rows = data ?? []
    const items = rows.slice(0, options.limit).map(toEvent)
    const last = items.at(-1)
    const next = rows.length > options.limit && last ? { createdAt: last.createdAt, id: last.id } : null

    return { items, next }
  }

  return { list }
}
