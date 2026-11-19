import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFormsRepository } from '../app/data/repositories/forms.repository'

vi.mock('#imports', () => ({ useRuntimeConfig: vi.fn() }))

let calls: [string, unknown[]][] = []
let response: { data: unknown, error: unknown, count?: number | null } = { data: null, error: null }

// A query builder: records the chain and resolves with `response` when awaited.
function builder(): unknown {
  const target = {}
  return new Proxy(target, {
    get(_target, method: string) {
      if (method === 'then') {
        return (resolve: (value: unknown) => void) => resolve(response)
      }

      return (...args: unknown[]) => {
        calls.push([method, args])
        return builder()
      }
    },
  })
}

// The client itself is not thenable: it is awaited when created.
const client = {
  from: (...args: unknown[]) => {
    calls.push(['from', args])
    return builder()
  },
  rpc: (...args: unknown[]) => {
    calls.push(['rpc', args])
    return builder()
  },
}

vi.mock('../app/data/supabase-auth', () => ({ getSupabaseAuthClient: () => client }))

beforeEach(() => {
  calls = []
})

const row = {
  id: 's1',
  form_key: 'contact',
  payload: { name: 'Olena' },
  location: 'archived',
  read_at: null,
  page_path: '/contact',
  locale: 'uk',
  created_at: '2026-11-19T10:05:00.123456+00:00',
}

describe('FormsRepository (011)', () => {
  it('lists a page with the filters, newest first, and the total', async () => {
    response = { data: [row], error: null, count: 42 }

    await expect(createFormsRepository().list(
      { location: 'archived', formKey: 'contact', unreadOnly: true, search: ' 50%_off ' },
      { offset: 25, limit: 25 },
    )).resolves.toEqual({
      items: [{
        id: 's1', formKey: 'contact', payload: { name: 'Olena' }, location: 'archived', readAt: null,
        pagePath: '/contact', locale: 'uk', createdAt: '2026-11-19T10:05:00.123456+00:00',
      }],
      total: 42,
    })

    expect(calls).toEqual([
      ['from', ['cms_form_submissions']],
      ['select', ['id, form_key, payload, location, read_at, page_path, locale, created_at', { count: 'exact' }]],
      ['eq', ['location', 'archived']],
      ['eq', ['form_key', 'contact']],
      ['is', ['read_at', null]],
      // ILIKE wildcards in a search are plain text.
      ['ilike', ['search_text', '%50\\%\\_off%']],
      ['order', ['created_at', { ascending: false }]],
      ['order', ['id', { ascending: false }]],
      ['range', [25, 49]],
      ['returns', []],
    ])
  })

  it('reads an odd payload or location safely', async () => {
    response = { data: [{ ...row, payload: ['x'], location: 'weird' }], error: null, count: 1 }
    const { items } = await createFormsRepository().list({ location: 'inbox' }, { offset: 0, limit: 25 })

    expect(items[0]).toMatchObject({ payload: {}, location: 'inbox' })
  })

  it('changes only where a submission is and whether it is read', async () => {
    response = { data: null, error: null }
    const forms = createFormsRepository()

    await forms.setLocation(['a', 'b'], 'spam')
    await forms.setRead(['a'], false)
    await forms.setLocation([], 'inbox')

    expect(calls).toEqual([
      ['from', ['cms_form_submissions']],
      ['update', [{ location: 'spam' }]],
      ['in', ['id', ['a', 'b']]],
      ['from', ['cms_form_submissions']],
      ['update', [{ read_at: null }]],
      ['in', ['id', ['a']]],
    ])
  })

  it('counts unread submissions of the inbox', async () => {
    response = { data: null, error: null, count: 3 }

    await expect(createFormsRepository().unreadCount()).resolves.toBe(3)
    expect(calls).toEqual([
      ['from', ['cms_form_submissions']],
      ['select', ['id', { count: 'exact', head: true }]],
      ['eq', ['location', 'inbox']],
      ['is', ['read_at', null]],
    ])
  })

  it('turns a form on or off through the RPC and maps the numbers', async () => {
    response = { data: null, error: null }
    await createFormsRepository().setEnabled('contact', false)
    expect(calls).toEqual([['rpc', ['cms_form_set_enabled', { form_key: 'contact', form_enabled: false }]]])

    response = { data: [{ form_key: 'contact', total: '4', unread: '1', last_at: null, sources: null }], error: null }
    await expect(createFormsRepository().stats()).resolves.toEqual([
      { formKey: 'contact', total: 4, unread: 1, lastAt: null, sources: [] },
    ])
  })

  it('reports a backend error as CmsDataError', async () => {
    response = { data: null, error: { code: '42501', message: 'denied', details: '', hint: '' } }

    await expect(createFormsRepository().remove(['a'])).rejects.toMatchObject({ code: 'permission_denied' })
  })
})
