<script setup lang="ts">
import { cmsContent } from '#cms/content'
import { adminDate } from '../../../admin/dates'
import { adminErrorKey } from '../../../admin/error-key'
import { contentLabel, contentText, entryDialogTitle } from '../../../admin/content-label'
import { useAdminEntries } from '../../../admin/useAdminEntries'
import { documentStatusTone, shownStatus } from '../../../admin/status-tone'
import { useAdminI18n } from '../../../admin/useAdminI18n'
import EntryDialog from '../../../editor/EntryDialog.vue'
import { moveEntryId } from '../../../editor/entries-choice'
import type { CmsEntryListItem } from '../../../types/entries'

definePageMeta({
  layout: false,
  middleware: ['cms-auth'],
})

// Entries of a type without a route (014 §8): the list, and the dialog with
// the form of the type Core renders from its `fields`, for Edit and New.
// A type in manual order lists every live entry and is reordered by
// dragging; the order applies at once. The open entry is in the URL
// (`?entry=`), so a link can open it.
const { t, locale } = useAdminI18n()
const { can } = usePermissions()
const route = useRoute()

const type = computed(() => cmsContent.types.find(item => item.key === route.params.type && item.section === 'content') ?? null)
const label = computed(() => contentLabel(type.value?.label, locale.value))

const {
  statuses,
  setStatuses,
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
  reorderable,
  pageSize,
  titleOf,
  takeOff,
  reorder,
} = useAdminEntries({
  type: computed(() => type.value?.key ?? null),
  order: computed(() => type.value?.order ?? null),
  pageSize: 20,
  t,
})

const canEdit = computed(() => can('pages.edit'))
const canPublish = computed(() => can('pages.publish'))

const emptyText = computed(() => {
  if (search.value) {
    return t('cms.pages.type.emptySearch')
  }

  return statuses.value.length ? t('cms.pages.type.emptyFiltered') : t('cms.pages.type.empty')
})

/** Entries on the site, in their order: only these are reordered. */
const liveItems = computed(() => list.value.items.filter(item => item.status !== 'archived'))
const ordering = computed(() => reorderable.value && canPublish.value)

function when(value: string | null) {
  return adminDate(value)
}

// ── The dialog ───────────────────────────────────────────────────────

/** The entry in the dialog: an id, `new`, or none (closed). From the URL. */
const opened = computed<string | null>(() => {
  if (route.query.create === '1') {
    return 'new'
  }

  const entry = route.query.entry
  return typeof entry === 'string' && entry ? entry : null
})
const dialogOpen = computed({
  get: () => opened.value !== null,
  set: (open) => {
    if (!open) {
      setQuery({ entry: null, create: null })
      void load()
    }
  },
})
/** Remount the dialog body per entry: a new Engine and lock for each. */
const dialogKey = ref(0)

/** Publish was asked for in the list: the dialog tries it as soon as the entry is loaded. */
const publishOnOpen = ref(false)

function openEntry(id: string | null, options: { publish?: boolean } = {}) {
  dialogKey.value++
  publishOnOpen.value = Boolean(options.publish)
  setQuery(id ? { entry: id, create: null } : { create: '1', entry: null })
}

/** The entry's title in the dialog: from its document once loaded, the list row before. */
const liveTitle = ref<string | null>(null)
watch(opened, (now, before) => {
  // A new entry that just got its id is still the same dialog.
  if (before !== 'new') {
    liveTitle.value = null
  }
})

const dialogTitle = computed(() => {
  if (!type.value) {
    return ''
  }

  const row = list.value.items.find(item => item.id === opened.value)
  return entryDialogTitle(type.value, {
    isNew: opened.value === 'new',
    title: liveTitle.value || row?.title || t('cms.pages.type.untitled'),
  }, locale.value, t)
})

/** The create button: the Client's words for this type, or Core's "New". */
const newLabel = computed(() => contentText(type.value?.text, 'newButton', locale.value) ?? t('cms.pages.new'))

function onCreated(id: string) {
  // Keep the same dialog (and its Engine): only the URL learns the id.
  setQuery({ entry: id, create: null })
}

// ── Manual order ─────────────────────────────────────────────────────

const dragged = ref<string | null>(null)
/** The row the dragged one is over: the place it would land. */
const over = ref<string | null>(null)

/**
 * How the drop target is marked: a line on the side the dragged entry lands
 * on (below when it comes from above, above when it comes from below).
 */
function dropMark(entry: CmsEntryListItem): 'above' | 'below' | null {
  if (!dragged.value || over.value !== entry.id || entry.id === dragged.value) {
    return null
  }

  const items = list.value.items
  return items.findIndex(item => item.id === dragged.value) < items.findIndex(item => item.id === entry.id) ? 'below' : 'above'
}

function onDragOver(entry: CmsEntryListItem) {
  if (dragged.value) {
    over.value = entry.id
  }
}

function onDragLeave(event: DragEvent, entry: CmsEntryListItem) {
  // Moving over a child of the row is not leaving it.
  if (over.value === entry.id && !(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
    over.value = null
  }
}

function endDrag() {
  dragged.value = null
  over.value = null
}

/** Dragging starts at the handle only; the whole row is the picture that follows the pointer. */
function startDrag(event: DragEvent, entry: CmsEntryListItem) {
  dragged.value = entry.id

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    // Firefox starts no drag without data.
    event.dataTransfer.setData('text/plain', entry.id)
    const row = (event.currentTarget as HTMLElement).closest('li')

    if (row) {
      const box = row.getBoundingClientRect()
      event.dataTransfer.setDragImage(row, event.clientX - box.left, event.clientY - box.top)
    }
  }
}

/** The whole row opens the entry, except its buttons, links and the order controls. */
function onRowClick(event: MouseEvent, entry: CmsEntryListItem) {
  if (!canEdit.value || (event.target as HTMLElement).closest('button, a, .entries__order')) {
    return
  }

  openEntry(entry.id)
}

function moved(ids: string[], id: string, to: number) {
  const next = ids.filter(item => item !== id)
  next.splice(Math.max(0, Math.min(next.length, to)), 0, id)
  return next
}

/** Where a live entry stands among the live ones; -1 for one off the site. */
function liveIndex(entry: CmsEntryListItem) {
  return liveItems.value.findIndex(item => item.id === entry.id)
}

function onDrop(target: CmsEntryListItem) {
  const id = dragged.value
  endDrag()

  if (!id || id === target.id) {
    return
  }

  const ids = liveItems.value.map(item => item.id)
  // Dropped on an entry off the site: it takes the place of the next live one.
  const onto = target.status === 'archived'
    ? list.value.items.slice(list.value.items.indexOf(target)).find(item => item.status !== 'archived')
    : target

  void reorder(moved(ids, id, onto ? ids.indexOf(onto.id) : ids.length))
}

function step(entry: CmsEntryListItem, by: -1 | 1) {
  const ids = liveItems.value.map(item => item.id)
  const next = moveEntryId(ids, entry.id, by)

  // At either end nothing moves: no save.
  if (next.some((id, index) => id !== ids[index])) {
    void reorder(next)
  }
}
</script>

<template>
  <AdminShell :title="label || t('cms.content.title')">
    <AdminAlert
      v-if="!type || !type.fields"
      tone="info"
      :title="t('cms.content.notFound')"
    />

    <div
      v-else
      class="entries"
      :aria-busy="loading ? 'true' : 'false'"
    >
      <p class="entries__back">
        <NuxtLink to="/admin/content">
          ← {{ t('cms.content.title') }}
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
        @create="openEntry(null)"
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
        :class="{ 'entries__list--ordered': ordering }"
        data-test="entries-list"
      >
        <li
          v-for="entry in list.items"
          :key="entry.id"
          class="entries__row"
          :class="[{ 'entries__row--dragged': dragged === entry.id, 'entries__row--open': canEdit }, dropMark(entry) && `entries__row--drop-${dropMark(entry)}`]"
          :data-entry="entry.id"
          @click="onRowClick($event, entry)"
          @dragover.prevent="onDragOver(entry)"
          @dragleave="onDragLeave($event, entry)"
          @drop.prevent="onDrop(entry)"
        >
          <!-- An entry off the site keeps its place and its controls, switched off: it is not moved. -->
          <div
            v-if="ordering"
            class="entries__order"
            :class="{ 'entries__order--off': entry.status === 'archived' }"
          >
            <span
              class="entries__handle"
              :draggable="entry.status === 'archived' ? undefined : 'true'"
              @dragstart="startDrag($event, entry)"
              @dragend="endDrag"
            >
              <Icon
                name="lucide:grip-vertical"
                class="entries__grip"
                :aria-label="t('cms.content.dragHandle', { title: titleOf(entry) })"
              />
            </span>
            <AdminButton
              type="button"
              variant="ghost"
              size="sm"
              icon-only
              :aria-label="`${t('cms.content.moveUp')}: ${titleOf(entry)}`"
              :disabled="entry.status === 'archived' || liveIndex(entry) === 0"
              data-test="entries-up"
              @click="step(entry, -1)"
            >
              <Icon
                name="lucide:chevron-up"
                aria-hidden="true"
              />
            </AdminButton>
            <AdminButton
              type="button"
              variant="ghost"
              size="sm"
              icon-only
              :aria-label="`${t('cms.content.moveDown')}: ${titleOf(entry)}`"
              :disabled="entry.status === 'archived' || liveIndex(entry) === liveItems.length - 1"
              data-test="entries-down"
              @click="step(entry, 1)"
            >
              <Icon
                name="lucide:chevron-down"
                aria-hidden="true"
              />
            </AdminButton>
          </div>
          <!-- The title opens the entry too; the arrow beside it is always there, however long the title. -->
          <div class="entries__heading">
            <button
              type="button"
              class="entries__main"
              :disabled="!canEdit"
              @click="openEntry(entry.id)"
            >
              <span class="entries__title">{{ titleOf(entry) }}</span>
            </button>
            <!-- Only a hint that the row opens; the whole row is the target. -->
            <Icon
              v-if="canEdit"
              name="lucide:arrow-right"
              class="entries__open"
              aria-hidden="true"
            />
          </div>
          <AdminBadge :tone="documentStatusTone(shownStatus(entry.status))">
            {{ t(`cms.pages.status.${shownStatus(entry.status)}`) }}
          </AdminBadge>
          <span class="entries__time">{{ when(entry.updatedAt) }}</span>
          <div class="entries__actions">
            <!-- One action in its place: Publish a draft, one taken off the site too
                 (opens the entry and asks to publish it, with the checks of the
                 form), or Take off the site. -->
            <AdminButton
              v-if="(entry.status === 'draft' || entry.status === 'archived') && canPublish && canEdit"
              type="button"
              variant="primary"
              size="sm"
              class="entries__archive"
              data-test="entries-publish"
              @click="openEntry(entry.id, { publish: true })"
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
        v-if="!wholeList && list.total > pageSize"
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

      <EntryDialog
        v-if="opened"
        :key="dialogKey"
        v-model:open="dialogOpen"
        :title="dialogTitle"
        :type="type.key"
        :entry-id="opened === 'new' ? null : opened"
        :fields="type.fields"
        :publish-on-open="publishOnOpen"
        @created="onCreated"
        @changed="load"
        @title="liveTitle = $event"
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
  font-size: var(--cms-type-body-small-size);
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

/* A table without a header: the same columns in every row (title, status,
   date, actions; the order controls first in the order of the site). */
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

.entries__list--ordered {
  grid-template-columns: max-content minmax(0, 1fr) max-content max-content max-content;
}

.entries__row + .entries__row {
  border-top: var(--cms-border-width) solid var(--cms-border-subtle);
}

.entries__row--open {
  cursor: pointer;
}

.entries__row--open:hover {
  background: var(--cms-surface-hover);
}

/* The handle is the only place a row is dragged from. */
.entries__handle {
  display: inline-flex;
  align-items: center;
}

.entries__handle[draggable="true"] {
  cursor: grab;
}

.entries__row--drop-above,
.entries__row--drop-below {
  background: var(--cms-primary-subtle);
}

.entries__row--drop-above {
  box-shadow: inset 0 2px 0 var(--cms-primary);
}

.entries__row--drop-below {
  box-shadow: inset 0 -2px 0 var(--cms-primary);
}

.entries__row--dragged {
  opacity: 0.5;
}

.entries__order {
  display: flex;
  margin-inline-end: var(--cms-space-4);
  align-items: center;
  gap: var(--cms-space-1);
}

.entries__grip {
  color: var(--cms-text-tertiary);
}

.entries__order--off .entries__grip {
  opacity: 0.4;
}

.entries__heading {
  display: flex;
  align-items: center;
  gap: var(--cms-space-1);
  min-width: 0;
  margin-inline-end: var(--cms-space-4);
}

/* The title shrinks and ends in "…"; the arrow beside it never does. */
.entries__open {
  flex: none;
  color: var(--cms-text-tertiary);
}

.entries__main:disabled {
  cursor: default;
}

.entries__main {
  flex: 0 1 auto;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.entries__main:focus-visible {
  outline: none;
  box-shadow: var(--cms-focus-ring);
}

.entries__title {
  display: block;
  overflow: hidden;
  font-size: var(--cms-type-body-size);
  font-weight: 600;
  line-height: var(--cms-type-body-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entries__time,
.entries__shown {
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
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

  .entries__row,
  .entries__list--ordered .entries__row {
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--cms-space-2) var(--cms-space-3);
  }

  .entries__heading,
  .entries__actions {
    grid-column: 1 / -1;
  }

  .entries__actions {
    display: flex;
    gap: var(--cms-space-2);
  }

  .entries__heading,
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
