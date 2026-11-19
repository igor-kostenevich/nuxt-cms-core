import type { H3Event } from 'h3'
import type { CmsFormStats, CmsFormSubmission, CmsSubmissionLocation } from '../../types/forms'
import { toCmsDataError } from '../supabase'

/**
 * Submissions of the site forms and the owner's form settings (011). Reads
 * and changes run as the signed-in user: RLS lets owner and admin see them
 * (forms.view) and change only where a submission is and whether it is read
 * (forms.manage). Writing a submission is not here: only the submit route
 * does it, with the secret key.
 */

const COLUMNS = 'id, form_key, payload, location, read_at, page_path, locale, created_at'
const LOCATIONS: readonly CmsSubmissionLocation[] = ['inbox', 'archived', 'spam']
const EXPORT_BATCH = 1000

interface SubmissionRow {
  id: string
  form_key: string
  payload: unknown
  location: string
  read_at: string | null
  page_path: string | null
  locale: string | null
  created_at: string
}

export interface CmsSubmissionFilters {
  location: CmsSubmissionLocation
  formKey?: string | null
  unreadOnly?: boolean
  /** Name, email, phone or message text. */
  search?: string
}

function toSubmission(row: SubmissionRow): CmsFormSubmission {
  const payload = typeof row.payload === 'object' && row.payload !== null && !Array.isArray(row.payload)
    ? row.payload as Record<string, unknown>
    : {}

  return {
    id: row.id,
    formKey: row.form_key,
    payload,
    location: LOCATIONS.includes(row.location as CmsSubmissionLocation) ? row.location as CmsSubmissionLocation : 'inbox',
    readAt: row.read_at,
    pagePath: row.page_path,
    locale: row.locale,
    createdAt: row.created_at,
  }
}

/** `%` and `_` are wildcards of ILIKE; a search is plain text. */
function likePattern(search: string): string {
  return `%${search.toLowerCase().replace(/[\\%_]/g, char => `\\${char}`)}%`
}

async function getAuthClient(request?: H3Event) {
  const { getSupabaseAuthClient } = await import('../supabase-auth')
  return getSupabaseAuthClient(request)
}

export function createFormsRepository(request?: H3Event) {
  // Sync on purpose: a query builder is thenable, so returning it from an
  // async function would run it before the caller adds order and range.
  function filtered(
    client: Awaited<ReturnType<typeof getAuthClient>>,
    filters: CmsSubmissionFilters,
    options: { count?: boolean } = {},
  ) {
    let query = client
      .from('cms_form_submissions')
      .select(COLUMNS, options.count ? { count: 'exact' } : undefined)
      .eq('location', filters.location)

    if (filters.formKey) {
      query = query.eq('form_key', filters.formKey)
    }

    if (filters.unreadOnly) {
      query = query.is('read_at', null)
    }

    const search = filters.search?.trim()

    if (search) {
      query = query.ilike('search_text', likePattern(search.slice(0, 200)))
    }

    return query
  }

  /** A page of submissions, newest first, with the total that match. */
  async function list(filters: CmsSubmissionFilters, page: { offset: number, limit: number }) {
    const { data, error, count } = await filtered(await getAuthClient(request), filters, { count: true })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(page.offset, page.offset + page.limit - 1)
      .returns<SubmissionRow[]>()

    if (error) {
      throw toCmsDataError(error, 'Failed to load submissions')
    }

    return { items: (data ?? []).map(toSubmission), total: count ?? 0 }
  }

  /** Every submission that matches, for a CSV export, read in batches. */
  async function listAll(filters: CmsSubmissionFilters): Promise<CmsFormSubmission[]> {
    const all: CmsFormSubmission[] = []
    const client = await getAuthClient(request)

    for (let offset = 0; ; offset += EXPORT_BATCH) {
      const { data, error } = await filtered(client, filters)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + EXPORT_BATCH - 1)
        .returns<SubmissionRow[]>()

      if (error) {
        throw toCmsDataError(error, 'Failed to export submissions')
      }

      all.push(...(data ?? []).map(toSubmission))

      if (!data || data.length < EXPORT_BATCH) {
        return all
      }
    }
  }

  async function get(id: string): Promise<CmsFormSubmission | null> {
    const { data, error } = await (await getAuthClient(request))
      .from('cms_form_submissions')
      .select(COLUMNS)
      .eq('id', id)
      .returns<SubmissionRow[]>()
      .maybeSingle()

    if (error) {
      throw toCmsDataError(error, 'Failed to load the submission')
    }

    return data ? toSubmission(data) : null
  }

  /**
   * The newer and the older submission next to one, in the same list
   * (location and form), for "previous / next" in the details.
   */
  async function neighbours(submission: CmsFormSubmission, filters: Pick<CmsSubmissionFilters, 'location' | 'formKey'>) {
    const client = await getAuthClient(request)
    // Quoted: the time has dots and colons, which the filter syntax uses.
    const at = submission.createdAt
    const around = async (newer: boolean) => {
      let query = client
        .from('cms_form_submissions')
        .select('id')
        .eq('location', filters.location)
        .or(newer
          ? `created_at.gt."${at}",and(created_at.eq."${at}",id.gt.${submission.id})`
          : `created_at.lt."${at}",and(created_at.eq."${at}",id.lt.${submission.id})`)
        .order('created_at', { ascending: newer })
        .order('id', { ascending: newer })
        .limit(1)

      if (filters.formKey) {
        query = query.eq('form_key', filters.formKey)
      }

      const { data, error } = await query

      if (error) {
        throw toCmsDataError(error, 'Failed to load the neighbouring submissions')
      }

      return data?.[0]?.id ?? null
    }

    const [newer, older] = await Promise.all([around(true), around(false)])
    return { newer, older }
  }

  async function update(ids: string[], changes: { location?: CmsSubmissionLocation, read_at?: string | null }) {
    if (ids.length === 0) {
      return
    }

    const { error } = await (await getAuthClient(request))
      .from('cms_form_submissions')
      .update(changes)
      .in('id', ids)

    if (error) {
      throw toCmsDataError(error, 'Failed to change submissions')
    }
  }

  function setLocation(ids: string[], location: CmsSubmissionLocation) {
    return update(ids, { location })
  }

  function setRead(ids: string[], read: boolean) {
    return update(ids, { read_at: read ? new Date().toISOString() : null })
  }

  /** Marks every unread submission of the inbox read (of one form, when given). */
  async function markAllRead(formKey?: string | null) {
    let query = (await getAuthClient(request))
      .from('cms_form_submissions')
      .update({ read_at: new Date().toISOString() })
      .eq('location', 'inbox')
      .is('read_at', null)

    if (formKey) {
      query = query.eq('form_key', formKey)
    }

    const { error } = await query

    if (error) {
      throw toCmsDataError(error, 'Failed to mark submissions read')
    }
  }

  /** Deletes for good. */
  async function remove(ids: string[]) {
    if (ids.length === 0) {
      return
    }

    const { error } = await (await getAuthClient(request))
      .from('cms_form_submissions')
      .delete()
      .in('id', ids)

    if (error) {
      throw toCmsDataError(error, 'Failed to delete submissions')
    }
  }

  /** Unread submissions in the inbox: the number in the admin menu. */
  async function unreadCount(): Promise<number> {
    const { count, error } = await (await getAuthClient(request))
      .from('cms_form_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('location', 'inbox')
      .is('read_at', null)

    if (error) {
      throw toCmsDataError(error, 'Failed to count unread submissions')
    }

    return count ?? 0
  }

  async function stats(): Promise<CmsFormStats[]> {
    const { data, error } = await (await getAuthClient(request)).rpc('cms_form_stats')

    if (error) {
      throw toCmsDataError(error, 'Failed to load the numbers of the forms')
    }

    return (data ?? []).map(row => ({
      formKey: row.form_key,
      total: Number(row.total),
      unread: Number(row.unread),
      lastAt: row.last_at,
      sources: row.sources ?? [],
    }))
  }

  /** Forms the owner turned off. A form without a row is on. */
  async function disabledForms(): Promise<string[]> {
    const { data, error } = await (await getAuthClient(request))
      .from('cms_forms')
      .select('key')
      .eq('enabled', false)

    if (error) {
      throw toCmsDataError(error, 'Failed to load the form settings')
    }

    return (data ?? []).map(row => row.key)
  }

  async function setEnabled(formKey: string, enabled: boolean) {
    const { error } = await (await getAuthClient(request))
      .rpc('cms_form_set_enabled', { form_key: formKey, form_enabled: enabled })

    if (error) {
      throw toCmsDataError(error, `Failed to turn form "${formKey}" ${enabled ? 'on' : 'off'}`)
    }
  }

  return {
    list,
    listAll,
    get,
    neighbours,
    setLocation,
    setRead,
    markAllRead,
    remove,
    unreadCount,
    stats,
    disabledForms,
    setEnabled,
  }
}
