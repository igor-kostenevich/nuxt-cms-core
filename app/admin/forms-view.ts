import type { CmsForm, CmsFormField, CmsFormSubmission } from '../types/forms'

/**
 * How the admin shows submissions (011): pure functions over a submission,
 * the form from the code and the site texts. Submission values are untrusted
 * input: they are returned as plain strings for text interpolation, and the
 * only links built from them use fixed schemes over checked values.
 */

/** A site text, or undefined when there is none (no warning, no fallback). */
export type TextLookup = (key: string) => string | undefined

/** `contact_form` → "Contact form": a readable name when there is no text. */
export function humanize(key: string): string {
  const words = key.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase()
  return words ? words[0]!.toUpperCase() + words.slice(1) : key
}

/**
 * A page the way a person names it, from the path a submission came from:
 * the language prefix is dropped (`/uk/about` and `/about` are one page),
 * the home page is `home`, any other page is its last segment ("About",
 * "Web design"). Core has no page titles; the exact path stays a tooltip.
 */
export function pageName(path: string | null, languages: readonly string[], home: string): string {
  if (!path) {
    return ''
  }

  const segments = path.split('/').filter(Boolean)

  if (segments.length > 0 && languages.includes(segments[0]!)) {
    segments.shift()
  }

  const last = segments.at(-1)

  if (!last) {
    return home
  }

  let decoded = last

  try {
    decoded = decodeURIComponent(last)
  } catch {
    // A malformed escape: show it as it is.
  }

  return humanize(decoded)
}

/** Distinct page names of a list of paths, in order. */
export function pageNames(paths: readonly string[], languages: readonly string[], home: string): string[] {
  return [...new Set(paths.map(path => pageName(path, languages, home)).filter(Boolean))]
}

export function formName(formKey: string, text: TextLookup): string {
  return text(`forms.${formKey}.name`) ?? text(`forms.${formKey}.title`) ?? humanize(formKey)
}

export function fieldLabel(formKey: string, fieldKey: string, text: TextLookup): string {
  return text(`forms.${formKey}.${fieldKey}.label`) ?? humanize(fieldKey)
}

export interface ValueWords {
  yes: string
  no: string
}

/** A value as text: a checkbox as yes / no, a select value as the name of the option. */
export function valueText(
  formKey: string,
  field: CmsFormField | undefined,
  value: unknown,
  text: TextLookup,
  words: ValueWords,
): string {
  if (typeof value === 'boolean') {
    return value ? words.yes : words.no
  }

  if (typeof value === 'string') {
    if (field?.type === 'select') {
      return text(`forms.${formKey}.${field.key}.options.${value}`) ?? value
    }

    return value
  }

  if (value === null || value === undefined) {
    return ''
  }

  return typeof value === 'number' ? String(value) : JSON.stringify(value)
}

function roleValue(submission: CmsFormSubmission, form: CmsForm | undefined, role: CmsFormField['role']): string {
  const field = form?.fields.find(item => item.role === role)
  const value = field ? submission.payload[field.key] : undefined
  return typeof value === 'string' ? value : ''
}

export interface SubmissionPreview {
  /** Who: the name, else the email, else the phone, else the first text. */
  title: string
  /** What: the message, else the first other text. */
  excerpt: string
}

/** The two lines of a submission in the inbox. */
export function submissionPreview(submission: CmsFormSubmission, form: CmsForm | undefined): SubmissionPreview {
  const strings = Object.values(submission.payload).filter((value): value is string => typeof value === 'string' && value !== '')
  const title = roleValue(submission, form, 'name')
    || roleValue(submission, form, 'email')
    || roleValue(submission, form, 'phone')
    || strings[0]
    || ''
  const excerpt = roleValue(submission, form, 'message') || strings.find(value => value !== title) || ''

  return { title, excerpt: excerpt.replace(/\s+/g, ' ').slice(0, 240) }
}

const EMAIL_PATTERN = /^[^\s@<>"'()\\]+@[^\s@<>"'()\\.]+(?:\.[^\s@<>"'()\\.]+)+$/

export interface SubmissionContacts {
  email?: { value: string, mailto: string }
  phone?: { value: string, tel: string, whatsapp: string, viber: string }
}

/**
 * Contact actions for a submission. Built only from a checked email and the
 * digits of a phone, with fixed schemes: a stored value never becomes a link
 * of its own.
 */
export function submissionContacts(submission: CmsFormSubmission, form: CmsForm | undefined): SubmissionContacts {
  const contacts: SubmissionContacts = {}
  const email = roleValue(submission, form, 'email')

  if (email && email.length <= 254 && EMAIL_PATTERN.test(email)) {
    contacts.email = { value: email, mailto: `mailto:${encodeURIComponent(email).replace('%40', '@')}` }
  }

  const phone = roleValue(submission, form, 'phone')
  const digits = phone.replace(/\D/g, '')

  if (digits.length >= 5 && digits.length <= 20) {
    const international = phone.trim().startsWith('+')
    contacts.phone = {
      value: phone,
      tel: `tel:${international ? '+' : ''}${digits}`,
      whatsapp: `https://wa.me/${digits}`,
      viber: `viber://chat?number=%2B${digits}`,
    }
  }

  return contacts
}

export interface SubmissionField {
  key: string
  label: string
  value: string
  role?: CmsFormField['role']
  /** Not in the form any more (removed from the code): shown by its key. */
  historical: boolean
}

/**
 * Every value of a submission in the order of the form, then the keys the
 * form no longer has. Empty values are left out.
 */
export function submissionFields(
  submission: CmsFormSubmission,
  form: CmsForm | undefined,
  text: TextLookup,
  words: ValueWords,
): SubmissionField[] {
  const rows: SubmissionField[] = []
  const known = new Set<string>()

  for (const field of form?.fields ?? []) {
    known.add(field.key)

    if (!Object.hasOwn(submission.payload, field.key)) {
      continue
    }

    const value = valueText(submission.formKey, field, submission.payload[field.key], text, words)

    if (value !== '') {
      rows.push({ key: field.key, label: fieldLabel(submission.formKey, field.key, text), value, role: field.role, historical: false })
    }
  }

  for (const [key, raw] of Object.entries(submission.payload)) {
    if (known.has(key)) {
      continue
    }

    const value = valueText(submission.formKey, undefined, raw, text, words)

    if (value !== '') {
      rows.push({ key, label: key, value, historical: true })
    }
  }

  return rows
}

// CSV ------------------------------------------------------------------------------

/**
 * One CSV cell. A value a spreadsheet would run as a formula (`=`, `+`, `-`,
 * `@`, their full-width forms, a tab, a carriage return or a line feed first)
 * gets a leading apostrophe (OWASP CSV injection); every cell is quoted.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r\n\uFF1D\uFF0B\uFF0D\uFF20]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

const BOM = '\uFEFF'

/** A CSV file: UTF-8 with a BOM (Excel reads Cyrillic then), CRLF lines. */
export function toCsv(header: string[], rows: string[][]): string {
  return `${BOM}${[header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}

export interface CsvLabels {
  date: string
  form: string
  status: string
  read: string
  page: string
  language: string
  fields: string
  locations: Record<CmsFormSubmission['location'], string>
  words: ValueWords
}

function localTime(iso: string): string {
  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return iso
  }

  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Submissions as CSV. With `form`: a column per field of the form, then the
 * keys only old submissions have. Without: one `fields` column of JSON, as
 * forms have different fields.
 */
export function submissionsCsv(
  submissions: CmsFormSubmission[],
  forms: Map<string, CmsForm>,
  form: CmsForm | null,
  text: TextLookup,
  labels: CsvLabels,
): string {
  const system = (submission: CmsFormSubmission) => [
    localTime(submission.createdAt),
    formName(submission.formKey, text),
    labels.locations[submission.location],
    submission.readAt ? labels.words.yes : labels.words.no,
    submission.pagePath ?? '',
    submission.locale ?? '',
  ]
  const systemHeader = [labels.date, labels.form, labels.status, labels.read, labels.page, labels.language]

  if (!form) {
    return toCsv(
      [...systemHeader, labels.fields],
      submissions.map(submission => [...system(submission), JSON.stringify(submission.payload)]),
    )
  }

  const keys = form.fields.map(field => field.key)

  for (const submission of submissions) {
    for (const key of Object.keys(submission.payload)) {
      if (!keys.includes(key)) {
        keys.push(key)
      }
    }
  }

  const fieldOf = new Map(form.fields.map(field => [field.key, field]))

  return toCsv(
    [...systemHeader, ...keys.map(key => (fieldOf.has(key) ? fieldLabel(form.key, key, text) : key))],
    submissions.map(submission => [
      ...system(submission),
      ...keys.map(key => valueText(submission.formKey, fieldOf.get(key) ?? forms.get(submission.formKey)?.fields.find(field => field.key === key), submission.payload[key], text, labels.words)),
    ]),
  )
}
