import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Supabase loads `safeupdate` for API requests: UPDATE and DELETE without a
// WHERE clause fail with 21000, inside security definer functions too. pgTAP
// runs as postgres without it, so the database tests cannot catch this.
const dir = join(import.meta.dirname, '../supabase/migrations')

describe('migrations under safeupdate', () => {
  it('every UPDATE and DELETE statement has a WHERE clause', () => {
    const offenders: string[] = []

    for (const file of readdirSync(dir).filter(name => name.endsWith('.sql'))) {
      const sql = readFileSync(join(dir, file), 'utf8').replace(/--[^\n]*/g, '')

      for (const match of sql.matchAll(/^\s*(update\s+public\.|delete\s+from\s+public\.)[^;]*;/gim)) {
        if (!/\bwhere\b/i.test(match[0])) {
          offenders.push(`${file}: ${match[0].trim().split('\n')[0]}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
