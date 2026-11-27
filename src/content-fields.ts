/**
 * Fields of a Content type (014, C-103): the Client Project describes the
 * admin form of its entries in cms.content.ts and Core renders it with the
 * admin's own controls; there is no other way to build that form. The schema
 * is the admin form only: the public site renders entries with its own
 * components (C-01), and the data stays in the entry's document (a key per
 * field).
 *
 * The value rules here (`fieldValueIssue`) are shared by the build check of
 * `default` and the form in the admin, so both judge a value the same way.
 */
import type { CmsContentLabel } from './content'

export type CmsContentFieldWidth = 'full' | 'half' | 'quarter'

interface FieldBase {
  label: CmsContentLabel
  /** Help under the field. */
  hint?: CmsContentLabel
  required?: boolean
  /** Share of the form's row: full (default), half, quarter. A phone shows every field full. */
  width?: CmsContentFieldWidth
}

interface WithPlaceholder {
  placeholder?: CmsContentLabel
}

export interface CmsContentTextField extends FieldBase, WithPlaceholder {
  type: 'text'
  maxLength?: number
  default?: string
}

export interface CmsContentTextareaField extends FieldBase, WithPlaceholder {
  type: 'textarea'
  maxLength?: number
  /** Visible lines, 2–20 (default 4). */
  rows?: number
  default?: string
}

export interface CmsContentRichTextField extends FieldBase {
  type: 'richText'
  maxLength?: number
}

export interface CmsContentNumberField extends FieldBase, WithPlaceholder {
  type: 'number'
  min?: number
  max?: number
  default?: number
}

export interface CmsContentSelectOption {
  /** Stored value, the same in every language. */
  value: string
  label: CmsContentLabel
}

export interface CmsContentSelectField extends FieldBase, WithPlaceholder {
  type: 'select'
  options: CmsContentSelectOption[]
  default?: string
}

export interface CmsContentRadioField extends FieldBase {
  type: 'radio'
  options: CmsContentSelectOption[]
  default?: string
}

export interface CmsContentMultiselectField extends FieldBase, WithPlaceholder {
  type: 'multiselect'
  options: CmsContentSelectOption[]
  /** Fewest and most values chosen. */
  min?: number
  max?: number
  default?: string[]
}

export interface CmsContentBooleanField extends Omit<FieldBase, 'required'> {
  type: 'boolean'
  /** How the yes / no shows: a switch (default) or a checkbox. */
  appearance?: 'switch' | 'checkbox'
  default?: boolean
}

export interface CmsContentDateField extends FieldBase, WithPlaceholder {
  type: 'date'
  /** `YYYY-MM-DD`: a calendar day, no time and no time zone. */
  min?: string
  max?: string
  default?: string
}

export interface CmsContentDateTimeField extends FieldBase, WithPlaceholder {
  type: 'datetime'
  /** A moment in UTC: `2026-11-25T14:30:00Z`. The admin edits it in the editor's own time zone. */
  min?: string
  max?: string
  default?: string
}

export interface CmsContentDateRangeValue {
  /** `YYYY-MM-DD`, start ≤ end. */
  start: string
  end: string
}

export interface CmsContentDateRangeField extends FieldBase, WithPlaceholder {
  type: 'dateRange'
  min?: string
  max?: string
  default?: CmsContentDateRangeValue
}

export interface CmsContentEmailField extends FieldBase, WithPlaceholder {
  type: 'email'
  maxLength?: number
  default?: string
}

export interface CmsContentUrlField extends FieldBase, WithPlaceholder {
  type: 'url'
  maxLength?: number
  default?: string
}

export interface CmsContentPhoneField extends FieldBase, WithPlaceholder {
  type: 'phone'
  default?: string
}

export interface CmsContentImageField extends FieldBase {
  type: 'image'
}

export interface CmsContentLinkField extends FieldBase {
  type: 'link'
}

export type CmsContentField =
  | CmsContentTextField
  | CmsContentTextareaField
  | CmsContentRichTextField
  | CmsContentNumberField
  | CmsContentSelectField
  | CmsContentRadioField
  | CmsContentMultiselectField
  | CmsContentBooleanField
  | CmsContentDateField
  | CmsContentDateTimeField
  | CmsContentDateRangeField
  | CmsContentEmailField
  | CmsContentUrlField
  | CmsContentPhoneField
  | CmsContentImageField
  | CmsContentLinkField

export type CmsContentFieldType = CmsContentField['type']

export const CMS_CONTENT_FIELD_TYPES = [
  'text', 'textarea', 'richText', 'number', 'select', 'radio', 'multiselect', 'boolean',
  'date', 'datetime', 'dateRange', 'email', 'url', 'phone', 'image', 'link',
] as const satisfies readonly CmsContentFieldType[]

/**
 * Translated in a translation of the entry (C-78): texts, and the alt / link
 * text inside an image / a link (by the Engine). Everything else is
 * structure: the same in every language, changed in the original.
 */
export const TRANSLATED_FIELD_TYPES: readonly CmsContentFieldType[] = ['text', 'textarea', 'richText']

/** Keys each field type takes besides the common ones: anything else is a typo, refused on build. */
const FIELD_KEYS: Record<CmsContentFieldType, readonly string[]> = {
  text: ['maxLength', 'default', 'placeholder'],
  textarea: ['maxLength', 'rows', 'default', 'placeholder'],
  richText: ['maxLength'],
  number: ['min', 'max', 'default', 'placeholder'],
  select: ['options', 'default', 'placeholder'],
  radio: ['options', 'default'],
  multiselect: ['options', 'min', 'max', 'default', 'placeholder'],
  boolean: ['appearance', 'default'],
  date: ['min', 'max', 'default', 'placeholder'],
  datetime: ['min', 'max', 'default', 'placeholder'],
  dateRange: ['min', 'max', 'default', 'placeholder'],
  email: ['maxLength', 'default', 'placeholder'],
  url: ['maxLength', 'default', 'placeholder'],
  phone: ['default', 'placeholder'],
  image: [],
  link: [],
}

const COMMON_KEYS = ['type', 'label', 'hint', 'required', 'width']
const WIDTHS: readonly CmsContentFieldWidth[] = ['full', 'half', 'quarter']

/** A field key is an address in the entry's document: a plain identifier. */
export const CONTENT_FIELD_KEY = /^[a-z][a-zA-Z0-9_]{0,39}$/
/** A stored option value. */
const OPTION_VALUE = /^[\w-]{1,80}$/
const MAX_FIELDS = 40
const MAX_OPTIONS = 100

// ── Values ────────────────────────────────────────────────────────────

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^\+?[\d\s()-]{5,20}$/

/** `YYYY-MM-DD` that is a real calendar day. */
export function isCalendarDate(value: unknown): value is string {
  const match = typeof value === 'string' ? DATE.exec(value) : null

  if (!match) {
    return false
  }

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** A UTC moment written as `YYYY-MM-DDTHH:mm[:ss[.sss]]Z`. */
export function isUtcDateTime(value: unknown): value is string {
  return typeof value === 'string' && DATETIME.test(value) && !Number.isNaN(Date.parse(value))
    && isCalendarDate(value.slice(0, 10))
}

function isRange(value: unknown): value is CmsContentDateRangeValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && isCalendarDate((value as Record<string, unknown>).start) && isCalendarDate((value as Record<string, unknown>).end)
}

/** No value: nothing stored, an empty text, no choice. `false` and `0` are values. */
export function isEmptyFieldValue(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
}

export type CmsFieldValueIssue = 'required' | 'maxLength' | 'range' | 'format' | 'option'

function outside(value: string | number, min: string | number | undefined, max: string | number | undefined) {
  return (min !== undefined && value < min) || (max !== undefined && value > max)
}

/**
 * What is wrong with a stored value of a field, or null. Rich text, images
 * and links are judged by the Engine (their own value shapes); this is for
 * the plain values of the form. A choice that is no longer in `options` is
 * `option`: kept as it is, but it blocks publishing until it is changed.
 */
export function fieldValueIssue(field: CmsContentField, value: unknown): CmsFieldValueIssue | null {
  if (isEmptyFieldValue(value)) {
    return 'required' in field && field.required ? 'required' : null
  }

  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'email':
    case 'url':
    case 'phone': {
      if (typeof value !== 'string') {
        return 'format'
      }

      if ('maxLength' in field && field.maxLength && value.length > field.maxLength) {
        return 'maxLength'
      }

      if (field.type === 'email' && !EMAIL.test(value)) {
        return 'format'
      }

      if (field.type === 'url' && !/^https?:\/\/\S+$/i.test(value)) {
        return 'format'
      }

      if (field.type === 'phone' && (!PHONE.test(value) || value.replace(/\D/g, '').length < 5)) {
        return 'format'
      }

      return null
    }
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 'format'
      }

      return outside(value, field.min, field.max) ? 'range' : null
    case 'select':
    case 'radio':
      if (typeof value !== 'string') {
        return 'format'
      }

      return field.options.some(option => option.value === value) ? null : 'option'
    case 'multiselect':
      if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
        return 'format'
      }

      if (value.some(item => !field.options.some(option => option.value === item))) {
        return 'option'
      }

      return outside(value.length, field.min, field.max) ? 'range' : null
    case 'boolean':
      return typeof value === 'boolean' ? null : 'format'
    case 'date':
      if (!isCalendarDate(value)) {
        return 'format'
      }

      return outside(value, field.min, field.max) ? 'range' : null
    case 'datetime':
      if (!isUtcDateTime(value)) {
        return 'format'
      }

      return outside(Date.parse(value), field.min ? Date.parse(field.min) : undefined, field.max ? Date.parse(field.max) : undefined)
        ? 'range'
        : null
    case 'dateRange':
      if (!isRange(value) || value.start > value.end) {
        return 'format'
      }

      return outside(value.start, field.min, field.max) || outside(value.end, field.min, field.max) ? 'range' : null
    default:
      return null
  }
}

// ── The declaration ───────────────────────────────────────────────────

export type CmsContentFieldProblem =
  | 'fields-shape'
  | 'fields-title'
  | 'fields-count'
  | 'field-key'
  | 'field-type'
  | 'field-label'
  | 'field-unknown-key'
  | 'field-length'
  | 'field-rows'
  | 'field-range'
  | 'field-options'
  | 'field-width'
  | 'field-appearance'
  | 'field-required'
  | 'field-default'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validLabel(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0 && value.length <= 120
  }

  return isObject(value)
    && Object.keys(value).length > 0
    && Object.values(value).every(text => typeof text === 'string' && text.trim().length > 0 && text.length <= 120)
}

function positiveInteger(value: unknown, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= max
}

function validOptions(options: unknown): boolean {
  if (!Array.isArray(options) || options.length === 0 || options.length > MAX_OPTIONS) {
    return false
  }

  const values = new Set<string>()

  for (const option of options) {
    if (!isObject(option) || typeof option.value !== 'string' || !OPTION_VALUE.test(option.value)
      || values.has(option.value) || !validLabel(option.label) || Object.keys(option).some(name => name !== 'value' && name !== 'label')) {
      return false
    }

    values.add(option.value)
  }

  return true
}

/** Bounds of the field's type: numbers, counts, days or UTC moments; min ≤ max. */
function validBounds(type: CmsContentFieldType, min: unknown, max: unknown): boolean {
  const check = (value: unknown) => {
    if (value === undefined) {
      return true
    }

    switch (type) {
      case 'number':
        return typeof value === 'number' && Number.isFinite(value)
      case 'multiselect':
        return typeof value === 'number' && Number.isInteger(value) && value >= 0
      case 'date':
      case 'dateRange':
        return isCalendarDate(value)
      case 'datetime':
        return isUtcDateTime(value)
      default:
        return false
    }
  }

  if (!check(min) || !check(max) || min === undefined || max === undefined) {
    return check(min) && check(max)
  }

  return type === 'datetime' ? Date.parse(min as string) <= Date.parse(max as string) : (min as number | string) <= (max as number | string)
}

function fieldProblem(key: string, field: unknown): CmsContentFieldProblem | null {
  if (!CONTENT_FIELD_KEY.test(key)) {
    return 'field-key'
  }

  if (!isObject(field) || !(CMS_CONTENT_FIELD_TYPES as readonly unknown[]).includes(field.type)) {
    return 'field-type'
  }

  const type = field.type as CmsContentFieldType

  if (Object.keys(field).some(name => !COMMON_KEYS.includes(name) && !FIELD_KEYS[type].includes(name))) {
    return 'field-unknown-key'
  }

  if (!validLabel(field.label) || (field.hint !== undefined && !validLabel(field.hint))
    || (field.placeholder !== undefined && !validLabel(field.placeholder))) {
    return 'field-label'
  }

  // `false` is an answer: a yes / no cannot be "required".
  if (field.required !== undefined && (typeof field.required !== 'boolean' || type === 'boolean')) {
    return 'field-required'
  }

  if (field.width !== undefined && !(WIDTHS as readonly unknown[]).includes(field.width)) {
    return 'field-width'
  }

  if (field.appearance !== undefined && field.appearance !== 'switch' && field.appearance !== 'checkbox') {
    return 'field-appearance'
  }

  if (field.maxLength !== undefined && !positiveInteger(field.maxLength, 100_000)) {
    return 'field-length'
  }

  if (field.rows !== undefined && !(positiveInteger(field.rows, 20) && (field.rows as number) >= 2)) {
    return 'field-rows'
  }

  if (FIELD_KEYS[type].includes('min') && !validBounds(type, field.min, field.max)) {
    return 'field-range'
  }

  if (FIELD_KEYS[type].includes('options') && !validOptions(field.options)) {
    return 'field-options'
  }

  // The default of a new entry must be a value the form itself accepts.
  if (field.default !== undefined) {
    const declared = { ...field, required: false } as CmsContentField

    if (isEmptyFieldValue(field.default) || fieldValueIssue(declared, field.default) !== null) {
      return 'field-default'
    }
  }

  return null
}

/**
 * Checks the fields of a type. Every entry needs a title (lists, search,
 * Activity, and the database refuses an entry without one): `title` is a
 * required text field, whatever the declaration says about `required`.
 */
export function resolveContentFields(input: unknown): {
  fields: Record<string, CmsContentField> | null
  problems: { field: string, reason: CmsContentFieldProblem }[]
} {
  if (!isObject(input) || Object.keys(input).length === 0) {
    return { fields: null, problems: [{ field: '*', reason: 'fields-shape' }] }
  }

  if (Object.keys(input).length > MAX_FIELDS) {
    return { fields: null, problems: [{ field: '*', reason: 'fields-count' }] }
  }

  const problems: { field: string, reason: CmsContentFieldProblem }[] = []

  for (const [key, field] of Object.entries(input)) {
    const reason = fieldProblem(key, field)

    if (reason) {
      problems.push({ field: key, reason })
    }
  }

  const title = input.title

  if (!isObject(title) || title.type !== 'text') {
    problems.push({ field: 'title', reason: 'fields-title' })
  }

  if (problems.length > 0) {
    return { fields: null, problems }
  }

  const fields = { ...input } as Record<string, CmsContentField>
  fields.title = { ...(fields.title as CmsContentTextField), required: true }
  return { fields, problems }
}

/** The values a new entry starts with: the declared defaults (never applied to existing entries). */
export function fieldDefaults(fields: Record<string, CmsContentField>): Record<string, unknown> {
  const values: Record<string, unknown> = {}

  for (const [key, field] of Object.entries(fields)) {
    if ('default' in field && field.default !== undefined) {
      values[key] = structuredClone(field.default)
    }
  }

  return values
}

/** The TypeScript type of a field's stored value, for the generated content types. */
export function fieldValueType(field: CmsContentField): string {
  const types = 'import(\'nuxt-cms-core/types\')'

  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'email':
    case 'url':
    case 'phone':
    case 'date':
    case 'datetime':
      return 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'select':
    case 'radio':
      return field.options.map(option => JSON.stringify(option.value)).join(' | ')
    case 'multiselect':
      return `(${field.options.map(option => JSON.stringify(option.value)).join(' | ')})[]`
    case 'dateRange':
      return '{ start: string, end: string }'
    case 'richText':
      return `${types}.CmsRichTextValue`
    case 'image':
      return `${types}.CmsImageValue`
    case 'link':
      return `${types}.CmsLinkValue`
  }
}
