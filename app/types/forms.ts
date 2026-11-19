import type { H3Event } from 'h3'
import type { CmsForm } from '../../src/forms'

// Forms of the site (011). Definitions come from `cms.forms.ts` (src/forms.ts).
export type {
  CmsForm,
  CmsFormField,
  CmsFormFieldRole,
  CmsFormFieldType,
} from '../../src/forms'

/** Normalized values of a submission: text as trimmed strings, a checkbox as a boolean. */
export type CmsFormValues = Record<string, string | boolean>

/**
 * A validation error: the field and a stable code. The text a visitor sees is
 * a site text (`forms.<form>.errors.<code>`, else `forms.errors.<code>`), so
 * the wording changes in the admin without touching the rule.
 */
export interface CmsFormError {
  /** Field key; `_form` for an error of the whole form. */
  field: string
  code: string
}

/**
 * Context of the server hook `cms:forms:validate`: a site adds its business
 * rules in a Nitro plugin, after the built-in checks passed. Push errors with
 * a stable code; do not change `values`.
 *
 * The hook runs before the rate limits, so attempts it refuses are not
 * counted: it can be called without limit. Keep it cheap and do not use it
 * to check secrets (codes, invites) an attacker could guess by trying. If it
 * throws, the route logs the message and answers `unavailable`.
 *
 *   export default defineNitroPlugin((nitroApp) => {
 *     nitroApp.hooks.hook('cms:forms:validate', ({ form, values, errors }) => {
 *       if (form.key === 'booking' && String(values.date) < today()) {
 *         errors.push({ field: 'date', code: 'past_date' })
 *       }
 *     })
 *   })
 */
export interface CmsFormValidateContext {
  form: CmsForm
  values: Readonly<CmsFormValues>
  errors: CmsFormError[]
  locale: string | null
  event: H3Event
}

/** Where a submission is in the admin; read or not is separate (`readAt`). */
export type CmsSubmissionLocation = 'inbox' | 'archived' | 'spam'

/** A stored submission (011), as the admin reads it. Values are untrusted input: render as text. */
export interface CmsFormSubmission {
  id: string
  formKey: string
  payload: Record<string, unknown>
  location: CmsSubmissionLocation
  readAt: string | null
  pagePath: string | null
  locale: string | null
  createdAt: string
}

/** Numbers of one form for the admin: without spam; unread counts the inbox only. */
export interface CmsFormStats {
  formKey: string
  total: number
  unread: number
  lastAt: string | null
  /** Pages the submissions came from (up to 20). */
  sources: string[]
}
