import type { H3Event } from 'h3'
import type { CmsMembership, CmsRole, CmsUserStatus } from '../../types/auth'
import { CmsDataError } from '../errors'
import { getSupabaseAuthClient } from '../supabase-auth'
import { toCmsDataError } from '../supabase'

const TABLE = 'cms_users'

/** Database row shape, kept private so snake_case never leaks out of this file. */
interface CmsUserRow {
  user_id: string
  role: string
  status: string
}

const ROLES = new Set<CmsRole>(['owner', 'admin', 'editor'])
const STATUSES = new Set<CmsUserStatus>(['active', 'disabled'])

function toMembership(row: CmsUserRow): CmsMembership {
  if (!isRole(row.role) || !isStatus(row.status)) {
    throw new CmsDataError('unknown', 'CMS user row has an unexpected role or status.')
  }

  return {
    userId: row.user_id,
    role: row.role,
    status: row.status,
  }
}

function isRole(value: string): value is CmsRole {
  return ROLES.has(value as CmsRole)
}

function isStatus(value: string): value is CmsUserStatus {
  return STATUSES.has(value as CmsUserStatus)
}

export function createCmsUsersRepository(request?: H3Event) {
  /**
   * Reads one membership through the session client.
   * RLS only returns the caller's own row, so another user's id comes back null.
   * `request` is the server event captured while Nuxt context still exists.
   */
  async function getByUserId(userId: string): Promise<CmsMembership | null> {
    const { data, error } = await getSupabaseAuthClient(request)
      .from(TABLE)
      .select('user_id, role, status')
      .eq('user_id', userId)
      .maybeSingle<CmsUserRow>()

    if (error) {
      throw toCmsDataError(error, 'Failed to load CMS user')
    }

    if (!data) {
      return null
    }

    return toMembership(data)
  }

  return { getByUserId }
}
