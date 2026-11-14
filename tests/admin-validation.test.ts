import { describe, expect, it, vi } from 'vitest'
import { PASSWORD_MIN_LENGTH, useAdminValidation } from '../app/composables/useAdminValidation'

vi.mock('../app/composables/useAdminI18n', () => ({
  useAdminI18n: () => ({
    t: () => 'invalid',
  }),
}))

const invalid = 'invalid'

describe('admin field rules', () => {
  const { all, required, email, phone, password, confirmed } = useAdminValidation()

  it('requires a non-blank value and lets later rules run', () => {
    const rule = all(required(), email())

    expect(rule('')).toBe(invalid)
    expect(rule('   ')).toBe(invalid)
    expect(rule('ada@example.com')).toBe(true)
  })

  it('checks an email address without rejecting an empty field', () => {
    const rule = email()

    expect(rule('')).toBe(true)
    expect(rule('ada')).toBe(invalid)
    expect(rule('ada@example')).toBe(invalid)
    expect(rule(' ada@example.com ')).toBe(true)
  })

  it('checks a phone number by its shape', () => {
    const rule = phone()

    expect(rule('')).toBe(true)
    expect(rule('12345')).toBe(invalid)
    expect(rule('call me')).toBe(invalid)
    expect(rule('++380671234567')).toBe(invalid)
    expect(rule('380+671234567')).toBe(invalid)
    expect(rule('+380 67 123 45 67')).toBe(true)
    expect(rule('(067) 123-45-67')).toBe(true)
  })

  it('checks password length without trimming', () => {
    const rule = password()
    const shortest = 'a'.repeat(PASSWORD_MIN_LENGTH)

    expect(rule('')).toBe(true)
    expect(rule(shortest.slice(1))).toBe(invalid)
    expect(rule(shortest)).toBe(true)
    expect(rule('  abcd')).toBe(true)
  })

  it('compares a confirmation with the current other value', () => {
    let other = 'secret1'
    const rule = confirmed(() => other)

    expect(rule('secret1')).toBe(true)
    expect(rule('secret2')).toBe(invalid)

    other = 'secret2'
    expect(rule('secret2')).toBe(true)
  })
})
