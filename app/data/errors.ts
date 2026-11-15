export type CmsDataErrorCode =
  | 'not_found'
  | 'permission_denied'
  /** The backend rejected the value: not a content object, over the size limit, bad locale. */
  | 'validation'
  /** The write would replace data the caller did not confirm replacing (Restore over a draft). */
  | 'conflict'
  /** Another user's editing session holds the Content Lock. */
  | 'locked'
  /** This editing session no longer holds the lock: taken over or force-unlocked. */
  | 'lock_lost'
  | 'unknown'

/** Serializable part of a CmsDataError, kept in `data` so the code survives wrapping. */
export interface CmsDataErrorData {
  cmsCode: CmsDataErrorCode
}

/**
 * The only error type the Data Layer exposes. Backend-specific errors are
 * translated into this by the adapter, so UI and composables never see
 * PostgREST codes or SDK types.
 *
 * Deliberately one class with a code instead of a class hierarchy: nothing in
 * the CMS currently branches on more than the code.
 *
 * useAsyncData wraps a thrown error with createError(): the class and `cause`
 * are lost, and only `message` and `data` reach the SSR payload. The code is
 * therefore duplicated in `data`, where both the wrapper and the payload keep it.
 */
export class CmsDataError extends Error {
  readonly code: CmsDataErrorCode
  readonly data: CmsDataErrorData

  constructor(code: CmsDataErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'CmsDataError'
    this.code = code
    this.data = { cmsCode: code }
  }
}
