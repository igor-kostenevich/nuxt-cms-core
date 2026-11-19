import { cmsForms } from '#cms/forms'
import { reactive, ref, watch } from 'vue'
import { useRoute } from '#imports'
import { validateCmsForm } from '../primitives/form-validation'
import { useCmsLocaleState } from '../primitives/locale'
import type { CmsForm, CmsFormError, CmsFormValues } from '../types/forms'
import { useCmsText } from './useCmsText'

/** Where a sending is: nothing yet, on its way, stored, or refused / failed (`problem` says why). */
export type CmsFormStatus = 'idle' | 'sending' | 'sent' | 'error'

/**
 * Why the form as a whole was not sent:
 *   invalid       some fields are wrong (`errors`); an error of the field
 *                 `_form` is about the form as a whole: `resubmit` means the
 *                 server refused this sending, and pressing Send again starts
 *                 a new one with the same values;
 *   disabled      the owner turned the form off;
 *   rate_limited  too many sendings from this visitor, try later;
 *   unavailable   the server could not store it (no secret key, backend down);
 *   network       no answer; sending again is safe (the same sending is not stored twice);
 *   unknown_form  the form is not in cms.forms.ts.
 */
export type CmsFormProblem = 'invalid' | 'disabled' | 'rate_limited' | 'unavailable' | 'network' | 'unknown_form'

const forms = new Map(cmsForms.map(form => [form.key, form]))

/** A v4 UUID; `crypto.randomUUID` needs a secure context, so a plain-HTTP preview gets the fallback. */
function newToken(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0F) | 0x40
  bytes[8] = (bytes[8]! & 0x3F) | 0x80
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function emptyValues(form: CmsForm | undefined): CmsFormValues {
  return Object.fromEntries((form?.fields ?? []).map(field => [field.key, field.type === 'checkbox' ? false : '']))
}

/**
 * A form of the site declared in `cms.forms.ts` (011). The site builds the
 * markup; this gives its state, the texts and sending:
 *
 *   const contact = useCmsForm('contact')
 *   <form @submit.prevent="contact.submit()">
 *     <label>{{ contact.label('name') }} <input v-model="contact.values.name"></label>
 *     <span v-if="contact.fieldError('name')">{{ contact.fieldError('name') }}</span>
 *     <input v-model="contact.honeypot.value" v-bind="contact.honeypotAttrs">
 *   </form>
 *
 * Texts are site texts (`cms.texts.ts`, editable on the Texts screen):
 * `forms.<form>.<field>.label`, `forms.<form>.<field>.options.<value>`,
 * `forms.<form>.errors.<code>` (else `forms.errors.<code>`), and any other
 * `forms.<form>.*` key through `text()`.
 *
 * A sending carries one token: a retry after a lost answer reuses it, so the
 * server stores it once. Changing a value, or a refusal of the values by the
 * server, starts a new sending. Nothing is sent again by itself.
 */
// Values are typed loosely by default so `v-model` works on any input; pass a
// type for stricter code: useCmsForm<{ name: string, consent: boolean }>('contact').
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useCmsForm<Values extends Record<string, string | boolean> = Record<string, any>>(key: string) {
  const form = forms.get(key)

  if (!form && import.meta.dev) {
    console.warn(`[nuxt-cms-core] useCmsForm: "${key}" is not declared in cms.forms.ts.`)
  }

  const { t, has } = useCmsText()
  const locale = useCmsLocaleState()
  const route = useRoute()

  const values = reactive(emptyValues(form)) as Values
  const errors = ref<CmsFormError[]>([])
  const status = ref<CmsFormStatus>('idle')
  const problem = ref<CmsFormProblem | null>(null)
  /** Bind to a field hidden from people; a filled one marks a bot. */
  const honeypot = ref('')
  const honeypotAttrs = {
    'name': 'website',
    'type': 'text',
    'tabindex': -1,
    'autocomplete': 'off',
    'aria-hidden': 'true' as const,
    'style': 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden',
  }

  let token: string | null = null

  // Other values are another sending: it gets a token of its own.
  watch(values, () => {
    token = null
  }, { deep: true })

  /** A site text of this form: `text('success')` reads `forms.<form>.success`. */
  function text(path: string, params?: Record<string, string | number>): string {
    return t(`forms.${key}.${path}`, params)
  }

  function label(field: string): string {
    return text(`${field}.label`)
  }

  /** Name of a select value; the value itself when it has no text. */
  function option(field: string, value: string): string {
    const textKey = `forms.${key}.${field}.options.${value}`
    return has(textKey) ? t(textKey) : value
  }

  function errorText(code: string): string {
    const own = `forms.${key}.errors.${code}`
    return has(own) ? t(own) : t(`forms.errors.${code}`)
  }

  /** The text of the first error of a field, or null. */
  function fieldError(field: string): string | null {
    const error = errors.value.find(item => item.field === field)
    return error ? errorText(error.code) : null
  }

  function fail(reason: CmsFormProblem, fieldErrors: CmsFormError[] = []) {
    status.value = 'error'
    problem.value = reason
    errors.value = fieldErrors
    return false
  }

  /** Sends the form; true when it is stored. Checks the values first, as the server will. */
  async function submit(): Promise<boolean> {
    if (status.value === 'sending') {
      return false
    }

    if (!form) {
      return fail('unknown_form')
    }

    const check = validateCmsForm(form, values as CmsFormValues)

    if (check.errors.length > 0) {
      return fail('invalid', check.errors)
    }

    token ??= newToken()
    status.value = 'sending'
    problem.value = null
    errors.value = []

    try {
      await $fetch(`/api/cms/forms/${encodeURIComponent(key)}`, {
        method: 'POST',
        body: { values: { ...values }, token, hp: honeypot.value, page: route.path, locale: locale.value },
      })
    } catch (cause) {
      const data = (cause as { data?: { status?: string, errors?: CmsFormError[] } }).data
      const reason = data?.status

      if (reason === 'invalid' || reason === 'disabled' || reason === 'rate_limited' || reason === 'unknown_form') {
        // Refused values were not stored: the next press is a new sending
        // (after `resubmit` the old token is spent; reusing it would be refused again).
        if (reason === 'invalid') {
          token = null
        }

        return fail(reason, Array.isArray(data?.errors) ? data.errors : [])
      }

      return fail(data ? 'unavailable' : 'network')
    }

    status.value = 'sent'
    token = null
    return true
  }

  /** Empties the form for a new sending. */
  function reset() {
    Object.assign(values, emptyValues(form))
    errors.value = []
    status.value = 'idle'
    problem.value = null
    honeypot.value = ''
    token = null
  }

  return {
    form,
    values,
    errors,
    status,
    problem,
    honeypot,
    honeypotAttrs,
    submit,
    reset,
    text,
    label,
    option,
    fieldError,
    errorText,
  }
}
