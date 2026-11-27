import { describe, expect, it } from 'vitest'
import { reorderInPlace, serverStatuses } from '../app/admin/entries-order'
import { shownStatus } from '../app/admin/status-tone'

const entry = (id: string, status = 'published') => ({ id, status })
const ids = (items: { id: string }[]) => items.map(item => item.id)

describe('manual order: an entry off the site keeps its place (014 §8.1)', () => {
  it('reorders the live ones in the places live ones had', () => {
    const items = [entry('a'), entry('b', 'archived'), entry('c'), entry('d')]

    // Live: a, c, d → d, a, c; b stays second.
    expect(ids(reorderInPlace(items, ['d', 'a', 'c']))).toEqual(['d', 'b', 'a', 'c'])
  })

  it('keeps several archived entries where they are', () => {
    const items = [entry('x', 'archived'), entry('a'), entry('y', 'archived'), entry('b'), entry('c')]

    expect(ids(reorderInPlace(items, ['c', 'b', 'a']))).toEqual(['x', 'c', 'y', 'b', 'a'])
  })

  it('without archived entries it is the new order', () => {
    expect(ids(reorderInPlace([entry('a'), entry('b'), entry('c')], ['c', 'a', 'b']))).toEqual(['c', 'a', 'b'])
  })

  it('does not change the list it was given', () => {
    const items = [entry('a'), entry('b')]
    reorderInPlace(items, ['b', 'a'])

    expect(ids(items)).toEqual(['a', 'b'])
  })
})

describe('an entry taken off the site is a draft (014 UX)', () => {
  it('the lists show it as a draft, everything else as it is', () => {
    expect(shownStatus('archived')).toBe('draft')

    for (const status of ['draft', 'published', 'changed'] as const) {
      expect(shownStatus(status)).toBe(status)
    }
  })

  it('the Draft filter also asks for the ones taken off the site', () => {
    expect(serverStatuses(['draft'])).toEqual(['draft', 'archived'])
    expect(serverStatuses(['published', 'draft'])).toEqual(['published', 'draft', 'archived'])
    expect(serverStatuses(['published', 'changed'])).toEqual(['published', 'changed'])
    expect(serverStatuses([])).toEqual([])
  })
})
