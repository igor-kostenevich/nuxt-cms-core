import { PASSWORD_MIN_LENGTH, type FieldRule } from './validation'
import { useAdminI18n } from './useAdminI18n'

const PHONE_MIN_DIGITS = 7
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Admin field rules. Messages come from `cms.validation`. */
export function useAdminValidation() {
  const { t } = useAdminI18n()

  function required(): FieldRule {
    return (value) => text(value).trim() !== '' || t('cms.validation.required')
  }

  /** Empty is valid: pair with `required` when the field cannot be blank. */
  function email(): FieldRule {
    return (value) => {
      const raw = text(value).trim()

      if (raw === '') {
        return true
      }

      return EMAIL_PATTERN.test(raw) || t('cms.validation.email')
    }
  }

  /** Empty is valid. Checks shape only: a leading plus, digits, spaces and dashes. */
  function phone(): FieldRule {
    return (value) => {
      const raw = text(value).trim()

      if (raw === '') {
        return true
      }

      const digits = raw.replace(/\D/g, '').length
      const plusAtStart = raw.startsWith('+')
      const extraPlus = raw.slice(plusAtStart ? 1 : 0).includes('+')
      const unexpectedCharacter = /[^\d\s()+-]/.test(raw)

      if (unexpectedCharacter || extraPlus || digits < PHONE_MIN_DIGITS) {
        return t('cms.validation.phone')
      }

      return true
    }
  }

  /** Empty is valid. Does not trim: a space can be part of the password. */
  function password(): FieldRule {
    return (value) => {
      const raw = text(value)

      if (raw === '') {
        return true
      }

      return raw.length >= PASSWORD_MIN_LENGTH || t('cms.validation.password', { min: PASSWORD_MIN_LENGTH })
    }
  }

  /** Compares the raw value with another field. The getter is read at check time. */
  function confirmed(expected: () => string): FieldRule {
    return (value) => text(value) === expected() || t('cms.validation.confirmed')
  }

  function all(...rules: FieldRule[]): FieldRule {
    return (value) => {
      for (const rule of rules) {
        const result = rule(value)

        if (result !== true) {
          return result
        }
      }

      return true
    }
  }

  return { all, required, email, phone, password, confirmed }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
