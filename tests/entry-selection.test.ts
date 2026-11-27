import { describe, expect, it, vi } from 'vitest'
import { cmsEntrySelection } from '../app/composables/useCmsEntries'

vi.mock('#imports', () => ({ useAsyncData: vi.fn() }))
vi.mock('#cms/config', () => ({ cmsConfig: { defaultLocale: 'en' } }))

describe('cmsEntrySelection', () => {
  it('no value: the default from code, newest first', () => {
    expect(cmsEntrySelection(null, { limit: 3 })).toEqual({ limit: 3, sort: 'newest' })
  })

  it('automatic: its own limit, else the default', () => {
    expect(cmsEntrySelection({ mode: 'automatic', limit: 6 }, { limit: 3 })).toEqual({ limit: 6, sort: 'newest' })
    expect(cmsEntrySelection({ mode: 'automatic' }, { limit: 3 })).toEqual({ limit: 3, sort: 'newest' })
    expect(cmsEntrySelection({ mode: 'automatic', limit: -1 }, { limit: 3 })).toEqual({ limit: 3, sort: 'newest' })
  })

  it('manual: the chosen ids in their order', () => {
    expect(cmsEntrySelection({ mode: 'manual', ids: ['b', 'a'] }, { limit: 3 })).toEqual({ ids: ['b', 'a'] })
  })

  it('a malformed stored value falls back to the default', () => {
    expect(cmsEntrySelection({ mode: 'manual' } as never, { limit: 2 })).toEqual({ limit: 2, sort: 'newest' })
    expect(cmsEntrySelection({ mode: 'other' } as never, { limit: 2 })).toEqual({ limit: 2, sort: 'newest' })
  })
})
