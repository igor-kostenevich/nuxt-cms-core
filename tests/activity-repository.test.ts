import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createActivityRepository, olderThan } from '../app/data/repositories/activity.repository'

vi.mock('#imports', () => ({ useRuntimeConfig: vi.fn() }))

let calls: [string, unknown[]][] = []
let response: { data: unknown, error: unknown } = { data: [], error: null }

// A query builder: records the chain and resolves with `response` when awaited.
function builder(): unknown {
  return new Proxy({}, {
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

const client = {
  from: (...args: unknown[]) => {
    calls.push(['from', args])
    return builder()
  },
}

vi.mock('../app/data/supabase-auth', () => ({ getSupabaseAuthClient: () => client }))

beforeEach(() => {
  calls = []
  response = { data: [], error: null }
})

function row(id: string, createdAt: string) {
  return {
    id,
    created_at: createdAt,
    actor_email: 'owner@example.test',
    action: 'publish',
    entity_type: 'page',
    entity_id: 'p1',
    entity_label: 'home',
    locale: 'en',
    revision_id: 'r1',
    details: null,
  }
}

const ID_A = '00000000-0000-4000-8000-00000000000a'
const ID_B = '00000000-0000-4000-8000-00000000000b'
const ID_C = '00000000-0000-4000-8000-00000000000c'

describe('olderThan', () => {
  it('keeps the database time exactly, microseconds included, and breaks ties by id', () => {
    expect(olderThan({ createdAt: '2026-11-19T15:04:15.192937+00:00', id: ID_A })).toBe(
      `created_at.lt."2026-11-19T15:04:15.192937+00:00",and(created_at.eq."2026-11-19T15:04:15.192937+00:00",id.lt.${ID_A})`,
    )
  })

  it('rejects a cursor that is not a database time and a uuid', () => {
    expect(() => olderThan({ createdAt: '2026-11-19),id.gt.(0', id: ID_A })).toThrow()
    expect(() => olderThan({ createdAt: '2026-11-19T15:04:15+00:00', id: 'x,or(id.gt.0)' })).toThrow()
  })
})

describe('createActivityRepository().list', () => {
  it('reads newest first by (created_at, id), one row more than the page', async () => {
    await createActivityRepository().list({ category: 'all', limit: 2 })

    expect(calls).toContainEqual(['from', ['cms_activity']])
    expect(calls).toContainEqual(['order', ['created_at', { ascending: false }]])
    expect(calls).toContainEqual(['order', ['id', { ascending: false }]])
    expect(calls).toContainEqual(['limit', [3]])
    expect(calls.some(([method]) => method === 'in' || method === 'or')).toBe(false)
  })

  it('filters a category by its entity types', async () => {
    await createActivityRepository().list({ category: 'settings', limit: 2 })
    expect(calls).toContainEqual(['in', ['entity_type', ['settings', 'language', 'form']]])
  })

  it('returns the cursor of the last shown event, as the database returned it', async () => {
    response = {
      data: [
        row(ID_C, '2026-11-19T15:04:16.000001+00:00'),
        row(ID_B, '2026-11-19T15:04:15.192937+00:00'),
        row(ID_A, '2026-11-19T15:04:15.192937+00:00'),
      ],
      error: null,
    }

    const page = await createActivityRepository().list({ category: 'all', limit: 2 })

    expect(page.items.map(item => item.id)).toEqual([ID_C, ID_B])
    expect(page.next).toEqual({ createdAt: '2026-11-19T15:04:15.192937+00:00', id: ID_B })
  })

  it('has no next page when the extra row is missing', async () => {
    response = { data: [row(ID_A, '2026-11-19T15:04:15.192937+00:00')], error: null }
    expect((await createActivityRepository().list({ category: 'all', limit: 2 })).next).toBeNull()
  })

  it('passes the cursor as a keyset condition', async () => {
    await createActivityRepository().list({
      category: 'pages',
      before: { createdAt: '2026-11-19T15:04:15.192937+00:00', id: ID_B },
      limit: 2,
    })

    expect(calls).toContainEqual(['in', ['entity_type', ['page']]])
    expect(calls).toContainEqual(['or', [olderThan({ createdAt: '2026-11-19T15:04:15.192937+00:00', id: ID_B })]])
  })

  it('throws a CmsDataError on a database error', async () => {
    response = { data: null, error: { code: '42501', message: 'denied' } }
    await expect(createActivityRepository().list({ category: 'all', limit: 2 })).rejects.toMatchObject({ code: 'permission_denied' })
  })
})
