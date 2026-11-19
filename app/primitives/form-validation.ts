import type { CmsForm, CmsFormError, CmsFormField, CmsFormValues } from '../types/forms'

/**
 * The built-in rules of a form field (011, D-34). The same function runs in
 * the browser for quick feedback and on the server as the authority: the
 * server never trusts the browser's check. Business rules of a site go into
 * the server hook `cms:forms:validate`, after these.
 *
 * Codes are stable; their texts are site texts.
 */
export const CMS_FORM_ERROR_CODES = [
  'required',
  'type',
  'email',
  'tel',
  'too_long',
  'option',
  'unknown_field',
] as const

export interface CmsFormValidation {
  /** What is stored: trimmed text, booleans; empty optional fields are left out. */
  values: CmsFormValues
  errors: CmsFormError[]
}

// Pragmatic, not RFC 5322: one @, no spaces, a dot in the domain.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/
// Digits with the usual separators and an optional leading +.
const TEL_PATTERN = /^\+?[\d\s().-]+$/
const TEL_MIN_DIGITS = 5

function normalizeText(field: CmsFormField, value: string): string {
  const text = value.replace(/\r\n?/g, '\n').trim()
  // Only a textarea keeps line breaks; a one-line field gets them as spaces.
  return field.type === 'textarea' ? text : text.replace(/\s+/g, ' ')
}

function checkField(field: CmsFormField, raw: unknown): { value?: string | boolean, code?: string } {
  if (field.type === 'checkbox') {
    if (raw !== undefined && raw !== null && typeof raw !== 'boolean') {
      return { code: 'type' }
    }

    const checked = raw === true
    // A required checkbox is a consent: it must be ticked.
    return field.required && !checked ? { code: 'required' } : { value: checked }
  }

  if (raw !== undefined && raw !== null && typeof raw !== 'string') {
    return { code: 'type' }
  }

  const text = typeof raw === 'string' ? normalizeText(field, raw) : ''

  if (text === '') {
    return field.required ? { code: 'required' } : {}
  }

  if (field.type === 'select') {
    return field.options?.includes(text) ? { value: text } : { code: 'option' }
  }

  if ([...text].length > field.maxLength) {
    return { code: 'too_long' }
  }

  if (field.type === 'email' && !EMAIL_PATTERN.test(text)) {
    return { code: 'email' }
  }

  if (field.type === 'tel'
    && (!TEL_PATTERN.test(text) || text.replace(/\D/g, '').length < TEL_MIN_DIGITS)) {
    return { code: 'tel' }
  }

  return { value: text }
}

/** Checks the values of a submission against the form; keys the form does not have are errors. */
export function validateCmsForm(form: CmsForm, input: Record<string, unknown>): CmsFormValidation {
  const values: CmsFormValues = {}
  const errors: CmsFormError[] = []

  for (const key of Object.keys(input)) {
    if (!form.fields.some(field => field.key === key)) {
      errors.push({ field: key.slice(0, 64), code: 'unknown_field' })
    }
  }

  for (const field of form.fields) {
    const raw = Object.hasOwn(input, field.key) ? input[field.key] : undefined
    const { value, code } = checkField(field, raw)

    if (code) {
      errors.push({ field: field.key, code })
    } else if (value !== undefined && value !== false) {
      values[field.key] = value
    }
  }

  return { values, errors }
}
