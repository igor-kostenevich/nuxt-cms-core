<script setup lang="ts">
import { adminDate } from '../../../admin/dates'
import { adminErrorKey } from '../../../admin/error-key'
import { contentLabel, contentText } from '../../../admin/content-label'
import { useAdminEntries } from '../../../admin/useAdminEntries'
import { documentStatusTone, shownStatus } from '../../../admin/status-tone'
import { useAdminI18n } from '../../../admin/useAdminI18n'
import { useAdminToast } from '../../../admin/useAdminToast'
import { pageTypes } from '../../../admin/useAdminPages'
import { publishOnOpenState, routePrefix } from '../../../editor/entry-route'

definePageMeta({
  layout: false,
  middleware: ['cms-auth'],
})

// Entries of a type with a route (014 §8): search, filters, pages of the
// list. Edit opens the entry in Edit Mode by its id; New asks for a title and
// an address and stays here, offering to open the new draft.
const { t, locale } = useAdminI18n()
const { can } = usePermissions()
const toasts = useAdminToast()
const route = useRoute()
const router = useRouter()

const type = computed(() => pageTypes().find(item => item.key === route.params.type) ?? null)
const label = computed(() => contentLabel(type.value?.label, locale.value))
const newLabel = computed(() => contentText(type.value?.text, 'newButton', locale.value) ?? t('cms.pages.new'))
const newTitle = computed(() => contentText(type.value?.text, 'newTitle', locale.value))
const prefix = computed(() => (type.value?.route ? routePrefix(type.value.route) : '/'))

const {
  statuses,
  setStatuses,
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
  pageSize,
  titleOf,
  takeOff,
  load,
} = useAdminEntries({
  type: computed(() => type.value?.key ?? null),
  order: computed(() => type.value?.order ?? null),
  pageSize: 20,
  t,
})

const emptyText = computed(() => {
  if (search.value) {
    return t('cms.pages.type.emptySearch')
  }

  return statuses.value.length ? t('cms.pages.type.emptyFiltered') : t('cms.pages.type.empty')
})

/** The entry on the site (a published one): its address in the language of the original. */
function siteLink(entry: { status: string, slug: string | null }) {
  return (entry.status === 'published' || entry.status === 'changed') && entry.slug ? `${prefix.value}${entry.slug}` : null
}

function editLink(entry: { id: string, slug: string | null }) {
  // The path is cosmetic: Edit Mode finds the entry by its id and fixes the path.
  return `/admin/edit${prefix.value}${entry.slug ?? entry.id}?entry=${entry.id}`
}

/** The whole row opens the entry in Edit Mode, except its buttons and links. */
function onRowClick(event: MouseEvent, entry: { id: string, slug: string | null, status: string }) {
  if (!canEdit.value || (event.target as HTMLElement).closest('button, a')) {
    return
  }

  void navigateTo(editLink(entry))
}

/**
 * Publish in the list: the entry opens in Edit Mode and Publish is asked there,
 * with the checks of the page. The request is in the history state, not in the
 * address (`publishOnOpenState`).
 */
function publishFromList(entry: { id: string, slug: string | null }) {
  const target = router.resolve(editLink(entry))
  void navigateTo({ path: target.path, query: target.query, hash: target.hash, state: publishOnOpenState(entry.id) })
}

function when(value: string | null) {
  return adminDate(value)
}

const canEdit = computed(() => can('pages.edit'))
const canPublish = computed(() => can('pages.publish'))

// ── New ──────────────────────────────────────────────────────────────

const creating = ref(route.query.create === '1')

watch(creating, (open) => {
  if (!open && route.query.create) {
    setQuery({ create: null })
  }
})

/** Created: stay on the list (to add the next one); the toast opens the draft. */
function onCreated(entry: { id: string, slug: string, title: string }) {
  void load()
  toasts.toast(t('cms.pages.create.created', { title: entry.title }), {
    tone: 'success',
    action: { label: t('cms.pages.edit'), run: () => void navigateTo(editLink(entry)) },
  })
}
</script>

<template>
  <AdminShell :title="label || t('cms.pages.title')">
    <AdminAlert
      v-if="!type"
      tone="info"
      :title="t('cms.pages.type.notFound')"
    >
      <NuxtLink to="/admin/pages">
        {{ t('cms.pages.type.back') }}
      </NuxtLink>
    </AdminAlert>

    <div
      v-else
      class="entries"
      :aria-busy="loading ? 'true' : 'false'"
    >
      <p class="entries__back">
        <NuxtLink to="/admin/pages">
          ← {{ t('cms.pages.type.back') }}
        </NuxtLink>
      </p>

      <AdminAlert
        v-if="failure"
        tone="danger"
        :title="t(adminErrorKey(failure))"
      />

      <AdminEntryFilters
        v-model:search="searchInput"
        :statuses="statuses"
        :new-label="canEdit ? newLabel : undefined"
        @update:statuses="setStatuses"
        @create="creating = true"
      />

      <p
        v-if="!loading && list.items.length === 0"
        class="entries__empty"
      >
        {{ emptyText }}
      </p>

      <ul
        v-else
        class="entries__list"
        data-test="entries-list"
      >
        <li
          v-for="entry in list.items"
          :key="entry.id"
          class="entries__row"
          :class="{ 'entries__row--open': canEdit }"
          :data-entry="entry.id"
          @click="onRowClick($event, entry)"
        >
          <div class="entries__main">
            <!-- The whole row opens the entry in Edit Mode; the arrow beside the title is only a hint, always there, however long the title. -->
            <div class="entries__heading">
              <NuxtLink
                :to="editLink(entry)"
                class="entries__title"
              >
                {{ titleOf(entry) }}
              </NuxtLink>
              <!-- Only a hint that the row opens; the whole row is the target. -->
              <Icon
                v-if="canEdit"
                name="lucide:arrow-right"
                class="entries__open"
                aria-hidden="true"
              />
            </div>
            <a
              v-if="siteLink(entry)"
              :href="siteLink(entry) ?? undefined"
              target="_blank"
              rel="noopener"
              class="entries__site"
            >
              {{ t('cms.pages.type.openOnSite') }}
              <Icon
                name="lucide:arrow-up-right"
                aria-hidden="true"
              />
            </a>
            <span
              v-else-if="entry.status === 'draft' || entry.status === 'archived'"
              class="entries__meta"
            >{{ t('cms.pages.type.notOnSite') }}</span>
          </div>
          <AdminBadge :tone="documentStatusTone(shownStatus(entry.status))">
            {{ t(`cms.pages.status.${shownStatus(entry.status)}`) }}
          </AdminBadge>
          <span class="entries__time">{{ when(entry.updatedAt) }}</span>
          <div class="entries__actions">
            <!-- One action in its place: Publish a draft, one taken off the site too
                 (opens it in Edit Mode and asks to publish, with the checks of
                 the page), or Take off the site. -->
            <AdminButton
              v-if="(entry.status === 'draft' || entry.status === 'archived') && canPublish && canEdit"
              type="button"
              variant="primary"
              size="sm"
              class="entries__archive"
              data-test="entries-publish"
              @click="publishFromList(entry)"
            >
              {{ t('cms.editor.toolbar.publish') }}
            </AdminButton>
            <AdminButton
              v-else-if="canPublish"
              type="button"
              variant="secondary"
              size="sm"
              class="entries__archive entries__take-off"
              data-test="entries-archive"
              @click="takeOff(entry)"
            >
              {{ t('cms.pages.type.archive') }}
            </AdminButton>
          </div>
        </li>
      </ul>

      <nav
        v-if="list.total > pageSize"
        class="entries__pages"
        :aria-label="t('cms.pages.type.pagination')"
      >
        <span class="entries__shown">{{ t('cms.pages.type.shown', { from: shownFrom, to: shownTo, total: list.total }) }}</span>
        <AdminButton
          type="button"
          variant="ghost"
          size="sm"
          :disabled="page <= 1"
          @click="setQuery({ page: page > 2 ? String(page - 1) : null })"
        >
          {{ t('cms.pages.type.previous') }}
        </AdminButton>
        <AdminButton
          type="button"
          variant="ghost"
          size="sm"
          :disabled="page >= pages"
          @click="setQuery({ page: String(page + 1) })"
        >
          {{ t('cms.pages.type.next') }}
        </AdminButton>
      </nav>

      <AdminEntryCreateDialog
        v-model:open="creating"
        :type="type.key"
        :prefix="prefix"
        :reserved="type.reserved"
        :heading="newTitle"
        @created="onCreated"
      />
    </div>
  </AdminShell>
</template>

<style scoped>
.entries {
  display: grid;
  gap: var(--cms-space-4);
}

.entries__back {
  margin: 0;
  font-size: var(--cms-type-body-small-size);
}

.entries__back a {
  color: var(--cms-text-secondary);
}

.entries__back a:hover {
  color: var(--cms-foreground);
}


.entries__empty {
  margin: 0;
  color: var(--cms-text-secondary);
}

.entries__list {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content max-content max-content;
  margin: 0;
  padding: 0;
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-lg);
  background: var(--cms-card);
  list-style: none;
}

/* A table without a header: the same columns in every row. */
/* One set of columns for all rows (subgrid): status, date and buttons line
   up, and each column is as wide as its widest cell. */
.entries__row {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
  align-items: center;
  /* The two buttons stand close; the other columns keep their distance
     with their own padding. */
  column-gap: var(--cms-space-2);
  padding: var(--cms-space-3) var(--cms-space-4);
}

.entries__row + .entries__row {
  border-top: var(--cms-border-width) solid var(--cms-border-subtle);
}

.entries__main {
  display: grid;
  justify-items: start;
  gap: var(--cms-space-1);
  min-width: 0;
}

.entries__heading {
  display: flex;
  align-items: center;
  gap: var(--cms-space-1);
  min-width: 0;
  max-width: 100%;
}

/* The title shrinks and ends in "…"; the arrow beside it never does. */
.entries__open {
  flex: none;
  color: var(--cms-text-tertiary);
}

.entries__title {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  color: inherit;
  text-decoration: none;
  font-size: var(--cms-type-body-size);
  font-weight: 600;
  line-height: var(--cms-type-body-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entries__title:focus-visible,
.entries__site:focus-visible {
  border-radius: var(--cms-radius-sm);
  outline: none;
  box-shadow: var(--cms-focus-ring);
}

.entries__site {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--cms-primary);
  font-size: var(--cms-type-body-small-size);
  line-height: var(--cms-type-body-small-line);
  text-decoration: none;
}

.entries__site:hover {
  text-decoration: underline;
}

.entries__meta,
.entries__time,
.entries__shown {
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
  line-height: var(--cms-type-body-small-line);
  font-variant-numeric: tabular-nums;
}


/* The action is a column of the list: Publish / Take off the site / Put back
   stand in the same place in every row, as wide as the widest. */
.entries__actions {
  display: contents;
}

.entries__archive {
  width: 100%;
}

/* Taking an entry off the site can be undone, so it is not a warning: a quiet
   button, red only when the pointer is on it. The one strong button of a row
   is Publish. */
.entries__take-off:hover:not(:disabled),
.entries__take-off:focus-visible {
  border-color: var(--cms-destructive);
  background: var(--cms-destructive-subtle);
  color: var(--cms-destructive-text);
}

/* Pressed: a step deeper than hover, as the blue button's. */
.entries__take-off:active:not(:disabled) {
  border-color: var(--cms-destructive-text);
  background: color-mix(in srgb, var(--cms-destructive) 16%, var(--cms-card));
  color: var(--cms-destructive-text);
}

.entries__main {
  margin-inline-end: var(--cms-space-4);
}

.entries__row--open {
  cursor: pointer;
}

.entries__row--open:hover {
  background: var(--cms-surface-hover);
}

.entries__time {
  padding-inline: var(--cms-space-4);
}

.entries__pages {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--cms-space-2);
}

.entries__shown {
  margin-right: auto;
}

/* A phone: the title on its own line, the rest under it. */
@media (max-width: 767px) {
  .entries__list {
    display: block;
  }

  .entries__row {
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--cms-space-2) var(--cms-space-3);
  }

  .entries__main,
  .entries__actions {
    grid-column: 1 / -1;
  }

  .entries__actions {
    display: flex;
    gap: var(--cms-space-2);
  }

  .entries__main,
  .entries__order {
    margin-inline-end: 0;
  }

  .entries__time {
    padding-inline: 0;
  }

  .entries__archive {
    width: auto;
  }
}
</style>
