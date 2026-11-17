import type { H3Event } from 'h3'
import { CmsDataError, type CmsDataErrorCode } from '../errors'
import { getSupabaseClient } from '../supabase'
import type { CmsStorageAdapter } from './storage-adapter'

/** Bucket created by the cms_media migration. */
export const CMS_MEDIA_BUCKET = 'cms-media'

/** Object paths are random and never reused, so a file can be cached for a year. */
const CACHE_SECONDS = String(60 * 60 * 24 * 365)

const STATUS_CODES: Record<number, CmsDataErrorCode> = {
  400: 'validation',
  401: 'permission_denied',
  403: 'permission_denied',
  404: 'not_found',
  409: 'conflict',
  413: 'validation',
  415: 'validation',
}

function codeOf(status: unknown): CmsDataErrorCode | undefined {
  const value = Number(status)
  return Object.hasOwn(STATUS_CODES, value) ? STATUS_CODES[value] : undefined
}

/**
 * Storage errors carry an HTTP `status` and a `statusCode` string; some
 * Storage versions answer an RLS refusal with 400 and `statusCode: "403"`, so
 * the more specific `statusCode` wins. The rest of the CMS sees CmsDataError only.
 */
function toStorageError(error: unknown, context: string): CmsDataError {
  const fields = typeof error === 'object' && error !== null
    ? error as { status?: unknown, statusCode?: unknown }
    : {}
  const code = codeOf(fields.statusCode) ?? codeOf(fields.status) ?? 'unknown'
  const message = error instanceof Error ? error.message : String(error)

  return new CmsDataError(code, `${context}: ${message}`, { cause: error })
}

/**
 * Supabase Storage behind the adapter contract. Writes use the signed-in
 * client (Storage RLS checks cms_can); the URL needs only the public client,
 * so the Public Runtime does not load the session client for it.
 */
export function createSupabaseStorage(request?: H3Event): CmsStorageAdapter {
  async function bucket() {
    const { getSupabaseAuthClient } = await import('../supabase-auth')
    return getSupabaseAuthClient(request).storage.from(CMS_MEDIA_BUCKET)
  }

  return {
    async upload(path, file, contentType) {
      const { error } = await (await bucket()).upload(path, file, {
        contentType,
        cacheControl: CACHE_SECONDS,
        upsert: false,
      })

      if (error) {
        throw toStorageError(error, 'Failed to upload the file')
      }
    },

    async remove(paths) {
      if (paths.length === 0) {
        return
      }

      const { error } = await (await bucket()).remove(paths)

      if (error) {
        throw toStorageError(error, 'Failed to remove files')
      }
    },

    publicUrl(path) {
      return getSupabaseClient().storage.from(CMS_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl
    },
  }
}
