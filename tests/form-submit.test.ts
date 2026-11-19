import { describe, expect, it } from 'vitest'
import {
  buildSearchText,
  cleanHookErrors,
  cleanPagePath,
  CmsFormBodyTooLarge,
  parseSubmitBody,
  readLimitedText,
} from '../server/cms/form-submit'
import { resolveCmsForms } from '../src/forms'

function streamOf(chunks: string[]) {
  let pulled = 0
  let cancelled = false
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled < chunks.length) {
        controller.enqueue(encoder.encode(chunks[pulled++]))
      } else {
        controller.close()
      }
    },
    cancel() {
      cancelled = true
    },
  })

  return { stream, pulled: () => pulled, cancelled: () => cancelled }
}

describe('form submit route helpers (011)', () => {
  it('reads a body within the limit', async () => {
    await expect(readLimitedText(streamOf(['{"a":', '"ü"}']).stream, 64)).resolves.toBe('{"a":"ü"}')
    await expect(readLimitedText(undefined, 64)).resolves.toBe('')
  })

  it('stops reading past the limit, whatever the header said', async () => {
    const body = streamOf(['x'.repeat(40), 'x'.repeat(40), 'x'.repeat(40), 'x'.repeat(40)])

    await expect(readLimitedText(body.stream, 64)).rejects.toBeInstanceOf(CmsFormBodyTooLarge)
    expect(body.pulled()).toBe(2)
    expect(body.cancelled()).toBe(true)
  })

  it('accepts only the expected body shape', () => {
    const token = '0b6f4b0e-6c1f-4f3e-9d6a-2a6c7c0d5e11'

    expect(parseSubmitBody(JSON.stringify({ values: { a: 'b' }, token, page: '/x', locale: 'uk' })))
      .toEqual({ values: { a: 'b' }, token, hp: '', page: '/x', locale: 'uk' })
    expect(parseSubmitBody('not json')).toBeNull()
    expect(parseSubmitBody(JSON.stringify({ values: [], token }))).toBeNull()
    expect(parseSubmitBody(JSON.stringify({ values: {}, token: 'abc' }))).toBeNull()
  })

  it('keeps only the path of the page', () => {
    expect(cleanPagePath('/uk/about?utm=x#form')).toBe('/uk/about')
    expect(cleanPagePath('https://evil.example/x')).toBeNull()
    expect(cleanPagePath('//evil.example/x')).toBeNull()
    expect(cleanPagePath('/a b')).toBeNull()
    expect(cleanPagePath(`/${'x'.repeat(300)}`)).toBeNull()
    expect(cleanPagePath(null)).toBeNull()
  })

  it('searches only the fields with a role', () => {
    const [form] = resolveCmsForms({
      contact: {
        fields: [
          { key: 'name', type: 'text', role: 'name' },
          { key: 'phone', type: 'tel', role: 'phone' },
          { key: 'secret', type: 'text' },
          { key: 'message', type: 'textarea', role: 'message' },
        ],
      },
    }).forms

    expect(buildSearchText(form!, { name: 'Olena', phone: '+380 67 123', secret: 'hidden', message: 'Hi '.repeat(600) }))
      .toBe(`olena +380 67 123 38067123 ${'hi '.repeat(600).slice(0, 1000)}`.slice(0, 2000))
  })

  it('keeps well-formed errors from a site hook', () => {
    expect(cleanHookErrors([
      { field: 'date', code: 'past_date', extra: 1 },
      { field: 'x', code: 'bad code' },
      'nope',
      { field: 1, code: 'x' },
    ])).toEqual([{ field: 'date', code: 'past_date' }])
  })
})
