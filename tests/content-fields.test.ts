import { describe, expect, it } from 'vitest'
import { resolveCmsContent } from '../src/content'
import { fieldDefaults, fieldValueIssue, fieldValueType, resolveContentFields, type CmsContentField } from '../src/content-fields'

// 014, C-103: the form of a Content type, declared as fields in cms.content.ts
// and rendered by Core; the only way to build that form.

const vacancy = {
  title: { type: 'text', label: { en: 'Position', uk: 'Посада' }, maxLength: 120 },
  summary: { type: 'textarea', label: 'Summary', rows: 3, maxLength: 280, hint: 'On the card', width: 'half' },
  salary: { type: 'number', label: 'Salary', min: 0, max: 100, width: 'quarter' },
  employment: { type: 'select', label: 'Employment', default: 'full', options: [{ value: 'full', label: 'Full' }, { value: 'part', label: { en: 'Part' } }] },
  level: { type: 'radio', label: 'Level', options: [{ value: 'junior', label: 'Junior' }, { value: 'senior', label: 'Senior' }] },
  skills: { type: 'multiselect', label: 'Skills', min: 1, max: 2, default: ['vue'], options: [{ value: 'vue', label: 'Vue' }, { value: 'sql', label: 'SQL' }, { value: 'go', label: 'Go' }] },
  remote: { type: 'boolean', label: 'Remote', appearance: 'checkbox', default: false },
  start: { type: 'date', label: 'Start', min: '2026-01-01', max: '2026-12-31' },
  deadline: { type: 'datetime', label: 'Deadline' },
  interviews: { type: 'dateRange', label: 'Interviews' },
  email: { type: 'email', label: 'Email' },
  site: { type: 'url', label: 'Site', placeholder: 'https://' },
  phone: { type: 'phone', label: 'Phone' },
  description: { type: 'richText', label: 'Description', required: true },
  logo: { type: 'image', label: 'Logo' },
  apply: { type: 'link', label: 'Apply link' },
}

function resolved() {
  const { fields, problems } = resolveContentFields(vacancy)
  expect(problems).toEqual([])
  return fields!
}

describe('resolveContentFields', () => {
  it('keeps the declared order; the title is always required', () => {
    const fields = resolved()
    expect(Object.keys(fields)).toEqual(Object.keys(vacancy))
    expect(fields.title).toMatchObject({ type: 'text', required: true, maxLength: 120 })
  })

  it('names every problem by its field', () => {
    const { fields, problems } = resolveContentFields({
      title: { type: 'textarea', label: 'Title' },
      'Bad-Key': { type: 'text', label: 'x' },
      kind: { type: 'color', label: 'x' },
      nolabel: { type: 'text', label: '' },
      extra: { type: 'image', label: 'x', maxLength: 3 },
      long: { type: 'text', label: 'x', maxLength: 0 },
      rows: { type: 'textarea', label: 'x', rows: 1 },
      range: { type: 'number', label: 'x', min: 5, max: 1 },
      none: { type: 'select', label: 'x', options: [] },
      twice: { type: 'radio', label: 'x', options: [{ value: 'a', label: 'A' }, { value: 'a', label: 'B' }] },
      wide: { type: 'text', label: 'x', width: 'third' },
      look: { type: 'boolean', label: 'x', appearance: 'toggle' },
      must: { type: 'boolean', label: 'x', required: true },
      noPlaceholder: { type: 'radio', label: 'x', placeholder: 'x', options: [{ value: 'a', label: 'A' }] },
      badDate: { type: 'date', label: 'x', min: '2026-02-30' },
      badDefault: { type: 'select', label: 'x', default: 'gone', options: [{ value: 'a', label: 'A' }] },
      emptyDefault: { type: 'multiselect', label: 'x', default: [], options: [{ value: 'a', label: 'A' }] },
      lateDefault: { type: 'date', label: 'x', max: '2026-01-01', default: '2026-06-01' },
    })

    expect(fields).toBeNull()
    expect(problems.map(item => `${item.field}:${item.reason}`)).toEqual([
      'Bad-Key:field-key',
      'kind:field-type',
      'nolabel:field-label',
      'extra:field-unknown-key',
      'long:field-length',
      'rows:field-rows',
      'range:field-range',
      'none:field-options',
      'twice:field-options',
      'wide:field-width',
      'look:field-appearance',
      'must:field-required',
      'noPlaceholder:field-unknown-key',
      'badDate:field-range',
      'badDefault:field-default',
      'emptyDefault:field-default',
      'lateDefault:field-default',
      'title:fields-title',
    ])
  })

  it('refuses an empty schema and one without a title', () => {
    expect(resolveContentFields({}).problems).toEqual([{ field: '*', reason: 'fields-shape' }])
    expect(resolveContentFields({ name: { type: 'text', label: 'Name' } }).problems).toEqual([{ field: 'title', reason: 'fields-title' }])
  })

  it('gives the stored type of each field, for the generated content types', () => {
    const fields = resolved()
    expect(Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, fieldValueType(field)]))).toMatchObject({
      title: 'string',
      salary: 'number',
      employment: '"full" | "part"',
      level: '"junior" | "senior"',
      skills: '("vue" | "sql" | "go")[]',
      remote: 'boolean',
      start: 'string',
      deadline: 'string',
      interviews: '{ start: string, end: string }',
      logo: 'import(\'nuxt-cms-core/types\').CmsImageValue',
    })
  })

  it('defaults are a new entry\'s start only, copied (no shared arrays)', () => {
    const fields = resolved()
    const first = fieldDefaults(fields)
    expect(first).toEqual({ employment: 'full', skills: ['vue'], remote: false })
    ;(first.skills as string[]).push('sql')
    expect(fieldDefaults(fields).skills).toEqual(['vue'])
  })
})

describe('fieldValueIssue', () => {
  const fields = resolved()
  const issue = (key: string, value: unknown, patch: Partial<CmsContentField> = {}) =>
    fieldValueIssue({ ...fields[key], ...patch } as CmsContentField, value)

  it('false and 0 are values, not empty', () => {
    expect(issue('remote', false)).toBeNull()
    expect(issue('salary', 0, { required: true })).toBeNull()
    expect(issue('salary', undefined, { required: true })).toBe('required')
    expect(issue('remote', 'yes')).toBe('format')
  })

  it('a choice no longer offered blocks, for one value and for every chosen one', () => {
    expect(issue('employment', 'part')).toBeNull()
    expect(issue('employment', 'contract')).toBe('option')
    expect(issue('level', 'middle')).toBe('option')
    expect(issue('skills', ['vue', 'rust'])).toBe('option')
    expect(issue('skills', ['vue', 'sql'])).toBeNull()
  })

  it('a multi-select counts its choices and treats none as empty', () => {
    expect(issue('skills', [])).toBeNull()
    expect(issue('skills', [], { required: true })).toBe('required')
    expect(issue('skills', ['vue', 'sql', 'go'])).toBe('range')
    expect(issue('skills', ['vue', 'vue'.toUpperCase()])).toBe('option')
  })

  it('days, moments and ranges: real dates, within bounds, start ≤ end', () => {
    expect(issue('start', '2026-02-28')).toBeNull()
    expect(issue('start', '2026-02-30')).toBe('format')
    expect(issue('start', '2025-12-31')).toBe('range')
    expect(issue('deadline', '2026-11-25T14:30:00Z')).toBeNull()
    expect(issue('deadline', '2026-11-25 14:30')).toBe('format')
    expect(issue('interviews', { start: '2026-03-01', end: '2026-03-05' })).toBeNull()
    expect(issue('interviews', { start: '2026-03-05', end: '2026-03-01' })).toBe('format')
  })

  it('contacts and texts', () => {
    expect(issue('email', 'name@site.com')).toBeNull()
    expect(issue('email', 'name@site')).toBe('format')
    expect(issue('site', 'https://site.com/path')).toBeNull()
    expect(issue('site', 'javascript:alert(1)')).toBe('format')
    expect(issue('phone', '+38 (044) 123-45-67')).toBeNull()
    expect(issue('phone', '12')).toBe('format')
    expect(issue('title', 'x'.repeat(121))).toBe('maxLength')
    expect(issue('title', '')).toBe('required')
  })
})

describe('cms.content.ts: fields only', () => {
  it('a Content type has fields; a type with a route has none; a broken field names itself', () => {
    const { content, ignored } = resolveCmsContent({
      types: {
        vacancy: { label: 'Vacancies', fields: vacancy },
        routed: { label: 'x', route: '/blog/[slug]', fields: vacancy },
        broken: { label: 'x', fields: { title: { type: 'text', label: 'T' }, size: { type: 'number', label: 'S', min: 3, max: 1 } } },
      },
    })

    expect(content.types.map(type => `${type.key}:${type.section}`)).toEqual(['vacancy:content'])
    expect(ignored.map(item => `${item.kind}:${item.key}:${item.reason}`)).toEqual([
      'type:routed:route-and-fields',
      'field:broken.size:field-range',
    ])
  })
})
