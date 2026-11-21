import { describe, expect, it } from 'vitest'
import { activityLookupIds, describeActivity, groupByDay, type ActivityLookups } from '../app/admin/activity-view'
import en from '../app/admin/locales/en.json'
import uk from '../app/admin/locales/uk.json'
import type { CmsActivityEvent } from '../app/types/activity'
import type { CmsPermission } from '../app/types/auth'

const PAGE = '00000000-0000-4000-8000-0000000000a1'
const SUBMISSION = '00000000-0000-4000-8000-0000000000b1'

function translate(dictionary: unknown) {
  return (key: string, params: Record<string, string | number> = {}) => {
    const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], dictionary)

    if (typeof value !== 'string') {
      throw new Error(`Missing translation ${key}`)
    }

    return value.replace(/\{(\w+)\}/g, (_match, name: string) => String(params[name] ?? `{${name}}`))
  }
}

function lookups(overrides: Partial<ActivityLookups> = {}): ActivityLookups {
  return {
    t: translate(uk),
    can: () => true,
    editPaths: new Map([[PAGE, '/about']]),
    existingSubmissions: new Set([SUBMISSION]),
    languageCodes: ['en', 'uk'],
    formName: key => (key === 'contact' ? 'Контакти' : key),
    ...overrides,
  }
}

function event(overrides: Partial<CmsActivityEvent>): CmsActivityEvent {
  return {
    id: 'e1',
    createdAt: '2026-11-19T15:04:15.192937+00:00',
    actorEmail: 'owner@example.test',
    action: 'publish',
    entityType: 'page',
    entityId: PAGE,
    entityLabel: 'about',
    locale: 'uk',
    revisionId: 'r1',
    details: null,
    ...overrides,
  }
}

describe('describeActivity: pages', () => {
  it('names the page from its path and links to Edit Mode in the locale of the event', () => {
    expect(describeActivity(event({}), lookups())).toEqual({
      title: 'Опубліковано сторінку «About»',
      link: '/admin/edit/about?locale=uk',
    })
  })

  it('says a restored version goes to the draft, not that the page was restored', () => {
    const row = describeActivity(event({ action: 'restore' }), lookups())
    expect(row.title).toBe('Повернуто версію сторінки «About» у чернетку')
    expect(describeActivity(event({ action: 'restore' }), lookups({ t: translate(en) })).title)
      .toBe('Restored a version of “About” to the draft')
  })

  it('opens the publication in History when the event has a revision', () => {
    const revision = '00000000-0000-4000-8000-0000000000d1'
    expect(describeActivity(event({ revisionId: revision }), lookups()).link)
      .toBe(`/admin/edit/about?locale=uk&history=${revision}`)
    expect(describeActivity(event({ action: 'restore', revisionId: revision }), lookups()).link)
      .toBe(`/admin/edit/about?locale=uk&history=${revision}`)
  })

  it('opens only the page without a revision, for force unlock, or for a malformed revision id', () => {
    expect(describeActivity(event({ revisionId: null }), lookups()).link).toBe('/admin/edit/about?locale=uk')
    expect(describeActivity(event({ action: 'force_unlock', locale: null, revisionId: null }), lookups()).link).toBe('/admin/edit/about')
    expect(describeActivity(event({ revisionId: 'x&locale=de' }), lookups()).link).toBe('/admin/edit/about?locale=uk')
  })

  it('has no link when the stored path leads elsewhere in the admin', () => {
    for (const path of ['/../settings', '/%2e%2e/settings', '/x?history=00000000-0000-4000-8000-0000000000d1', '//evil.example']) {
      expect(describeActivity(event({}), lookups({ editPaths: new Map([[PAGE, path]]) })).link).toBeNull()
    }
  })

  it('has no link without a known path or without pages.edit', () => {
    expect(describeActivity(event({ entityId: '00000000-0000-4000-8000-0000000000ff' }), lookups()).link).toBeNull()
    expect(describeActivity(event({}), lookups({ can: (permission: CmsPermission) => permission !== 'pages.edit' })).link).toBeNull()
  })

  it('falls back to the page key when the path is unknown', () => {
    const row = describeActivity(event({ entityId: '00000000-0000-4000-8000-0000000000ff', entityLabel: 'web-design' }), lookups())
    expect(row.title).toBe('Опубліковано сторінку «Web design»')
  })
})

describe('describeActivity: submissions', () => {
  it('links one existing submission to its details', () => {
    expect(describeActivity(event({ entityType: 'submission', action: 'archive', entityId: SUBMISSION, details: { count: 1, form: 'contact' } }), lookups()))
      .toEqual({ title: 'Заявку перенесено в архів', link: `/admin/submissions/${SUBMISSION}` })
  })

  it('has no link to a submission that no longer exists', () => {
    const gone = '00000000-0000-4000-8000-0000000000b2'
    expect(describeActivity(event({ entityType: 'submission', action: 'spam', entityId: gone, details: { count: 1 } }), lookups()).link).toBeNull()
  })

  it('never links a deletion for good', () => {
    expect(describeActivity(event({ entityType: 'submission', action: 'delete', entityId: SUBMISSION, details: { count: 1 } }), lookups()))
      .toEqual({ title: 'Заявку видалено назавжди', link: null })
    expect(describeActivity(event({ entityType: 'submission', action: 'delete', entityId: null, details: { count: 4 } }), lookups()))
      .toEqual({ title: 'Видалено назавжди заявок: 4', link: null })
  })

  it('links a bulk move to the list it went to', () => {
    expect(describeActivity(event({ entityType: 'submission', action: 'archive', entityId: null, details: { count: 12 } }), lookups()))
      .toEqual({ title: 'Перенесено в архів заявок: 12', link: '/admin/submissions?location=archived' })
    expect(describeActivity(event({ entityType: 'submission', action: 'inbox', entityId: null, details: { count: 2 } }), lookups()).link)
      .toBe('/admin/submissions')
  })

  it('has no submission links without forms.view', () => {
    const noForms = lookups({ can: (permission: CmsPermission) => permission !== 'forms.view' })
    expect(describeActivity(event({ entityType: 'submission', action: 'archive', entityId: SUBMISSION, details: { count: 1 } }), noForms).link).toBeNull()
  })
})

describe('describeActivity: settings and the rest', () => {
  it('names maintenance mode on its own', () => {
    const row = describeActivity(event({
      entityType: 'settings', action: 'update', entityId: null,
      details: { changes: [{ field: 'maintenance_mode', from: false, to: true }] },
    }), lookups())
    expect(row).toEqual({ title: 'Увімкнено режим обслуговування', link: '/admin/settings' })
  })

  it('lists the changed fields, and sends logo changes to Brand', () => {
    expect(describeActivity(event({
      entityType: 'settings', action: 'update', entityId: null,
      details: { changes: [{ field: 'site_name' }, { field: 'contact_email' }] },
    }), lookups()).title).toBe('Змінено налаштування: назва сайту, контактний email')
    expect(describeActivity(event({
      entityType: 'settings', action: 'update', entityId: null, details: { changes: [{ field: 'logo' }] },
    }), lookups()).link).toBe('/admin/settings/brand')
  })

  it('ignores unknown settings fields', () => {
    expect(describeActivity(event({
      entityType: 'settings', action: 'update', entityId: null, details: { changes: [{ field: 'secret_token' }] },
    }), lookups()).title).toBe('Змінено налаштування')
  })

  it('describes media, languages and forms', () => {
    expect(describeActivity(event({ entityType: 'media', action: 'upload', entityLabel: 'hero.jpg' }), lookups()))
      .toEqual({ title: 'Завантажено файл «hero.jpg»', link: '/admin/media' })
    expect(describeActivity(event({ entityType: 'media', action: 'delete', entityLabel: 'hero.jpg' }), lookups()).link).toBeNull()
    expect(describeActivity(event({ entityType: 'language', action: 'hide', entityId: 'de', entityLabel: 'German' }), lookups()).title)
      .toBe('Мову «German» приховано на сайті')
    expect(describeActivity(event({ entityType: 'form', action: 'disable', entityId: 'contact', entityLabel: 'contact' }), lookups()))
      .toEqual({ title: 'Призупинено прийом заявок: «Контакти»', link: '/admin/submissions/forms' })
  })

  it('shows an unknown event as plain text without a link', () => {
    expect(describeActivity(event({ entityType: 'product', action: 'archive', entityLabel: 'Chair' }), lookups()))
      .toEqual({ title: 'Дія «archive»: Chair', link: null })
  })
})

describe('activityLookupIds', () => {
  it('collects page ids, and submissions only where a link is possible', () => {
    expect(activityLookupIds([
      event({}),
      event({ entityType: 'submission', action: 'archive', entityId: SUBMISSION }),
      event({ entityType: 'submission', action: 'delete', entityId: '00000000-0000-4000-8000-0000000000b3' }),
      event({ entityType: 'media', entityId: '00000000-0000-4000-8000-0000000000c1' }),
    ])).toEqual({ pages: [PAGE], submissions: [SUBMISSION] })
  })
})

describe('groupByDay', () => {
  const labels = { today: 'Сьогодні', yesterday: 'Вчора', date: (date: Date) => `${date.getDate()}.${date.getMonth() + 1}` }

  it('groups by the local calendar day: today, yesterday, then dates', () => {
    const now = new Date(2026, 10, 19, 12, 0)
    const at = (day: number, hour: number) => ({ createdAt: new Date(2026, 10, day, hour, 30).toISOString() })

    const days = groupByDay([at(19, 11), at(19, 9), at(18, 23), at(17, 8)], now, labels)

    expect(days.map(day => [day.label, day.items.length])).toEqual([['Сьогодні', 2], ['Вчора', 1], ['17.11', 1]])
  })

  it('groups by the UTC day for the server render, whatever the local zone', () => {
    // 23:30 UTC on the 19th: the 20th already in Kyiv, still the 19th in UTC.
    const items = [{ createdAt: '2026-11-19T23:30:00.000001+00:00' }]
    const now = new Date('2026-11-20T10:00:00Z')

    expect(groupByDay(items, now, labels, { utc: true })[0]!.label).toBe('Вчора')
    expect(groupByDay([{ createdAt: '2026-11-20T00:10:00+00:00' }], now, labels, { utc: true })[0]!.label).toBe('Сьогодні')
  })

  it('handles the start of a month for yesterday', () => {
    const days = groupByDay([{ createdAt: new Date(2026, 10, 30, 22).toISOString() }], new Date(2026, 11, 1, 8), labels)
    expect(days[0]!.label).toBe('Вчора')
  })
})
