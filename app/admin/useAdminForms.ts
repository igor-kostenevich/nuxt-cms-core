import { cmsConfig } from '#cms/config'
import { cmsForms } from '#cms/forms'
import { cmsTexts } from '#cms/texts'
import { computed, type Ref } from 'vue'
import { refreshNuxtData, useAsyncData, useRequestEvent } from '#imports'
import { createFormsRepository, type CmsSubmissionFilters } from '../data/repositories/forms.repository'
import { createSiteTextsRepository } from '../data/repositories/site-texts.repository'
import type { CmsForm, CmsFormSubmission, CmsSubmissionLocation } from '../types/forms'
import type { TextLookup } from './forms-view'

/**
 * Submissions and forms in the admin (011). Forms come from the code
 * (`#cms/forms`); the database holds the submissions and which forms the
 * owner turned off. Owner and admin only: RLS returns nothing to others,
 * and the queries below take `enabled` (`can('forms.view')`), so for other
 * roles they make no request at all, on the server either.
 */

const UNREAD_KEY = 'cms:admin-forms:unread'
const codeTexts = new Map(cmsTexts.map(text => [text.key, text.text]))

function repository() {
  return createFormsRepository(import.meta.server ? useRequestEvent() : undefined)
}

/** Forms declared in the code, by key. */
export const adminForms = new Map<string, CmsForm>(cmsForms.map(form => [form.key, form]))

/**
 * Site texts in the language of the original (labels, option names, the name
 * of a form): stored values first, then the texts from `cms.texts.ts`.
 */
export function useAdminFormTexts() {
  const siteTexts = createSiteTextsRepository(undefined, { bootstrapLocale: cmsConfig.defaultLocale })
  const query = useAsyncData('cms:admin-forms:texts', () => siteTexts.getForLocale(null), {
    default: () => ({}) as Record<string, string>,
  })

  const text: TextLookup = key => query.data.value?.[key] ?? codeTexts.get(key)

  return { text, ready: Promise.resolve(query).then(() => undefined) }
}

/** The number in the admin menu; refreshed after every change of a submission. */
export function useAdminUnreadSubmissions(enabled: Ref<boolean>) {
  const query = useAsyncData(UNREAD_KEY, () => (enabled.value ? repository().unreadCount() : Promise.resolve(0)), {
    default: () => 0,
    watch: [enabled],
  })

  return { unread: query.data }
}

function refreshUnread() {
  return refreshNuxtData(UNREAD_KEY)
}

/** Forms: from the code, with their numbers and whether they are on; plus forms gone from the code that left submissions. */
export function useAdminFormsOverview(enabled: Ref<boolean>) {
  const forms = repository()
  const statsQuery = useAsyncData('cms:admin-forms:stats', async () => (enabled.value ? forms.stats() : []), { default: () => [] })
  const disabledQuery = useAsyncData('cms:admin-forms:disabled', async () => (enabled.value ? forms.disabledForms() : []), { default: () => [] })

  const overview = computed(() => {
    const stats = new Map(statsQuery.data.value.map(item => [item.formKey, item]))
    const disabled = new Set(disabledQuery.data.value)
    const keys = [...adminForms.keys(), ...[...stats.keys()].filter(key => !adminForms.has(key)).sort()]

    return keys.map(key => ({
      key,
      form: adminForms.get(key),
      enabled: !disabled.has(key),
      stats: stats.get(key) ?? { formKey: key, total: 0, unread: 0, lastAt: null, sources: [] },
    }))
  })

  async function setEnabled(key: string, enabled: boolean) {
    await forms.setEnabled(key, enabled)
    await disabledQuery.refresh()
  }

  return {
    overview,
    error: computed(() => statsQuery.error.value ?? disabledQuery.error.value),
    ready: Promise.all([statsQuery, disabledQuery]).then(() => undefined),
    setEnabled,
  }
}

export const SUBMISSIONS_PAGE_SIZE = 25

/** One page of the inbox for the filters; actions reload it and the unread number. */
export function useAdminSubmissionList(filters: Ref<CmsSubmissionFilters>, page: Ref<number>, enabled: Ref<boolean>) {
  const forms = repository()
  const query = useAsyncData(
    () => `cms:admin-forms:list:${JSON.stringify(filters.value)}:${page.value}`,
    async () => enabled.value
      ? forms.list(filters.value, { offset: (page.value - 1) * SUBMISSIONS_PAGE_SIZE, limit: SUBMISSIONS_PAGE_SIZE })
      : { items: [] as CmsFormSubmission[], total: 0 },
    { default: () => ({ items: [] as CmsFormSubmission[], total: 0 }) },
  )

  async function after(change: Promise<void>) {
    await change
    await Promise.all([query.refresh(), refreshUnread()])
  }

  return {
    items: computed(() => query.data.value.items),
    total: computed(() => query.data.value.total),
    pending: query.pending,
    error: query.error,
    ready: Promise.resolve(query).then(() => undefined),
    refresh: query.refresh,
    setLocation: (ids: string[], location: CmsSubmissionLocation) => after(forms.setLocation(ids, location)),
    setRead: (ids: string[], read: boolean) => after(forms.setRead(ids, read)),
    markAllRead: (formKey?: string | null) => after(forms.markAllRead(formKey)),
    remove: (ids: string[]) => after(forms.remove(ids)),
    exportAll: () => forms.listAll(filters.value),
  }
}

/** One submission with its neighbours in the list it was opened from. */
export function useAdminSubmission(id: Ref<string>, from: Ref<Pick<CmsSubmissionFilters, 'location' | 'formKey'>>, enabled: Ref<boolean>) {
  const forms = repository()
  const query = useAsyncData(
    () => `cms:admin-forms:submission:${id.value}:${JSON.stringify(from.value)}`,
    async () => {
      const submission = enabled.value ? await forms.get(id.value) : null
      const neighbours = submission ? await forms.neighbours(submission, from.value) : { newer: null, older: null }
      return { submission, neighbours }
    },
    { default: () => ({ submission: null as CmsFormSubmission | null, neighbours: { newer: null as string | null, older: null as string | null } }) },
  )

  async function after(change: Promise<void>) {
    await change
    await Promise.all([query.refresh(), refreshUnread()])
  }

  return {
    submission: computed(() => query.data.value.submission),
    neighbours: computed(() => query.data.value.neighbours),
    error: query.error,
    ready: Promise.resolve(query).then(() => undefined),
    setLocation: (location: CmsSubmissionLocation) => after(forms.setLocation([id.value], location)),
    setRead: (read: boolean) => after(forms.setRead([id.value], read)),
    remove: async () => {
      await forms.remove([id.value])
      await refreshUnread()
    },
  }
}
