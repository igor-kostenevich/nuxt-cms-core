<script setup lang="ts">
import { adminDate } from '../../../admin/dates'
import { adminErrorKey } from '../../../admin/error-key'
import { contentLabel, contentText } from '../../../admin/content-label'
import { useAdminI18n } from '../../../admin/useAdminI18n'
import { useAdminToast } from '../../../admin/useAdminToast'
import { useAdminPages, type AdminDocumentStatus, type AdminTypeRow } from '../../../admin/useAdminPages'
import { documentStatusTone } from '../../../admin/status-tone'
import { routePrefix } from '../../../editor/entry-route'

definePageMeta({
  layout: false,
  middleware: ['cms-auth'],
})

// Pages (014 §8): the static pages of the site (declared in cms.content.ts,
// and the ones the database knows), then the collections with a route (a
// blog): each opens its list, or creates an entry right here (and stays). Names follow
// the admin's language as it changes.
const { t, locale } = useAdminI18n()
const { can } = usePermissions()
const toasts = useAdminToast()
const { pages, types, loading, error, load } = useAdminPages()

onMounted(() => {
  void load()
})

const canEdit = computed(() => can('pages.edit'))

function editLink(path: string) {
  return path === '/' ? '/admin/edit/' : `/admin/edit${path}`
}

function when(value: string | null) {
  return adminDate(value)
}

function statusLabel(status: AdminDocumentStatus) {
  return t(`cms.pages.status.${status}`)
}

// ── New entry of a type, without leaving this screen ─────────────────

const creating = shallowRef<AdminTypeRow['type'] | null>(null)
const createOpen = computed({
  get: () => creating.value !== null,
  set: (open) => {
    if (!open) {
      creating.value = null
    }
  },
})

/** Created: stay here (to add the next one); the toast opens the draft. */
function onCreated(entry: { id: string, slug: string, title: string }) {
  const route = creating.value?.route
  void load()

  if (route) {
    toasts.toast(t('cms.pages.create.created', { title: entry.title }), {
      tone: 'success',
      action: { label: t('cms.pages.edit'), run: () => void navigateTo(`/admin/edit${routePrefix(route)}${entry.slug}?entry=${entry.id}`) },
    })
  }
}
</script>

<template>
  <AdminShell :title="t('cms.pages.title')">
    <AdminAlert
      v-if="error"
      tone="danger"
      :title="t(adminErrorKey(error))"
    />

    <div
      v-else
      class="pages"
      :aria-busy="loading ? 'true' : 'false'"
    >
      <section class="pages__section">
        <h2 class="pages__heading">
          {{ t('cms.pages.pagesTitle') }}
        </h2>
        <p
          v-if="!loading && pages.length === 0"
          class="pages__empty"
        >
          {{ t('cms.pages.empty') }}
        </p>
        <ul
          v-else
          class="pages__list pages__list--table"
          data-test="pages-list"
        >
          <li
            v-for="page in pages"
            :key="page.key"
            class="pages__row"
          >
            <div class="pages__main">
              <span class="pages__title">{{ page.label ? contentLabel(page.label, locale) : page.key }}</span>
              <span class="pages__meta">
                <a
                  v-if="page.path"
                  :href="page.path"
                  target="_blank"
                  rel="noopener"
                  class="pages__site"
                >
                  {{ t('cms.pages.type.openOnSite') }}
                  <Icon
                    name="lucide:arrow-up-right"
                    aria-hidden="true"
                  />
                </a>
                <span v-if="!page.declared">{{ t('cms.pages.notDeclared') }}</span>
              </span>
            </div>
            <AdminBadge :tone="documentStatusTone(page.status)">
              {{ statusLabel(page.status) }}
            </AdminBadge>
            <span class="pages__time">{{ when(page.updatedAt) }}</span>
            <div class="pages__actions">
              <AdminButton
                v-if="canEdit && page.path"
                :to="editLink(page.path)"
                variant="secondary"
                size="sm"
              >
                {{ t('cms.pages.edit') }}
              </AdminButton>
            </div>
          </li>
        </ul>
      </section>

      <section
        v-if="types.length > 0"
        class="pages__section"
      >
        <h2 class="pages__heading">
          {{ t('cms.pages.typesTitle') }}
        </h2>
        <ul
          class="pages__list pages__list--types"
          data-test="types-list"
        >
          <li
            v-for="row in types"
            :key="row.key"
            class="pages__row pages__row--type"
          >
            <NuxtLink
              :to="`/admin/pages/${row.key}`"
              class="pages__main pages__link"
            >
              <span class="pages__title">{{ contentLabel(row.type.label, locale) }} <span class="pages__count">({{ row.total }})</span></span>
            </NuxtLink>
            <span class="pages__time">{{ row.updatedAt ? t('cms.pages.updated', { date: when(row.updatedAt) }) : '' }}</span>
            <AdminButton
              :to="`/admin/pages/${row.key}`"
              variant="secondary"
              size="sm"
            >
              {{ t('cms.pages.manage') }}
            </AdminButton>
            <!-- Its own column: every create button as wide as the widest. -->
            <AdminButton
              v-if="canEdit"
              variant="primary"
              size="sm"
              class="pages__new"
              data-test="types-new"
              @click="creating = row.type"
            >
              <template #leading>
                <Icon
                  name="lucide:plus"
                  aria-hidden="true"
                />
              </template>
              {{ contentText(row.type.text, 'newButton', locale) ?? t('cms.pages.new') }}
            </AdminButton>
          </li>
        </ul>
      </section>

      <AdminEntryCreateDialog
        v-if="creating?.route"
        v-model:open="createOpen"
        :type="creating.key"
        :prefix="routePrefix(creating.route)"
        :reserved="creating.reserved"
        :heading="contentText(creating.text, 'newTitle', locale)"
        @created="onCreated"
      />
    </div>
  </AdminShell>
</template>

<style scoped>
.pages {
  display: grid;
  gap: var(--cms-space-8);
}

.pages__section {
  display: grid;
  gap: var(--cms-space-3);
}

.pages__heading {
  margin: 0;
  font-size: var(--cms-type-h4-size);
  font-weight: var(--cms-type-h4-weight);
  line-height: var(--cms-type-h4-line);
}

.pages__empty {
  margin: 0;
  color: var(--cms-text-secondary);
}

.pages__list {
  margin: 0;
  padding: 0;
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-lg);
  background: var(--cms-card);
  list-style: none;
}

/* One set of columns for all rows (subgrid), so status, date and the
   buttons line up and stand the same distance apart in every row. Pages:
   name, status, date, Edit. Collections: name, date, Manage, create. */
.pages__list--table,
.pages__list--types {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content max-content max-content;
}

.pages__list--table .pages__row,
.pages__list--types .pages__row {
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
  column-gap: var(--cms-space-6);
}

.pages__list--types .pages__row {
  column-gap: var(--cms-space-2);
}

.pages__list--types .pages__time {
  margin-inline-end: var(--cms-space-4);
}

.pages__new {
  width: 100%;
}

/* A table without a header: the same columns in every row (name, status,
   date, actions). */
.pages__row {
  display: grid;
  align-items: center;
  gap: var(--cms-space-3);
  padding: var(--cms-space-3) var(--cms-space-4);
}


.pages__count {
  color: var(--cms-text-secondary);
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}

.pages__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--cms-space-2);
}

.pages__site {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--cms-primary);
  text-decoration: none;
}

.pages__site:hover {
  text-decoration: underline;
}

.pages__site:focus-visible {
  border-radius: var(--cms-radius-sm);
  outline: none;
  box-shadow: var(--cms-focus-ring);
}

.pages__row + .pages__row {
  border-top: var(--cms-border-width) solid var(--cms-border-subtle);
}

.pages__main {
  display: grid;
  justify-items: start;
  gap: var(--cms-space-1);
  min-width: 0;
}

.pages__link {
  color: inherit;
  text-decoration: none;
}

.pages__link:hover .pages__title {
  text-decoration: underline;
}

.pages__link:focus-visible {
  outline: none;
  box-shadow: var(--cms-focus-ring);
}

.pages__title {
  /* A long name ends in "…": no wider than its column. */
  max-width: 100%;
  overflow: hidden;
  font-size: var(--cms-type-body-size);
  font-weight: 600;
  line-height: var(--cms-type-body-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pages__meta,
.pages__time {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cms-space-2);
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
  line-height: var(--cms-type-body-small-line);
  font-variant-numeric: tabular-nums;
}


/* A phone: the name on its own line, the rest under it. */
@media (max-width: 767px) {
  .pages__list--table,
  .pages__list--types {
    display: block;
  }

  .pages__row,
  .pages__list--table .pages__row,
  .pages__list--types .pages__row {
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--cms-space-2) var(--cms-space-3);
  }

  .pages__main,
  .pages__actions,
  .pages__list--types .pages__time {
    grid-column: 1 / -1;
  }
}
</style>
