import { createError } from 'h3'
import { describe, expect, it } from 'vitest'
import { adminErrorKey } from '../app/admin/error-key'
import { CmsDataError } from '../app/data/errors'

const postgrestError = { code: '42501', message: 'denied', details: '', hint: '' }

describe('adminErrorKey', () => {
  it('reads the code of a CmsDataError caught directly', () => {
    expect(adminErrorKey(new CmsDataError('not_found', 'missing'))).toBe('cms.errors.notFound')
  })

  // useAsyncData does exactly this: createError() replaces the class and moves
  // the original `cause` up, so only `data` is left of the CmsDataError.
  it('reads the code after useAsyncData wrapped the error', () => {
    const original = new CmsDataError('permission_denied', 'denied', { cause: postgrestError })
    const wrapped = createError(original)

    expect(wrapped).not.toBeInstanceOf(CmsDataError)
    expect(adminErrorKey(wrapped)).toBe('cms.errors.permissionDenied')
  })

  it('reads the code from an error revived from the SSR payload', () => {
    const wrapped = createError(new CmsDataError('not_found', 'missing'))
    const revived = JSON.parse(JSON.stringify(wrapped))

    expect(adminErrorKey(revived)).toBe('cms.errors.notFound')
  })

  it('falls back to unknown for foreign errors and unknown codes', () => {
    expect(adminErrorKey(new Error('boom'))).toBe('cms.errors.unknown')
    expect(adminErrorKey({ data: { cmsCode: 'toString' } })).toBe('cms.errors.unknown')
    expect(adminErrorKey({ data: null })).toBe('cms.errors.unknown')
    expect(adminErrorKey(null)).toBe('cms.errors.unknown')
  })
})
