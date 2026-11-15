import { CmsDataError, type CmsDataErrorCode } from '../data/errors'

const ERROR_KEYS = {
  not_found: 'cms.errors.notFound',
  permission_denied: 'cms.errors.permissionDenied',
  validation: 'cms.errors.validation',
  conflict: 'cms.errors.conflict',
  locked: 'cms.errors.locked',
  lock_lost: 'cms.errors.lockLost',
  unknown: 'cms.errors.unknown',
} as const satisfies Record<CmsDataErrorCode, string>

export type AdminErrorKey = (typeof ERROR_KEYS)[CmsDataErrorCode]

/**
 * Maps a data-layer failure to an admin UI translation key.
 *
 * Accepts a CmsDataError caught directly, or the NuxtError that useAsyncData
 * made of it (on the server, or revived from the SSR payload). In the second
 * case only `data.cmsCode` is left of the original error.
 */
export function adminErrorKey(error: unknown): AdminErrorKey {
  return ERROR_KEYS[errorCode(error)]
}

function errorCode(error: unknown): CmsDataErrorCode {
  if (error instanceof CmsDataError) {
    return error.code
  }

  if (error == null || typeof error !== 'object' || !('data' in error)) {
    return 'unknown'
  }

  const data = error.data
  const code = data != null && typeof data === 'object' && 'cmsCode' in data
    ? data.cmsCode
    : undefined

  return isErrorCode(code) ? code : 'unknown'
}

function isErrorCode(value: unknown): value is CmsDataErrorCode {
  return typeof value === 'string' && Object.hasOwn(ERROR_KEYS, value)
}
