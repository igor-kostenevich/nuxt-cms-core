import { computed, onMounted, ref, shallowRef, watch, type Ref } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { cmsConfig } from '#cms/config'
import { createEntriesRepository } from '../data/repositories/entries.repository'
import { CmsDataError } from '../data/errors'
import type { CmsContentOrder } from '../../src/content'
import type { CmsEntryList, CmsEntryListItem, CmsEntrySort, CmsEntryStatus } from '../types/entries'
import { adminErrorKey } from './error-key'
import { reorderInPlace, serverStatuses } from './entries-order'
import { useAdminToast } from './useAdminToast'

type Translate = (key: string, params?: Record<string, string | number>) => string

/** Manual order shows the whole list (014 §8.1): reorder saves every live entry. */
export const MANUAL_LIMIT = 500

/**
 * Filters of the list by status, in the order the select offers them. There is
 * no «off the site»: those are drafts, and the «Draft» filter lists them too.
 */
export const ENTRY_STATUS_FILTERS: readonly Exclude<CmsEntryStatus, 'archived'>[] = ['published', 'changed', 'draft']

/** How a list can be sorted: by the order of the site (manual types), last changed, title. */
export type AdminEntrySort = 'manual' | 'updated' | 'title'

/**
 * The admin list of one entry type (014 §8), shared by Pages and Content: one
 * list of every entry (taken off the site too) with search, a status filter
 * (several statuses at once), pages of the list (or the whole list in the order of the site),
 * Archive / Unarchive with undo, and saving a manual order. The state is in
 * the URL (`q`, `status`, `sort`, `page`), like Submissions.
 */
export function useAdminEntries(options: {
  type: Ref<string | null>
  /** The declared order. `manual` lists every live entry in their order and can be reordered. */
  order: Ref<CmsContentOrder | null>
  pageSize: number
  t: Translate
}) {
  const route = useRoute()
  const router = useRouter()
  const toasts = useAdminToast()
  const repository = createEntriesRepository(undefined, { bootstrapLocale: cmsConfig.defaultLocale })

  function queryText(name: string): string {
    const value = route.query[name]
    return typeof value === 'string' ? value : ''
  }

  const search = computed(() => queryText('q'))
  const page = computed(() => Math.max(1, Number.parseInt(queryText('page'), 10) || 1))
  /** Statuses the list is filtered by (`?status=draft,changed`); empty: every status. */
  const statuses = computed<CmsEntryStatus[]>(() => ENTRY_STATUS_FILTERS
    .filter(value => queryText('status').split(',').includes(value)))

  function setStatuses(values: readonly string[]) {
    setQuery({ status: ENTRY_STATUS_FILTERS.filter(value => values.includes(value)).join(',') || null })
  }

  /** Changes the URL; any change but the page itself starts at page 1. */
  function setQuery(changes: Record<string, string | null>) {
    const query: Record<string, string> = {}

    for (const [key, value] of Object.entries({ ...route.query, ...changes })) {
      if (typeof value === 'string' && value && !(key === 'page' && !('page' in changes))) {
        query[key] = value
      }
    }

    void router.replace({ query })
  }

  const searchInput = ref(search.value)
  watchDebounced(searchInput, (value) => {
    if (value.trim() !== search.value) {
      setQuery({ q: value.trim() || null })
    }
  }, { debounce: 300 })

  /** A type in manual order: the site shows its entries in the order set here. */
  const manual = computed(() => options.order.value === 'manual')
  const sortOptions = computed<AdminEntrySort[]>(() => (manual.value ? ['manual', 'updated', 'title'] : ['updated', 'title']))
  // The lists offer no sort control (the declared order is the one that
  // matters); `?sort=` still works for a link.
  /** The declared order by default (014 §6): the order of the site, by title, else last changed. */
  const defaultSort = computed<AdminEntrySort>(() => (manual.value ? 'manual' : options.order.value === 'title' ? 'title' : 'updated'))
  const sort = computed<AdminEntrySort>(() => {
    const value = queryText('sort') as AdminEntrySort
    return sortOptions.value.includes(value) ? value : defaultSort.value
  })
  /** The whole list in the order of the site: dragging can change it. Not while filtered. */
  const wholeList = computed(() => sort.value === 'manual')
  const reorderable = computed(() => wholeList.value && !search.value && statuses.value.length === 0)
  const pageSize = computed(() => (wholeList.value ? MANUAL_LIMIT : options.pageSize))

  const list = shallowRef<CmsEntryList>({ items: [], total: 0, orderVersion: null })
  const loading = ref(true)
  const failure = shallowRef<unknown>(null)

  async function load() {
    const type = options.type.value

    if (!type) {
      loading.value = false
      return
    }

    loading.value = true
    failure.value = null

    try {
      // Every entry, taken off the site too: in its place in the order of the site (C-112).
      const order: CmsEntrySort = sort.value
      list.value = await repository.list(type, {
        search: search.value,
        archived: null,
        statuses: serverStatuses(statuses.value),
        sort: order,
        limit: pageSize.value,
        offset: wholeList.value ? 0 : (page.value - 1) * pageSize.value,
      })

      if (import.meta.dev && wholeList.value && list.value.total > MANUAL_LIMIT) {
        console.warn(`[cms] Type "${type}" has ${list.value.total} entries; manual order shows the first ${MANUAL_LIMIT}.`)
      }
    } catch (cause) {
      failure.value = cause
    } finally {
      loading.value = false
    }
  }

  // The statuses by value: a new array of the same statuses is no change.
  watch([options.type, search, () => statuses.value.join(','), sort, page], () => void load())

  // The first read waits for the browser: the server renders the admin without a
  // session, and a read there would put an error into the HTML that shows
  // until the page is hydrated.
  onMounted(() => void load())

  const pages = computed(() => (wholeList.value ? 1 : Math.max(1, Math.ceil(list.value.total / pageSize.value))))
  const shownFrom = computed(() => (list.value.total === 0 ? 0 : (page.value - 1) * pageSize.value + 1))
  const shownTo = computed(() => Math.min(list.value.total, page.value * pageSize.value))

  function fail(cause: unknown) {
    toasts.toast(options.t(adminErrorKey(cause)), { tone: 'error' })
  }

  function titleOf(entry: CmsEntryListItem) {
    return entry.title ?? options.t('cms.pages.type.untitled')
  }

  /** Takes an entry off the site from the list; the toast puts it back (Undo). */
  async function takeOff(entry: CmsEntryListItem) {
    const type = options.type.value

    if (!type) {
      return
    }

    try {
      await repository.archive(type, entry.id)
      await load()
      toasts.toast(options.t('cms.pages.type.archived', { title: titleOf(entry) }), {
        tone: 'success',
        action: {
          label: options.t('cms.pages.type.undo'),
          run: () => void repository.unarchive(type, entry.id).then(load).catch(fail),
        },
      })
    } catch (cause) {
      fail(cause)
    }
  }


  /**
   * Saves a new manual order at once (014 §8.1), shown before the answer. A
   * conflict (someone changed the list meanwhile) reloads it and says so.
   */
  async function reorder(ids: string[]) {
    const type = options.type.value
    const version = list.value.orderVersion

    if (!type || !version) {
      return
    }

    const before = list.value
    // The live ones in their new order, in the places live ones had; the entries off the site keep theirs.
    list.value = { ...before, items: reorderInPlace(before.items, ids) }

    try {
      const next = await repository.reorder(type, ids, version)
      list.value = { ...list.value, orderVersion: next }
    } catch (cause) {
      if (cause instanceof CmsDataError && cause.code === 'conflict') {
        toasts.toast(options.t('cms.content.listChanged'), { tone: 'error' })
      } else {
        fail(cause)
      }

      await load()
    }
  }

  return {
    statuses,
    setStatuses,
    sort,
    wholeList,
    search,
    searchInput,
    page,
    pages,
    shownFrom,
    shownTo,
    setQuery,
    list,
    loading,
    failure,
    load,
    manual,
    reorderable,
    pageSize,
    titleOf,
    takeOff,
    reorder,
  }
}

/**
 * The Create dialog of Pages (014 §4.1): whether an address is free in the
 * language of the original, and the create itself, without a lock (Edit Mode
 * takes it). `id` is chosen per opening of the dialog: a retry is the same entry.
 */
export function useAdminEntryCreate() {
  const repository = createEntriesRepository(undefined, { bootstrapLocale: cmsConfig.defaultLocale })

  return {
    checkSlug: (type: string, slug: string) => repository.checkSlug(type, null, cmsConfig.defaultLocale, slug),
    create: (type: string, content: { title: string, slug: string }, id: string) =>
      repository.create(type, content, { id, takeLock: false }),
  }
}

