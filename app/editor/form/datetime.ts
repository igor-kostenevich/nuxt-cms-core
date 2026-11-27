/**
 * A `datetime` field (014, C-103) stores a moment in UTC and is edited as a
 * wall-clock time in the editor's time zone. Turning a wall-clock time back
 * into a moment is not always one answer: on the night clocks go forward an
 * hour does not exist, on the night they go back an hour happens twice. These
 * functions say so instead of picking silently; the form then refuses the
 * time, or asks which of the two moments is meant (shown with its offset).
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** The editor's time zone (IANA), e.g. `Europe/Kyiv`. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function wallClockParts(utcMs: number, timeZone: string) {
  let formatter = formatters.get(timeZone)

  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(timeZone, formatter)
  }

  const parts = Object.fromEntries(formatter.formatToParts(new Date(utcMs)).map(part => [part.type, part.value]))
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

/** The zone's offset from UTC at a moment, in minutes (Kyiv in winter: 120). */
export function offsetAt(utcMs: number, timeZone: string): number {
  const p = wallClockParts(utcMs, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / MINUTE)
}

/** `UTC+02:00`, `UTC−05:00`, `UTC+05:30`. */
export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '−' : '+'
  const total = Math.abs(minutes)
  return `UTC${sign}${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

const pad = (value: number) => String(value).padStart(2, '0')

/** A stored moment as the editor sees it: day, time and offset in the zone. */
export function utcToLocal(iso: string, timeZone: string): { date: string, time: string, offset: number } {
  const ms = Date.parse(iso)
  const p = wallClockParts(ms, timeZone)
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
    offset: offsetAt(ms, timeZone),
  }
}

export interface LocalMoment {
  /** The stored value: `2026-11-25T12:30:00Z`. */
  iso: string
  /** The zone's offset at that moment, minutes. */
  offset: number
}

export type LocalResolution =
  | { kind: 'ok', moment: LocalMoment }
  /** Clocks skip this time (going forward): no such moment. */
  | { kind: 'nonexistent' }
  /** Clocks pass this time twice (going back): the earlier and the later moment. */
  | { kind: 'ambiguous', moments: [LocalMoment, LocalMoment] }

/**
 * The moment(s) a wall-clock `date` (`YYYY-MM-DD`) and `time` (`HH:mm`) name
 * in a zone. Every offset the zone has around that day is tried; a candidate
 * counts only if it reads back as the same wall-clock time.
 */
export function localToUtc(date: string, time: string, timeZone: string): LocalResolution {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const [hour, minute] = time.split(':').map(Number) as [number, number]
  const wall = Date.UTC(year, month - 1, day, hour, minute)
  const offsets = new Set([offsetAt(wall - 24 * HOUR, timeZone), offsetAt(wall, timeZone), offsetAt(wall + 24 * HOUR, timeZone)])
  const moments: LocalMoment[] = []

  for (const offset of offsets) {
    const utc = wall - offset * MINUTE
    const back = utcToLocal(new Date(utc).toISOString(), timeZone)

    if (back.date === date && back.time === time && !moments.some(item => Date.parse(item.iso) === utc)) {
      moments.push({ iso: new Date(utc).toISOString().replace('.000Z', 'Z'), offset: offsetAt(utc, timeZone) })
    }
  }

  moments.sort((a, b) => Date.parse(a.iso) - Date.parse(b.iso))

  if (moments.length === 0) {
    return { kind: 'nonexistent' }
  }

  if (moments.length === 1) {
    return { kind: 'ok', moment: moments[0]! }
  }

  return { kind: 'ambiguous', moments: [moments[0]!, moments[1]!] }
}
