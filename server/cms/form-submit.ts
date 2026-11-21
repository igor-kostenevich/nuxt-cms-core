import type { CmsForm, CmsFormError, CmsFormValues } from '../../app/types/forms'

/**
 * Pure helpers of the form submit route (011). No Nitro or Supabase here, so
 * they are unit tested; the route wires them together.
 */

/** Largest request body the route reads, in bytes. */
export const CMS_FORM_BODY_LIMIT = 64 * 1024

export class CmsFormBodyTooLarge extends Error {}

/**
 * Reads a body stream up to `limit` bytes and stops reading past it: an
 * oversized body is never held in memory whole, whatever `content-length`
 * says (or does not say).
 */
export async function readLimitedText(stream: ReadableStream<Uint8Array> | undefined, limit: number): Promise<string> {
  if (!stream) {
    return ''
  }

  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  for (;;) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    total += value.byteLength

    if (total > limit) {
      await reader.cancel().catch(() => undefined)
      throw new CmsFormBodyTooLarge()
    }

    chunks.push(value)
  }

  const bytes = new Uint8Array(total)
  let offset = 0

  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

export interface CmsFormSubmitBody {
  values: Record<string, unknown>
  token: string
  /** Honeypot: a field people do not see and bots fill. */
  hp: string
  page: string | null
  locale: string | null
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** The parsed body, or null when it is not one the route accepts. */
export function parseSubmitBody(text: string): CmsFormSubmitBody | null {
  let body: unknown

  try {
    body = JSON.parse(text)
  } catch {
    return null
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null
  }

  const { values, token, hp, page, locale } = body as Record<string, unknown>

  if (typeof values !== 'object' || values === null || Array.isArray(values)
    || typeof token !== 'string' || !UUID_PATTERN.test(token)) {
    return null
  }

  return {
    values: values as Record<string, unknown>,
    token: token.toLowerCase(),
    hp: typeof hp === 'string' ? hp : '',
    page: typeof page === 'string' ? page : null,
    locale: typeof locale === 'string' ? locale : null,
  }
}

/** The path of the page a form was sent from: no origin, query or fragment; null when it is not a path. */
export function cleanPagePath(page: string | null): string | null {
  if (!page || !page.startsWith('/') || page.startsWith('//')) {
    return null
  }

  const path = page.split(/[?#]/, 1)[0]!
  // No spaces or control characters: a real path is URL-encoded.
  return path.length <= 300 && ![...path].some(char => char <= ' ' || char === '\u007F') ? path : null
}

/**
 * What the inbox searches: the values of the fields with a role, lowercased,
 * a phone also as its digits; a message is cut to 1000 characters. Other
 * fields stay out of search.
 */
export function buildSearchText(form: CmsForm, values: CmsFormValues): string {
  const parts: string[] = []

  for (const field of form.fields) {
    const value = values[field.key]

    if (!field.role || typeof value !== 'string') {
      continue
    }

    const text = field.role === 'message' ? value.slice(0, 1000) : value
    parts.push(text.toLowerCase())

    if (field.role === 'phone') {
      parts.push(value.replace(/\D/g, ''))
    }
  }

  return parts.join(' ').slice(0, 2000)
}

const CODE_PATTERN = /^[\w-]{1,64}$/

/** Errors a site hook added, kept only when they are well formed; at most 50. */
export function cleanHookErrors(errors: unknown[]): CmsFormError[] {
  return errors
    .filter((error): error is CmsFormError =>
      typeof error === 'object' && error !== null
      && typeof (error as CmsFormError).field === 'string' && (error as CmsFormError).field.length <= 64
      && typeof (error as CmsFormError).code === 'string' && CODE_PATTERN.test((error as CmsFormError).code))
    .slice(0, 50)
    .map(({ field, code }) => ({ field, code }))
}

// ── cms:forms:submitted (C-97) ─────────────────────────────────────────

/** How long the answer to the visitor waits for the handlers of a new submission. */
export const CMS_FORM_SUBMITTED_TIMEOUT_MS = 3000

type Handler = (...args: unknown[]) => unknown

/** A hookable caller: gets the handlers of the hook and its arguments. */
export type CmsFormSubmittedCaller = (handlers: readonly Handler[], args: readonly unknown[]) => Promise<void>

/** Only the kind of an error goes to the log: its message may quote the values. */
function errorKind(cause: unknown): string {
  const name = cause instanceof Error ? cause.name : typeof cause
  return /^[A-Za-z]{1,40}$/.test(name) ? name : 'Error'
}

/**
 * Runs the handlers of `cms:forms:submitted` for a stored submission and
 * resolves when they all finished or after the time limit, whichever comes
 * first. Never throws and never rejects: the submission is stored, so nothing
 * here may change the answer.
 *
 * - Each handler is isolated (a synchronous throw too) and its failure is
 *   logged at once, with the form key and the error kind only, so it reaches
 *   the log even when another handler hangs past the limit.
 * - After the limit nothing is cancelled: a handler may still finish (Node),
 *   or the platform may stop it (serverless). Its failure is logged if it runs.
 *
 * `callHookWith` wires the caller to the hook (`nitroApp.hooks.callHookWith`);
 * building the context inside it keeps any error there in this function too.
 */
export async function runFormSubmittedHook(
  callHookWith: (caller: CmsFormSubmittedCaller) => unknown,
  formKey: string,
  timeoutMs: number = CMS_FORM_SUBMITTED_TIMEOUT_MS,
): Promise<void> {
  const caller: CmsFormSubmittedCaller = (handlers, args) => Promise.all(handlers.map((handler, index) =>
    Promise.resolve()
      .then(() => handler(...args))
      .then(() => undefined, (cause: unknown) => {
        console.error(`[nuxt-cms-core] forms: cms:forms:submitted handler ${index + 1} failed for form "${formKey}" (${errorKind(cause)}).`)
      }),
  )).then(() => undefined)

  let finished: Promise<'done'>

  try {
    finished = Promise.resolve(callHookWith(caller)).then(() => 'done' as const, (cause: unknown) => {
      console.error(`[nuxt-cms-core] forms: cms:forms:submitted could not run for form "${formKey}" (${errorKind(cause)}).`)
      return 'done' as const
    })
  } catch (cause) {
    console.error(`[nuxt-cms-core] forms: cms:forms:submitted could not run for form "${formKey}" (${errorKind(cause)}).`)
    return
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs)
  })

  try {
    if (await Promise.race([finished, limit]) === 'timeout') {
      console.warn(`[nuxt-cms-core] forms: cms:forms:submitted handlers for form "${formKey}" did not finish within ${timeoutMs} ms; the answer did not wait for them.`)
    }
  } finally {
    clearTimeout(timer)
  }
}
