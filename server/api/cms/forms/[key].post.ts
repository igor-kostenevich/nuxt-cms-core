import { cmsForms } from '#cms/forms'
import { CMS_LOCALE_PATTERN } from '../../../../src/config'
import { defineEventHandler, getRequestHeader, getRequestWebStream, getRouterParam, setResponseStatus, type H3Event } from 'h3'
import { validateCmsForm } from '../../../../app/primitives/form-validation'
import type { CmsFormError } from '../../../../app/types/forms'
import { parseClientAddressSource, resolveClientAddress, type CmsClientAddressSource } from '../../../cms/client-address'
import { cmsFormStoreReady, storeCmsFormSubmission } from '../../../cms/form-store'
import {
  cleanHookErrors,
  CMS_FORM_BODY_LIMIT,
  CmsFormBodyTooLarge,
  parseSubmitBody,
  readLimitedText,
} from '../../../cms/form-submit'

/**
 * Submit route of the site forms (011, D-31). The only way a submission gets
 * into the database: the form is checked against the registry from the code,
 * the built-in rules and the site's hook run here, and the record is written
 * by one RPC with the secret key (server/cms/form-store.ts), which also
 * applies the rate limits and makes a retry idempotent.
 *
 * Answers `{ status }`, with `errors` when the values are refused:
 *   ok 200 · invalid 422 · unknown_form 404 · disabled 403 · rate_limited 429
 *   too_large 413 · bad_request 400 · unavailable 503
 */

type Status = 'ok' | 'invalid' | 'unknown_form' | 'disabled' | 'rate_limited' | 'too_large' | 'bad_request' | 'unavailable'

const HTTP_STATUS: Record<Status, number> = {
  ok: 200,
  invalid: 422,
  unknown_form: 404,
  disabled: 403,
  rate_limited: 429,
  too_large: 413,
  bad_request: 400,
  unavailable: 503,
}

function answer(event: H3Event, status: Status, errors?: CmsFormError[]) {
  setResponseStatus(event, HTTP_STATUS[status])
  return errors ? { status, errors } : { status }
}

const forms = new Map(cmsForms.map(form => [form.key, form]))

let addressSource: CmsClientAddressSource | undefined
const warned = new Set<string>()

function warnOnce(key: string, message: string) {
  if (!warned.has(key)) {
    warned.add(key)
    console.warn(`[nuxt-cms-core] forms: ${message}`)
  }
}

/** The source of the visitor address (server/cms/client-address.ts), read once per process. */
function getAddressSource(): CmsClientAddressSource {
  if (addressSource) {
    return addressSource
  }

  const option = (useRuntimeConfig() as { cms?: { clientAddress?: string } }).cms?.clientAddress
  const parsed = parseClientAddressSource(option, { vercel: process.env.VERCEL === '1', dev: import.meta.dev })

  if (!parsed) {
    warnOnce('option', `NUXT_CMS_CLIENT_ADDRESS "${option}" is not a known source; visitor limits are off.`)
  } else if (parsed.kind === 'none') {
    warnOnce('none', 'no trusted source of the visitor address (NUXT_CMS_CLIENT_ADDRESS); only the limit of each form counts.')
  }

  addressSource = parsed ?? { kind: 'none' }
  return addressSource
}

function visitorAddress(event: H3Event): string | null {
  const source = getAddressSource()
  const address = resolveClientAddress(source, {
    header: name => getRequestHeader(event, name),
    socket: event.node.req.socket?.remoteAddress,
  })

  if (!address && source.kind !== 'none') {
    warnOnce(`missing:${source.kind}`, `the source "${source.kind}" gave no visitor address; such requests count only against the limit of the form.`)
  }

  return address
}

export default defineEventHandler(async (event) => {
  const form = forms.get(getRouterParam(event, 'key') ?? '')

  if (!form) {
    return answer(event, 'unknown_form')
  }

  if (!/^application\/json\b/i.test(getRequestHeader(event, 'content-type') ?? '')) {
    return answer(event, 'bad_request')
  }

  const declared = Number(getRequestHeader(event, 'content-length'))

  if (Number.isFinite(declared) && declared > CMS_FORM_BODY_LIMIT) {
    return answer(event, 'too_large')
  }

  let text: string

  try {
    text = await readLimitedText(getRequestWebStream(event), CMS_FORM_BODY_LIMIT)
  } catch (cause) {
    if (cause instanceof CmsFormBodyTooLarge) {
      return answer(event, 'too_large')
    }

    throw cause
  }

  const body = parseSubmitBody(text)

  if (!body) {
    return answer(event, 'bad_request')
  }

  // A bot filled the field people do not see: answer as if it worked, store nothing.
  if (body.hp !== '') {
    return answer(event, 'ok')
  }

  const { values, errors } = validateCmsForm(form, body.values)

  if (errors.length > 0) {
    return answer(event, 'invalid', errors)
  }

  if (!cmsFormStoreReady()) {
    console.error('[nuxt-cms-core] forms: no secret key (NUXT_CMS_SUPABASE_SECRET); submissions are refused.')
    return answer(event, 'unavailable')
  }

  // As the page sent it; the database keeps it only when it is an active language.
  const locale = body.locale && CMS_LOCALE_PATTERN.test(body.locale) ? body.locale : null

  // Business rules of the site, after the built-in ones (server plugin).
  // Runs before the limits: refused attempts are not counted (see the hook type).
  const hookErrors: CmsFormError[] = []

  try {
    await useNitroApp().hooks.callHook('cms:forms:validate', {
      form,
      values: Object.freeze({ ...values }),
      errors: hookErrors,
      locale,
      event,
    })
  } catch (cause) {
    // The values stay out of the log: they are personal data.
    console.error(`[nuxt-cms-core] forms: the cms:forms:validate hook of "${form.key}" failed:`, cause instanceof Error ? cause.message : 'unknown error')
    return answer(event, 'unavailable')
  }

  const siteErrors = cleanHookErrors(hookErrors)

  if (siteErrors.length > 0) {
    return answer(event, 'invalid', siteErrors)
  }

  const result = await storeCmsFormSubmission({
    form,
    values,
    token: body.token,
    address: visitorAddress(event),
    page: body.page,
    locale,
  })

  return result === 'token_reused'
    ? answer(event, 'invalid', [{ field: '_form', code: 'resubmit' }])
    : answer(event, result)
})
