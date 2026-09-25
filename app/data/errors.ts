export type CmsDataErrorCode = 'not_found' | 'permission_denied' | 'unknown'

/**
 * The only error type the Data Layer exposes. Backend-specific errors are
 * translated into this by the adapter, so UI and composables never see
 * PostgREST codes or SDK types.
 *
 * Deliberately one class with a code instead of a class hierarchy: nothing in
 * the CMS currently branches on more than the code.
 */
export class CmsDataError extends Error {
  readonly code: CmsDataErrorCode

  constructor(code: CmsDataErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'CmsDataError'
    this.code = code
  }
}
