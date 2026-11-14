import { CmsDataError, type CmsDataErrorCode } from '../data/errors'

const ERROR_KEYS = {
  not_found: 'cms.errors.notFound',
  permission_denied: 'cms.errors.permissionDenied',
  unknown: 'cms.errors.unknown',
} as const satisfies Record<CmsDataErrorCode, string>

export type AdminErrorKey = (typeof ERROR_KEYS)[CmsDataErrorCode]

/** Maps a data-layer failure to an admin UI translation key. */
export function adminErrorKey(error: unknown): AdminErrorKey {
  const cmsError = findCmsDataError(error)
  return ERROR_KEYS[cmsError?.code ?? 'unknown']
}

function findCmsDataError(error: unknown, depth = 0): CmsDataError | null {
  if (depth > 5 || error == null || typeof error !== 'object') {
    return null
  }

  if (error instanceof CmsDataError) {
    return error
  }

  if (!('cause' in error)) {
    return null
  }

  return findCmsDataError(error.cause, depth + 1)
}
