import { UUID_PATTERN as UUID } from '../data/ids'
import type { CmsActivityEvent } from '../types/activity'
import type { CmsPermission } from '../types/auth'
import { editorUrl } from './edit-path'
import { humanize, pageName } from './forms-view'

/**
 * How the admin shows Activity events (012): pure functions over an event and
 * what the screen looked up for it. Event values (names, emails) are snapshots
 * from the database: they are returned as plain strings for text interpolation.
 * Links are built only from fixed admin routes and checked ids, and only to
 * objects that still exist and the viewer may open.
 */

export type Translate = (key: string, params?: Record<string, string | number>) => string

export interface ActivityLookups {
  t: Translate
  can: (permission: CmsPermission) => boolean
  /** Page id → the path it was last opened at in Edit Mode (null: never). */
  editPaths: ReadonlyMap<string, string | null>
  /** Submissions that still exist. */
  existingSubmissions: ReadonlySet<string>
  /** Active language codes: the prefix dropped from a page path. */
  languageCodes: readonly string[]
  /** The name of a form, from the site texts. */
  formName: (key: string) => string
}

export interface ActivityRow {
  title: string
  link: string | null
}

const SETTINGS_FIELDS = ['site_name', 'contact_email', 'contact_phone', 'logo', 'favicon', 'maintenance_mode'] as const

interface SettingsChange {
  field: string
  to?: unknown
}

function settingsChanges(event: CmsActivityEvent): SettingsChange[] {
  const changes = event.details?.changes
  return Array.isArray(changes)
    ? changes.filter((change): change is SettingsChange =>
        typeof change === 'object' && change !== null && typeof (change as SettingsChange).field === 'string')
    : []
}

function count(event: CmsActivityEvent): number {
  const value = event.details?.count
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 1
}

function pageTitle(event: CmsActivityEvent, lookups: ActivityLookups): string {
  const path = event.entityId ? lookups.editPaths.get(event.entityId) ?? null : null
  return pageName(path, lookups.languageCodes, lookups.t('cms.activity.homePage'))
    || (event.entityLabel ? humanize(event.entityLabel) : lookups.t('cms.activity.unknownPage'))
}

function pageLink(event: CmsActivityEvent, lookups: ActivityLookups): string | null {
  const path = event.entityId ? lookups.editPaths.get(event.entityId) : null

  if (!path || !lookups.can('pages.edit')) {
    return null
  }

  const params = new URLSearchParams()

  if (event.locale) {
    params.set('locale', event.locale)
  }

  // A publication or a restored version opens in History; without a revision
  // (deleted with its language) only the page opens.
  if (event.revisionId && UUID.test(event.revisionId) && (event.action === 'publish' || event.action === 'restore')) {
    params.set('history', event.revisionId)
  }

  // The path is written by anyone with pages.edit: an unsafe one gives no link.
  return editorUrl(path, params)
}

function settingsRow(event: CmsActivityEvent, lookups: ActivityLookups): ActivityRow {
  const { t } = lookups
  const changes = settingsChanges(event)
  const link = lookups.can('settings.update')
    ? (changes.length > 0 && changes.every(change => change.field === 'logo' || change.field === 'favicon')
        ? '/admin/settings/brand'
        : '/admin/settings')
    : null

  const [only] = changes

  if (changes.length === 1 && only?.field === 'maintenance_mode' && typeof only.to === 'boolean') {
    return { title: t(only.to ? 'cms.activity.events.maintenanceOn' : 'cms.activity.events.maintenanceOff'), link }
  }

  const fields = changes
    .map(change => change.field)
    .filter((field): field is typeof SETTINGS_FIELDS[number] => (SETTINGS_FIELDS as readonly string[]).includes(field))
    .map(field => t(`cms.activity.fields.${field}`))

  return {
    title: fields.length > 0
      ? t('cms.activity.events.settingsUpdate', { fields: fields.join(', ') })
      : t('cms.activity.events.settingsUpdateAny'),
    link,
  }
}

const SUBMISSION_LOCATIONS: Record<string, string | null> = { archive: 'archived', spam: 'spam', inbox: null }

function submissionRow(event: CmsActivityEvent, lookups: ActivityLookups): ActivityRow {
  const many = count(event)
  const key = `cms.activity.events.submission.${event.action}${many > 1 ? 'Many' : 'One'}`
  const known = event.action in SUBMISSION_LOCATIONS || event.action === 'delete'
  const title = known
    ? lookups.t(key, { count: many })
    : lookups.t('cms.activity.events.unknown', { action: event.action, name: lookups.t('cms.activity.submission') })

  // Deleted for good: nothing to open.
  if (!known || event.action === 'delete' || !lookups.can('forms.view')) {
    return { title, link: null }
  }

  if (many === 1 && event.entityId && UUID.test(event.entityId)) {
    return { title, link: lookups.existingSubmissions.has(event.entityId) ? `/admin/submissions/${event.entityId}` : null }
  }

  const location = SUBMISSION_LOCATIONS[event.action]
  return { title, link: location ? `/admin/submissions?location=${location}` : '/admin/submissions' }
}

/** The sentence of an event and where it leads. */
export function describeActivity(event: CmsActivityEvent, lookups: ActivityLookups): ActivityRow {
  const { t } = lookups
  const label = event.entityLabel ?? ''

  switch (event.entityType) {
    case 'page': {
      const name = pageTitle(event, lookups)
      const known = ['publish', 'restore', 'force_unlock'].includes(event.action)
      return {
        title: known
          ? t(`cms.activity.events.page.${event.action}`, { name })
          : t('cms.activity.events.unknown', { action: event.action, name }),
        link: pageLink(event, lookups),
      }
    }
    case 'media': {
      const known = ['upload', 'replace', 'delete'].includes(event.action)
      return {
        title: known
          ? t(`cms.activity.events.media.${event.action}`, { name: label })
          : t('cms.activity.events.unknown', { action: event.action, name: label }),
        link: event.action === 'delete' ? null : '/admin/media',
      }
    }
    case 'language': {
      const known = ['add', 'delete', 'show', 'hide'].includes(event.action)
      return {
        title: known
          ? t(`cms.activity.events.language.${event.action}`, { name: label })
          : t('cms.activity.events.unknown', { action: event.action, name: label }),
        link: '/admin/settings/languages',
      }
    }
    case 'form': {
      const name = event.entityId ? lookups.formName(event.entityId) : label
      const known = ['enable', 'disable'].includes(event.action)
      return {
        title: known
          ? t(`cms.activity.events.form.${event.action}`, { name })
          : t('cms.activity.events.unknown', { action: event.action, name }),
        link: lookups.can('forms.view') ? '/admin/submissions/forms' : null,
      }
    }
    case 'settings':
      return settingsRow(event, lookups)
    case 'submission':
      return submissionRow(event, lookups)
    default:
      return { title: t('cms.activity.events.unknown', { action: event.action, name: label || event.entityType }), link: null }
  }
}

/** The form of a submission event, when all its submissions were of one form. */
export function submissionForm(event: CmsActivityEvent): string | null {
  const form = event.details?.form
  return event.entityType === 'submission' && typeof form === 'string' ? form : null
}

/** Ids the screen looks up for a batch of events: pages for paths, submissions for existence. */
export function activityLookupIds(events: readonly CmsActivityEvent[]) {
  const pages = new Set<string>()
  const submissions = new Set<string>()

  for (const event of events) {
    if (event.entityType === 'page' && event.entityId && UUID.test(event.entityId)) {
      pages.add(event.entityId)
    } else if (event.entityType === 'submission' && event.action !== 'delete' && event.entityId && UUID.test(event.entityId)) {
      submissions.add(event.entityId)
    }
  }

  return { pages: [...pages], submissions: [...submissions] }
}

export interface ActivityDay<T> {
  /** Local calendar date, YYYY-MM-DD. */
  key: string
  label: string
  items: T[]
}

function calendarDay(date: Date, utc: boolean): string {
  const year = utc ? date.getUTCFullYear() : date.getFullYear()
  const month = String((utc ? date.getUTCMonth() : date.getMonth()) + 1).padStart(2, '0')
  const day = String(utc ? date.getUTCDate() : date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Events grouped by calendar day, in the given order: "Today", "Yesterday",
 * then the date. The day is the viewer's local one, or UTC with `utc` — for the
 * server render and hydration, which must agree whatever the time zones of the
 * server and the browser. The time comes from the database string; Date is
 * used only to place it in a day, never as a cursor.
 */
export function groupByDay<T extends { createdAt: string }>(
  items: readonly T[],
  now: Date,
  labels: { today: string, yesterday: string, date: (date: Date) => string },
  options: { utc?: boolean } = {},
): ActivityDay<T>[] {
  const utc = options.utc ?? false
  const today = calendarDay(now, utc)
  // A day before at noon of today: no daylight-saving edge can skip a day.
  const yesterdayDate = new Date(now)
  if (utc) {
    yesterdayDate.setUTCHours(12, 0, 0, 0)
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1)
  } else {
    yesterdayDate.setHours(12, 0, 0, 0)
    yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  }
  const yesterday = calendarDay(yesterdayDate, utc)
  const days: ActivityDay<T>[] = []

  for (const item of items) {
    const date = new Date(item.createdAt)
    const key = calendarDay(date, utc)
    let day = days.at(-1)

    if (day?.key !== key) {
      day = {
        key,
        label: key === today ? labels.today : key === yesterday ? labels.yesterday : labels.date(date),
        items: [],
      }
      days.push(day)
    }

    day.items.push(item)
  }

  return days
}
