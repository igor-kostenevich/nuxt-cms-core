import { describe, expect, it } from 'vitest'
import { formatOffset, localToUtc, offsetAt, utcToLocal } from '../app/editor/form/datetime'

// 014, C-103: a datetime field stores UTC and is edited in the editor's zone.
// Every case names its zone, so the result does not depend on the machine.

describe('datetime: wall clock ↔ UTC', () => {
  it('an ordinary day in Kyiv, winter and summer', () => {
    expect(localToUtc('2026-01-15', '10:30', 'Europe/Kyiv')).toEqual({ kind: 'ok', moment: { iso: '2026-01-15T08:30:00Z', offset: 120 } })
    expect(localToUtc('2026-07-15', '10:30', 'Europe/Kyiv')).toEqual({ kind: 'ok', moment: { iso: '2026-07-15T07:30:00Z', offset: 180 } })
    expect(utcToLocal('2026-07-15T07:30:00Z', 'Europe/Kyiv')).toEqual({ date: '2026-07-15', time: '10:30', offset: 180 })
  })

  it('Kyiv, clocks forward (29.03.2026): 03:30 does not exist', () => {
    expect(localToUtc('2026-03-29', '03:30', 'Europe/Kyiv')).toEqual({ kind: 'nonexistent' })
    expect(localToUtc('2026-03-29', '02:59', 'Europe/Kyiv').kind).toBe('ok')
    expect(localToUtc('2026-03-29', '04:00', 'Europe/Kyiv')).toEqual({ kind: 'ok', moment: { iso: '2026-03-29T01:00:00Z', offset: 180 } })
  })

  it('Kyiv, clocks back (25.10.2026): 03:30 happens twice, both moments are offered', () => {
    expect(localToUtc('2026-10-25', '03:30', 'Europe/Kyiv')).toEqual({
      kind: 'ambiguous',
      moments: [
        { iso: '2026-10-25T00:30:00Z', offset: 180 },
        { iso: '2026-10-25T01:30:00Z', offset: 120 },
      ],
    })
  })

  it('another zone, New York: 02:30 on 08.03.2026 does not exist, 01:30 on 01.11.2026 is twice', () => {
    expect(localToUtc('2026-03-08', '02:30', 'America/New_York')).toEqual({ kind: 'nonexistent' })
    expect(localToUtc('2026-11-01', '01:30', 'America/New_York')).toEqual({
      kind: 'ambiguous',
      moments: [
        { iso: '2026-11-01T05:30:00Z', offset: -240 },
        { iso: '2026-11-01T06:30:00Z', offset: -300 },
      ],
    })
    expect(utcToLocal('2026-11-01T06:30:00Z', 'America/New_York')).toEqual({ date: '2026-11-01', time: '01:30', offset: -300 })
  })

  it('a zone without daylight saving and one with a half-hour offset', () => {
    expect(localToUtc('2026-03-29', '03:30', 'Asia/Tokyo')).toEqual({ kind: 'ok', moment: { iso: '2026-03-28T18:30:00Z', offset: 540 } })
    expect(localToUtc('2026-06-01', '00:15', 'Asia/Kolkata')).toEqual({ kind: 'ok', moment: { iso: '2026-05-31T18:45:00Z', offset: 330 } })
  })

  it('a stored moment round-trips through the wall clock in every zone', () => {
    for (const zone of ['Europe/Kyiv', 'America/New_York', 'Asia/Tokyo', 'UTC']) {
      const local = utcToLocal('2026-11-25T14:30:00Z', zone)
      const back = localToUtc(local.date, local.time, zone)
      expect(back.kind === 'ok' ? back.moment.iso : null).toBe('2026-11-25T14:30:00Z')
    }
  })

  it('offsets read as people write them', () => {
    expect(formatOffset(offsetAt(Date.parse('2026-01-15T00:00:00Z'), 'Europe/Kyiv'))).toBe('UTC+02:00')
    expect(formatOffset(-300)).toBe('UTC−05:00')
    expect(formatOffset(330)).toBe('UTC+05:30')
  })
})
