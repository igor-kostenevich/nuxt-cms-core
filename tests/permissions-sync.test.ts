import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CMS_PERMISSIONS, roleCan } from '../app/auth/permissions'
import { CMS_ROLES } from '../app/types/auth'

/**
 * The permission matrix lives twice: `roleCan()` for the UI and `cms_can()` for
 * RLS. This test reads the SQL function from the newest migration that defines
 * it and checks that both copies grant exactly the same things.
 */

const MIGRATIONS_DIR = join(import.meta.dirname, '../supabase/migrations')
const ROLES = CMS_ROLES

// Matches both hand-written SQL and pg_dump style (`CREATE OR REPLACE FUNCTION "public"."cms_can"`),
// but not `grant` / `revoke ... on function public.cms_can(text)`.
const CREATE_CMS_CAN = /create\s+(?:or\s+replace\s+)?function\s+"?public"?\s*\.\s*"?cms_can"?\s*\(/gi
// Any dollar quote: `$$`, `$function$`, `$fn$`.
const DOLLAR_BODY = /\$(\w*)\$([\s\S]*?)\$\1\$/
const BRANCH = /^when\s+'([^']+)'\s+then\s+(.+)$/i
const ROLE_IN = /^"?role"?\s+in\s+\(([^)]*)\)$/i
const ROLE_EQUALS = /^"?role"?\s*=\s*'([^']+)'$/i

interface SqlMatrix {
  file: string
  grants: Map<string, Set<string>>
  hasElseFalse: boolean
}

function latestCmsCanDefinition(): { file: string, body: string } {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .reverse()

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    const definitions = [...sql.matchAll(CREATE_CMS_CAN)]
    const last = definitions.at(-1)

    if (last === undefined) {
      continue
    }

    // A file that redefines cms_can must be parsed; falling back to an older
    // migration would compare against a stale matrix and pass silently.
    const body = DOLLAR_BODY.exec(sql.slice(last.index))?.[2]

    if (!body) {
      throw new Error(`${file}: found a cms_can definition but could not read its body. Extend this test's parser.`)
    }

    return { file, body }
  }

  throw new Error(`No migration in ${MIGRATIONS_DIR} defines public.cms_can`)
}

function parseRoles(expression: string, file: string): Set<string> {
  const list = ROLE_IN.exec(expression)

  if (list?.[1] !== undefined) {
    return new Set(list[1].split(',').map((item) => item.trim().replace(/^'|'$/g, '')))
  }

  const single = ROLE_EQUALS.exec(expression)

  if (single?.[1]) {
    return new Set([single[1]])
  }

  throw new Error(`${file}: cannot parse cms_can branch "${expression}". Extend this test's parser.`)
}

function readSqlMatrix(): SqlMatrix {
  const { file, body } = latestCmsCanDefinition()
  const grants = new Map<string, Set<string>>()
  let hasElseFalse = false

  for (const raw of body.split('\n')) {
    const line = raw.trim()

    if (/^else\s+false$/i.test(line)) {
      hasElseFalse = true
      continue
    }

    if (!line.toLowerCase().startsWith('when ')) {
      continue
    }

    const branch = BRANCH.exec(line)

    if (!branch?.[1] || !branch[2]) {
      throw new Error(`${file}: cannot parse cms_can line "${line}". Extend this test's parser.`)
    }

    if (grants.has(branch[1])) {
      throw new Error(`${file}: permission "${branch[1]}" appears twice in cms_can`)
    }

    grants.set(branch[1], parseRoles(branch[2], file))
  }

  return { file, grants, hasElseFalse }
}

describe('permissions.ts matches cms_can()', () => {
  const matrix = readSqlMatrix()

  it('lists the same permissions', () => {
    expect([...matrix.grants.keys()].sort()).toEqual([...CMS_PERMISSIONS].sort())
  })

  it('denies anything not listed', () => {
    expect(matrix.hasElseFalse).toBe(true)
  })

  it('grants only known roles', () => {
    for (const roles of matrix.grants.values()) {
      for (const role of roles) {
        expect(ROLES).toContain(role)
      }
    }
  })

  for (const role of ROLES) {
    for (const permission of CMS_PERMISSIONS) {
      it(`${role} × ${permission}`, () => {
        const sql = matrix.grants.get(permission)?.has(role) ?? false
        expect(roleCan(role, permission), `${matrix.file} says ${sql}`).toBe(sql)
      })
    }
  }
})
