import { describe, expect, it } from 'vitest'
import { adminDate } from '../app/admin/dates'

describe('adminDate', () => {
  it('day.month.year with leading zeros, in every language of the admin', () => {
    expect(adminDate('1996-10-12T12:00:00')).toBe('12.10.1996')
    expect(adminDate('2026-03-05T12:00:00')).toBe('05.03.2026')
  })

  it('nothing without a valid date', () => {
    expect(adminDate(null)).toBe('')
    expect(adminDate('not a date')).toBe('')
  })
})
