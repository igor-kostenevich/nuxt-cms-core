/**
 * Forms of the site (MASTER_PLAN 011, D-33…D-35). The Client Project declares
 * them in `cms.forms.ts`: fields, their types, rules and roles. CMS does not
 * build forms — it accepts, stores and shows submissions. The file ships in
 * the client bundle like `cms.config.ts`, so it holds plain values only.
 *
 * Texts of a form (labels, placeholders, the button, messages, the names of
 * select options) are site texts in `cms.texts.ts`, under
 * `forms.<form>.<field>.label`, `forms.<form>.<field>.options.<value>` and so on.
 */

export const CMS_FORM_FIELD_TYPES = ['text', 'email', 'tel', 'textarea', 'select', 'checkbox'] as const
export type CmsFormFieldType = typeof CMS_FORM_FIELD_TYPES[number]

/** What a field means to the inbox: the preview, the contact actions and search use it. */
export const CMS_FORM_FIELD_ROLES = ['name', 'email', 'phone', 'message'] as const
export type CmsFormFieldRole = typeof CMS_FORM_FIELD_ROLES[number]

export interface CmsFormFieldDefinition {
  /** Stable key: the value is stored under it, texts are keyed by it. */
  key: string
  type: CmsFormFieldType
  required?: boolean
  /** Characters; a default by type when left out. */
  maxLength?: number
  /** Values of a select: stable, stored as they are; their names are texts. */
  options?: string[]
  role?: CmsFormFieldRole
}

export interface CmsFormDefinition {
  fields: CmsFormFieldDefinition[]
}

export type CmsFormsInput = Record<string, CmsFormDefinition>

export interface CmsFormField {
  key: string
  type: CmsFormFieldType
  required: boolean
  /** Characters; 0 for a checkbox and a select, which have no free text. */
  maxLength: number
  options?: string[]
  role?: CmsFormFieldRole
}

export interface CmsForm {
  key: string
  fields: CmsFormField[]
}

/** Letters, digits, `_` and `-`, starting with a letter: an address segment and a text key segment. */
const KEY_PATTERN = /^[A-Za-z][\w-]*$/
const OPTION_PATTERN = /^[\w-]+$/
const MAX_KEY = 64
export const MAX_FORMS = 100
export const MAX_FIELDS = 50
const MAX_OPTIONS = 100
export const MAX_TEXT_LENGTH = 10000

export const CMS_FORM_DEFAULT_LENGTH: Record<CmsFormFieldType, number> = {
  text: 500,
  email: 254,
  tel: 32,
  textarea: 5000,
  select: 0,
  checkbox: 0,
}

/** Types a role can have: an email role is an email field, and so on. */
const ROLE_TYPES: Record<CmsFormFieldRole, readonly CmsFormFieldType[]> = {
  name: ['text'],
  email: ['email'],
  phone: ['tel'],
  message: ['textarea', 'text'],
}

export function defineCmsForms(forms: CmsFormsInput): CmsFormsInput {
  return forms
}

export type CmsFormsIgnoredReason =
  | 'form-key'
  | 'form-shape'
  | 'too-many-forms'
  | 'no-fields'
  | 'field-key'
  | 'field-duplicate'
  | 'field-type'
  | 'field-length'
  | 'field-options'
  | 'field-role'
  | 'role-duplicate'
  | 'too-many-fields'

export interface CmsFormsResolution {
  forms: CmsForm[]
  /** Entries left out, with the reason, for a build-time warning. `field` is set for a field. */
  ignored: { form: string, field?: string, reason: CmsFormsIgnoredReason }[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isKey(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_KEY && KEY_PATTERN.test(value)
}

/**
 * Checks `cms.forms.ts`. It is loaded without typechecking, so a wrong entry
 * is dropped with a warning instead of failing the build or accepting junk:
 * a bad field is left out, a form without valid fields is left out.
 */
export function resolveCmsForms(input: unknown): CmsFormsResolution {
  const forms: CmsForm[] = []
  const ignored: CmsFormsResolution['ignored'] = []

  if (!isPlainObject(input)) {
    return { forms, ignored }
  }

  for (const [formKey, definition] of Object.entries(input)) {
    if (!isKey(formKey)) {
      ignored.push({ form: formKey, reason: 'form-key' })
      continue
    }

    if (forms.length >= MAX_FORMS) {
      ignored.push({ form: formKey, reason: 'too-many-forms' })
      continue
    }

    if (!isPlainObject(definition) || !Array.isArray(definition.fields)) {
      ignored.push({ form: formKey, reason: 'form-shape' })
      continue
    }

    const fields: CmsFormField[] = []
    const roles = new Set<CmsFormFieldRole>()

    for (const raw of definition.fields as unknown[]) {
      const field = resolveField(raw)
      const key = isPlainObject(raw) && typeof raw.key === 'string' ? raw.key : String(fields.length)

      if (typeof field === 'string') {
        ignored.push({ form: formKey, field: key, reason: field })
        continue
      }

      if (fields.some(existing => existing.key === field.key)) {
        ignored.push({ form: formKey, field: field.key, reason: 'field-duplicate' })
        continue
      }

      if (field.role && roles.has(field.role)) {
        ignored.push({ form: formKey, field: field.key, reason: 'role-duplicate' })
        Reflect.deleteProperty(field, 'role')
      }

      if (fields.length >= MAX_FIELDS) {
        ignored.push({ form: formKey, field: field.key, reason: 'too-many-fields' })
        continue
      }

      if (field.role) {
        roles.add(field.role)
      }

      fields.push(field)
    }

    if (fields.length === 0) {
      ignored.push({ form: formKey, reason: 'no-fields' })
      continue
    }

    forms.push({ key: formKey, fields })
  }

  forms.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return { forms, ignored }
}

function resolveField(raw: unknown): CmsFormField | CmsFormsIgnoredReason {
  if (!isPlainObject(raw) || !isKey(raw.key)) {
    return 'field-key'
  }

  const type = raw.type as CmsFormFieldType

  if (!CMS_FORM_FIELD_TYPES.includes(type)) {
    return 'field-type'
  }

  const field: CmsFormField = {
    key: raw.key,
    type,
    required: raw.required === true,
    maxLength: CMS_FORM_DEFAULT_LENGTH[type],
  }

  if (raw.maxLength !== undefined && field.maxLength > 0) {
    if (!Number.isInteger(raw.maxLength) || (raw.maxLength as number) < 1 || (raw.maxLength as number) > MAX_TEXT_LENGTH) {
      return 'field-length'
    }

    field.maxLength = raw.maxLength as number
  }

  if (type === 'select') {
    const options = raw.options

    if (!Array.isArray(options) || options.length === 0 || options.length > MAX_OPTIONS
      || !options.every(option => typeof option === 'string' && option.length <= MAX_KEY && OPTION_PATTERN.test(option))
      || new Set(options).size !== options.length) {
      return 'field-options'
    }

    field.options = [...options] as string[]
  }

  if (raw.role !== undefined) {
    const role = raw.role as CmsFormFieldRole

    if (!CMS_FORM_FIELD_ROLES.includes(role) || !ROLE_TYPES[role].includes(type)) {
      return 'field-role'
    }

    field.role = role
  }

  return field
}
