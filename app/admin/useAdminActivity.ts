import { cmsConfig } from '#cms/config'
import { computed, ref, watch, type Ref } from 'vue'
import { useAsyncData, useRequestEvent } from '#imports'
import { createActivityRepository } from '../data/repositories/activity.repository'
import { createFormsRepository } from '../data/repositories/forms.repository'
import { createPagesRepository } from '../data/repositories/pages.repository'
import type { CmsActivityCategory, CmsActivityCursor, CmsActivityEvent } from '../types/activity'
import { activityLookupIds } from './activity-view'

/**
 * The Activity log in the admin (012). The first page is read with
 * useAsyncData (SSR, C-05); "Show more" appends older pages on the client.
 * Owner and admin only: RLS returns nothing to others, and without
 * `activity.view` no request is made at all.
 */

export const ACTIVITY_PAGE_SIZE = 30

interface ActivityBatch {
  items: CmsActivityEvent[]
  next: CmsActivityCursor | null
  /** Serializable for the SSR payload: [page id, edit path]. */
  editPaths: [string, string | null][]
  existingSubmissions: string[]
}

const EMPTY: ActivityBatch = { items: [], next: null, editPaths: [], existingSubmissions: [] }

export function useAdminActivity(category: Ref<CmsActivityCategory>, enabled: Ref<boolean>) {
  const request = import.meta.server ? useRequestEvent() : undefined
  const activity = createActivityRepository(request)
  const pages = createPagesRepository(request, { bootstrapLocale: cmsConfig.defaultLocale })
  const forms = createFormsRepository(request)

  async function load(before: CmsActivityCursor | null): Promise<ActivityBatch> {
    const { items, next } = await activity.list({ category: category.value, before, limit: ACTIVITY_PAGE_SIZE })
    const ids = activityLookupIds(items)
    const [paths, existing] = await Promise.all([pages.editPaths(ids.pages), forms.existing(ids.submissions)])
    return { items, next, editPaths: [...paths], existingSubmissions: [...existing] }
  }

  const first = useAsyncData(
    () => `cms:admin-activity:${category.value}`,
    () => (enabled.value ? load(null) : Promise.resolve(EMPTY)),
    { default: () => EMPTY },
  )

  const more = ref<ActivityBatch[]>([])
  const loadingMore = ref(false)
  const moreError = ref<unknown>(null)

  watch(category, () => {
    more.value = []
    moreError.value = null
  })

  const batches = computed(() => [first.data.value, ...more.value])
  const next = computed(() => batches.value.at(-1)?.next ?? null)

  async function loadMore() {
    const cursor = next.value

    if (!cursor || loadingMore.value) {
      return
    }

    loadingMore.value = true
    moreError.value = null
    const forCategory = category.value

    try {
      const batch = await load(cursor)

      // The category changed while loading: the batch belongs to the old list.
      if (forCategory === category.value) {
        more.value = [...more.value, batch]
      }
    } catch (cause) {
      moreError.value = cause
    } finally {
      loadingMore.value = false
    }
  }

  return {
    items: computed(() => batches.value.flatMap(batch => batch.items)),
    editPaths: computed(() => new Map(batches.value.flatMap(batch => batch.editPaths))),
    existingSubmissions: computed(() => new Set(batches.value.flatMap(batch => batch.existingSubmissions))),
    hasMore: computed(() => next.value !== null),
    pending: first.pending,
    error: first.error,
    loadingMore,
    moreError,
    loadMore,
    ready: Promise.resolve(first).then(() => undefined),
  }
}
