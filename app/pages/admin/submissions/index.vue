<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { adminErrorKey } from '../../../admin/error-key'
import { formName, pageName, submissionPreview, submissionsCsv } from '../../../admin/forms-view'
import {
  adminForms,
  SUBMISSIONS_PAGE_SIZE,
  useAdminFormTexts,
  useAdminSubmissionList,
} from '../../../admin/useAdminForms'
import { useAdminI18n } from '../../../admin/useAdminI18n'
import { useAdminToast } from '../../../admin/useAdminToast'
import type { AdminMenuItem } from '../../../components/admin/AdminMenu.vue'
import type { CmsSubmissionFilters } from '../../../data/repositories/forms.repository'
import type { CmsFormSubmission, CmsSubmissionLocation } from '../../../types/forms'

definePageMeta({
  layout: false,
  middleware: ['cms-auth'],
})

// Submissions (011): one inbox for every form, newest first. With one form it
// is a plain list of messages; the form filter appears when there are more.
// The state is in the URL, so "back" from a submission returns to the same list.
const { t, locale: adminLocale } = useAdminI18n()
const { can } = usePermissions()
const toasts = useAdminToast()
const route = useRoute()

const canView = computed(() => can('forms.view'))
const canManage = computed(() => can('forms.manage'))

const LOCATIONS: CmsSubmissionLocation[] = ['inbox', 'archived', 'spam']

function queryText(name: string): string {
  const value = route.query[name]
  return typeof value === 'string' ? value : ''
}

const location = computed<CmsSubmissionLocation>(() => {
  const value = queryText('location') as CmsSubmissionLocation
  return LOCATIONS.includes(value) ? value : 'inbox'
})
const formKey = computed(() => queryText('form') || null)
const unreadOnly = computed(() => queryText('unread') === '1')
const search = computed(() => queryText('q'))
const page = computed(() => Math.max(1, Number.parseInt(queryText('page'), 10) || 1))

const filters = computed<CmsSubmissionFilters>(() => ({
  location: location.value,
  formKey: formKey.value,
  unreadOnly: unreadOnly.value,
  search: search.value,
}))

/** Changes the URL; any change but the page itself starts at page 1. */
function setQuery(changes: Record<string, string | null>) {
  const query: Record<string, string> = {}

  for (const [key, value] of Object.entries({ ...route.query, ...changes })) {
    if (typeof value === 'string' && value !== '' && (key !== 'page' || 'page' in changes)) {
      query[key] = value
    }
  }

  return navigateTo({ query }, { replace: true })
}

const { text, ready: textsReady } = useAdminFormTexts()
const list = useAdminSubmissionList(filters, page, canView)
const { languages, ready: languagesReady } = useCmsLanguages()

await Promise.all([textsReady, languagesReady, canView.value ? list.ready : Promise.resolve()])

const languageCodes = computed(() => languages.value.map(language => language.code))

const formsCount = adminForms.size
const formOptions = computed(() => [
  { value: '', label: t('cms.submissions.allForms') },
  ...[...adminForms.keys()].map(key => ({ value: key, label: formName(key, text) })),
])
const formFilter = computed({
  get: () => formKey.value ?? '',
  set: value => setQuery({ form: value || null }),
})

// ── Search ─────────────────────────────────────────────────────────────

const searchInput = ref(search.value)
const applySearch = useDebounceFn((value: string) => setQuery({ q: value.trim() || null }), 300)

watch(searchInput, value => applySearch(value))
watch(search, (value) => {
  if (value !== searchInput.value.trim()) {
    searchInput.value = value
  }
})

// ── Rows ───────────────────────────────────────────────────────────────

const dateFormat = computed(() => new Intl.DateTimeFormat(adminLocale.value, { day: 'numeric', month: 'short' }))
const timeFormat = computed(() => new Intl.DateTimeFormat(adminLocale.value, { hour: '2-digit', minute: '2-digit' }))

function when(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  return date.toDateString() === today.toDateString() ? timeFormat.value.format(date) : dateFormat.value.format(date)
}

const rows = computed(() => list.items.value.map((submission) => {
  const preview = submissionPreview(submission, adminForms.get(submission.formKey))
  return {
    submission,
    title: preview.title || t('cms.submissions.noName'),
    excerpt: preview.excerpt,
    unread: submission.readAt === null,
    meta: [
      formsCount > 1 || !adminForms.has(submission.formKey) ? formName(submission.formKey, text) : null,
      pageName(submission.pagePath, languageCodes.value, t('cms.submissions.homePage')),
    ]
      .filter(Boolean)
      .join(' · '),
  }
}))

function detailLink(submission: CmsFormSubmission) {
  const query: Record<string, string> = {}

  if (location.value !== 'inbox') {
    query.location = location.value
  }

  if (formKey.value) {
    query.form = formKey.value
  }

  return { path: `/admin/submissions/${submission.id}`, query }
}

// ── Selection and actions ──────────────────────────────────────────────

const selecting = ref(false)
const selected = ref<string[]>([])

watch(filters, () => {
  selected.value = []
})

function stopSelecting() {
  selecting.value = false
  selected.value = []
}

function fail(cause: unknown) {
  toasts.toast(t(adminErrorKey(cause)), { tone: 'error' })
}

async function move(ids: string[], to: CmsSubmissionLocation) {
  const from = location.value

  try {
    await list.setLocation(ids, to)
    stopSelecting()
    const message = to === 'archived' ? 'cms.submissions.archived' : to === 'spam' ? 'cms.submissions.movedToSpam' : 'cms.submissions.movedToInbox'
    toasts.toast(t(message, { count: ids.length }), {
      action: { label: t('cms.submissions.undo'), run: () => void list.setLocation(ids, from).catch(fail) },
    })
  } catch (cause) {
    fail(cause)
  }
}

async function markRead(ids: string[], read: boolean) {
  try {
    await list.setRead(ids, read)
    stopSelecting()
  } catch (cause) {
    fail(cause)
  }
}

const exporting = ref(false)

async function exportCsv() {
  exporting.value = true

  try {
    const submissions = await list.exportAll()

    if (submissions.length === 0) {
      toasts.toast(t('cms.submissions.nothingToExport'))
      return
    }

    const form = formKey.value ? adminForms.get(formKey.value) ?? null : (formsCount === 1 ? [...adminForms.values()][0]! : null)
    const csv = submissionsCsv(submissions, adminForms, form, text, {
      date: t('cms.submissions.csv.date'),
      form: t('cms.submissions.csv.form'),
      status: t('cms.submissions.csv.status'),
      read: t('cms.submissions.csv.read'),
      page: t('cms.submissions.csv.page'),
      language: t('cms.submissions.csv.language'),
      fields: t('cms.submissions.csv.fields'),
      locations: {
        inbox: t('cms.submissions.tabs.inbox'),
        archived: t('cms.submissions.tabs.archived'),
        spam: t('cms.submissions.tabs.spam'),
      },
      words: { yes: t('cms.submissions.yes'), no: t('cms.submissions.no') },
    })
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `submissions-${formKey.value ?? 'all'}-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toasts.toast(t('cms.submissions.exported', { count: submissions.length }), { tone: 'success' })
  } catch (cause) {
    fail(cause)
  } finally {
    exporting.value = false
  }
}

const menuItems = computed<AdminMenuItem[]>(() => [
  ...(canManage.value ? [{ key: 'select', label: t('cms.submissions.select'), icon: 'lucide:list-checks' }] : []),
  ...(canManage.value && location.value === 'inbox' ? [{ key: 'read', label: t('cms.submissions.markAllRead'), icon: 'lucide:check-check' }] : []),
  { key: 'export', label: t('cms.submissions.exportCsv'), icon: 'lucide:download', disabled: exporting.value },
  { key: 'forms', label: t('cms.submissions.manageForms'), icon: 'lucide:settings-2' },
])

async function onMenu(key: string) {
  if (key === 'select') {
    selecting.value = true
  } else if (key === 'read') {
    try {
      await list.markAllRead(formKey.value)
      toasts.toast(t('cms.submissions.allRead'), { tone: 'success' })
    } catch (cause) {
      fail(cause)
    }
  } else if (key === 'export') {
    await exportCsv()
  } else if (key === 'forms') {
    await navigateTo('/admin/submissions/forms')
  }
}

// ── Pagination and empty states ────────────────────────────────────────

const pages = computed(() => Math.max(1, Math.ceil(list.total.value / SUBMISSIONS_PAGE_SIZE)))
const shownFrom = computed(() => (list.total.value === 0 ? 0 : (page.value - 1) * SUBMISSIONS_PAGE_SIZE + 1))
const shownTo = computed(() => Math.min(list.total.value, page.value * SUBMISSIONS_PAGE_SIZE))

const emptyTitle = computed(() => {
  if (search.value) {
    return t('cms.submissions.empty.search')
  }

  if (unreadOnly.value) {
    return t('cms.submissions.empty.unread')
  }

  return t(`cms.submissions.empty.${location.value}`)
})
</script>

<template>
  <AdminShell :title="t('cms.submissions.title')">
    <AdminAlert
      v-if="!canView"
      tone="info"
      :title="t('cms.submissions.noAccess')"
    />

    <section
      v-else-if="formsCount === 0 && list.total.value === 0 && location === 'inbox' && !search"
      class="inbox-empty"
    >
      <Icon
        name="lucide:inbox"
        class="inbox-empty__icon"
        aria-hidden="true"
      />
      <h2 class="inbox-empty__title">
        {{ t('cms.submissions.noForms.title') }}
      </h2>
      <p class="inbox-empty__body">
        {{ t('cms.submissions.noForms.body') }}
      </p>
    </section>

    <div
      v-else
      class="inbox"
    >
      <AdminAlert
        v-if="list.error.value"
        tone="danger"
        :title="t(adminErrorKey(list.error.value))"
      />

      <div class="inbox__bar">
        <nav
          class="inbox__tabs"
          :aria-label="t('cms.submissions.tabsLabel')"
        >
          <NuxtLink
            v-for="item in LOCATIONS"
            :key="item"
            :to="{ query: item === 'inbox' ? {} : { location: item } }"
            class="inbox__tab"
            :aria-current="location === item ? 'page' : undefined"
            replace
          >
            {{ t(`cms.submissions.tabs.${item}`) }}
          </NuxtLink>
        </nav>

        <AdminMenu
          :label="t('cms.submissions.moreActions')"
          :items="menuItems"
          @select="onMenu"
        />
      </div>

      <div class="inbox__filters">
        <div class="inbox__search">
          <AdminInput
            v-model="searchInput"
            type="search"
          :label="t('cms.submissions.search')"
          :placeholder="t('cms.submissions.searchPlaceholder')"
            hide-label
          >
            <template #leading>
              <Icon
                name="lucide:search"
                aria-hidden="true"
              />
            </template>
          </AdminInput>
        </div>
        <div
          v-if="formsCount > 1"
          class="inbox__form"
        >
          <AdminSelect
            v-model="formFilter"
            :options="formOptions"
            :label="t('cms.submissions.form')"
            label-placement="hidden"
          />
        </div>
        <AdminButton
          v-if="location === 'inbox'"
          type="button"
          :variant="unreadOnly ? 'secondary' : 'ghost'"
          size="md"
          :aria-pressed="unreadOnly ? 'true' : 'false'"
          @click="setQuery({ unread: unreadOnly ? null : '1' })"
        >
          {{ t('cms.submissions.unreadOnly') }}
        </AdminButton>
      </div>

      <div
        v-if="selecting"
        class="inbox__selection"
        role="toolbar"
        :aria-label="t('cms.submissions.selected', { count: selected.length })"
      >
        <span class="inbox__selected">{{ t('cms.submissions.selected', { count: selected.length }) }}</span>
        <div class="inbox__selection-actions">
          <AdminButton
            type="button"
            variant="secondary"
            size="sm"
            :disabled="selected.length === 0"
            @click="markRead(selected, true)"
          >
            {{ t('cms.submissions.markRead') }}
          </AdminButton>
          <AdminButton
            v-if="location !== 'archived'"
            type="button"
            variant="secondary"
            size="sm"
            :disabled="selected.length === 0"
            @click="move(selected, 'archived')"
          >
            {{ t('cms.submissions.archive') }}
          </AdminButton>
          <AdminButton
            v-if="location !== 'inbox'"
            type="button"
            variant="secondary"
            size="sm"
            :disabled="selected.length === 0"
            @click="move(selected, 'inbox')"
          >
            {{ location === 'spam' ? t('cms.submissions.notSpam') : t('cms.submissions.toInbox') }}
          </AdminButton>
          <AdminButton
            v-if="location !== 'spam'"
            type="button"
            variant="secondary"
            size="sm"
            :disabled="selected.length === 0"
            @click="move(selected, 'spam')"
          >
            {{ t('cms.submissions.spam') }}
          </AdminButton>
          <AdminButton
            type="button"
            variant="ghost"
            size="sm"
            @click="stopSelecting"
          >
            {{ t('cms.submissions.doneSelecting') }}
          </AdminButton>
        </div>
      </div>

      <section
        v-if="rows.length === 0"
        class="inbox-empty inbox-empty--list"
      >
        <h2 class="inbox-empty__title">
          {{ emptyTitle }}
        </h2>
        <p
          v-if="location === 'inbox' && !search && !unreadOnly"
          class="inbox-empty__body"
        >
          {{ t('cms.submissions.empty.inboxBody') }}
        </p>
        <AdminButton
          v-if="search"
          type="button"
          variant="secondary"
          size="sm"
          @click="searchInput = ''"
        >
          {{ t('cms.submissions.clearSearch') }}
        </AdminButton>
      </section>

      <ul
        v-else
        class="inbox__list"
      >
        <li
          v-for="row in rows"
          :key="row.submission.id"
          class="inbox__row"
          :class="{ 'inbox__row--unread': row.unread }"
        >
          <input
            v-if="selecting"
            v-model="selected"
            class="inbox__check"
            type="checkbox"
            :value="row.submission.id"
            :aria-label="t('cms.submissions.selectItem', { name: row.title })"
          >
          <NuxtLink
            :to="detailLink(row.submission)"
            class="inbox__link"
          >
            <span class="inbox__head">
              <span
                v-if="row.unread"
                class="inbox__dot"
              >
                <span class="inbox__hidden">{{ t('cms.submissions.unread') }}</span>
              </span>
              <span class="inbox__title">{{ row.title }}</span>
              <time
                class="inbox__time"
                :datetime="row.submission.createdAt"
              >{{ when(row.submission.createdAt) }}</time>
            </span>
            <span
              v-if="row.excerpt"
              class="inbox__excerpt"
            >{{ row.excerpt }}</span>
            <span
              v-if="row.meta"
              class="inbox__meta"
              :title="row.submission.pagePath ?? undefined"
            >{{ row.meta }}</span>
          </NuxtLink>
        </li>
      </ul>

      <nav
        v-if="list.total.value > SUBMISSIONS_PAGE_SIZE"
        class="inbox__pages"
        :aria-label="t('cms.submissions.pagination')"
      >
        <span class="inbox__shown">{{ t('cms.submissions.shown', { from: shownFrom, to: shownTo, total: list.total.value }) }}</span>
        <AdminButton
          type="button"
          variant="ghost"
          size="sm"
          :disabled="page <= 1"
          @click="setQuery({ page: page > 2 ? String(page - 1) : null })"
        >
          {{ t('cms.submissions.previousPage') }}
        </AdminButton>
        <AdminButton
          type="button"
          variant="ghost"
          size="sm"
          :disabled="page >= pages"
          @click="setQuery({ page: String(page + 1) })"
        >
          {{ t('cms.submissions.nextPage') }}
        </AdminButton>
      </nav>
    </div>
  </AdminShell>
</template>

<style scoped>
.inbox {
  display: grid;
  gap: var(--cms-space-4);
  max-width: 960px;
}

.inbox__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cms-space-3);
}

.inbox__tabs {
  display: flex;
  gap: var(--cms-space-1);
  min-width: 0;
  overflow-x: auto;
}

.inbox__tab {
  padding: var(--cms-space-2) var(--cms-space-3);
  border-radius: var(--cms-radius-md);
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-label-size);
  font-weight: var(--cms-type-label-weight);
  line-height: var(--cms-type-label-line);
  text-decoration: none;
  white-space: nowrap;
}

.inbox__tab:hover {
  background: var(--cms-surface-hover);
  color: var(--cms-foreground);
}

.inbox__tab[aria-current="page"] {
  background: var(--cms-surface-selected);
  color: var(--cms-foreground);
}

.inbox__tab:focus-visible,
.inbox__link:focus-visible {
  outline: none;
  box-shadow: var(--cms-focus-ring);
}

.inbox__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cms-space-2);
}

.inbox__search {
  flex: 1 1 280px;
  min-width: 0;
}

.inbox__form {
  flex: 0 1 220px;
  min-width: 0;
}

.inbox__selection {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cms-space-2);
  padding: var(--cms-space-2) var(--cms-space-3);
  border-radius: var(--cms-radius-md);
  background: var(--cms-surface-secondary);
}

.inbox__selected {
  font-size: var(--cms-type-label-size);
  font-weight: var(--cms-type-label-weight);
}

.inbox__selection-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cms-space-2);
}

.inbox__list {
  margin: 0;
  padding: 0;
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-lg);
  background: var(--cms-card);
  list-style: none;
}

.inbox__row {
  display: flex;
  align-items: flex-start;
  gap: var(--cms-space-3);
  padding-left: var(--cms-space-4);
}

.inbox__row + .inbox__row {
  border-top: var(--cms-border-width) solid var(--cms-border-subtle);
}

.inbox__row:first-child .inbox__link {
  border-radius: var(--cms-radius-lg) var(--cms-radius-lg) 0 0;
}

.inbox__check {
  flex: none;
  width: 18px;
  height: 18px;
  margin-top: var(--cms-space-4);
}

.inbox__link {
  display: grid;
  flex: 1;
  gap: var(--cms-space-1);
  min-width: 0;
  padding: var(--cms-space-3) var(--cms-space-4) var(--cms-space-3) 0;
  color: inherit;
  text-decoration: none;
}

.inbox__link:hover .inbox__title {
  text-decoration: underline;
}

.inbox__head {
  display: flex;
  align-items: center;
  gap: var(--cms-space-2);
  min-width: 0;
}

.inbox__dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: var(--cms-radius-full);
  background: var(--cms-primary);
}

.inbox__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: var(--cms-type-body-size);
  line-height: var(--cms-type-body-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inbox__row--unread .inbox__title {
  font-weight: 600;
}

.inbox__time {
  flex: none;
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
  line-height: var(--cms-type-body-small-line);
}

.inbox__row--unread .inbox__time {
  color: var(--cms-foreground);
  font-weight: 600;
}

.inbox__excerpt {
  display: -webkit-box;
  overflow: hidden;
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
  line-height: var(--cms-type-body-small-line);
  overflow-wrap: anywhere;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.inbox__meta {
  overflow: hidden;
  color: var(--cms-text-tertiary);
  font-size: var(--cms-type-helper-size);
  line-height: var(--cms-type-helper-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inbox__hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.inbox__pages {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--cms-space-2);
}

.inbox__shown {
  margin-right: auto;
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
}

.inbox-empty {
  display: grid;
  justify-items: center;
  gap: var(--cms-space-2);
  max-width: 960px;
  padding: var(--cms-space-12) var(--cms-space-4);
  border: var(--cms-border-width) dashed var(--cms-border);
  border-radius: var(--cms-radius-lg);
  text-align: center;
}

.inbox-empty--list {
  padding: var(--cms-space-10) var(--cms-space-4);
}

.inbox-empty__icon {
  width: var(--cms-space-8);
  height: var(--cms-space-8);
  color: var(--cms-text-tertiary);
}

.inbox-empty__title {
  margin: 0;
  font-size: var(--cms-type-h4-size);
  font-weight: var(--cms-type-h4-weight);
  line-height: var(--cms-type-h4-line);
}

.inbox-empty__body {
  max-width: 420px;
  margin: 0;
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
  line-height: var(--cms-type-body-small-line);
}

@media (max-width: 767px) {
  .inbox__filters > * {
    flex-basis: 100%;
  }

  .inbox__row {
    padding-left: var(--cms-space-3);
  }

  .inbox__link {
    padding-right: var(--cms-space-3);
  }
}
</style>
