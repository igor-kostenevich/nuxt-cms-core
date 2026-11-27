<script setup lang="ts">
import { adminDate } from '../../../admin/dates'
import { adminErrorKey } from '../../../admin/error-key'
import { contentLabel, contentText, entryDialogTitle } from '../../../admin/content-label'
import { typeSummaries, type AdminTypeRow } from '../../../admin/useAdminPages'
import { useAdminI18n } from '../../../admin/useAdminI18n'
import EntryDialog from '../../../editor/EntryDialog.vue'

definePageMeta({
  layout: false,
  middleware: ['cms-auth'],
})

// Content (014 §8): the types without a route, edited in a dialog (the form
// Core renders from the type's fields). Each opens its list; New
// opens the dialog right here. Names follow the admin's language.
const { t, locale } = useAdminI18n()
const { can } = usePermissions()

const types = shallowRef<AdminTypeRow[]>([])
const loading = ref(true)
const failure = shallowRef<unknown>(null)

async function load() {
  try {
    types.value = await typeSummaries('content')
  } catch (cause) {
    failure.value = cause
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})

function when(value: string | null) {
  return adminDate(value)
}

// ── New entry, without leaving this screen ───────────────────────────

const creating = shallowRef<AdminTypeRow['type'] | null>(null)
/** Remount per opening: a new Engine for each new entry. */
const dialogKey = ref(0)
const createdTitle = ref('')
const created = ref(false)

const dialogOpen = computed({
  get: () => creating.value !== null,
  set: (open) => {
    if (!open) {
      creating.value = null
      void load()
    }
  },
})


function create(type: AdminTypeRow['type']) {
  dialogKey.value++
  created.value = false
  createdTitle.value = ''
  creating.value = type
}

const dialogTitle = computed(() => (creating.value
  ? entryDialogTitle(creating.value, { isNew: !created.value, title: createdTitle.value || t('cms.pages.type.untitled') }, locale.value, t)
  : ''))
</script>

<template>
  <AdminShell :title="t('cms.content.title')">
    <AdminAlert
      v-if="failure"
      tone="danger"
      :title="t(adminErrorKey(failure))"
    />
    <p
      v-else-if="!loading && types.length === 0"
      class="content__empty"
    >
      {{ t('cms.content.empty') }}
    </p>
    <section
      v-else
      class="content"
      :aria-busy="loading ? 'true' : 'false'"
    >
      <h2 class="content__heading">
        {{ t('cms.content.typesTitle') }}
      </h2>
      <ul
        class="content__list"
        data-test="content-types"
      >
        <li
          v-for="row in types"
          :key="row.key"
          class="content__row"
        >
          <NuxtLink
            :to="`/admin/content/${row.key}`"
            class="content__main"
          >
            <span class="content__title">{{ contentLabel(row.type.label, locale) }} <span class="content__count">({{ row.total }})</span></span>
          </NuxtLink>
          <span class="content__meta">{{ row.updatedAt ? t('cms.pages.updated', { date: when(row.updatedAt) }) : '' }}</span>
          <AdminButton
            :to="`/admin/content/${row.key}`"
            variant="secondary"
            size="sm"
          >
            {{ t('cms.pages.manage') }}
          </AdminButton>
          <!-- Its own column: every create button as wide as the widest. -->
          <AdminButton
            v-if="can('pages.edit')"
            variant="primary"
            size="sm"
            class="content__new"
            data-test="types-new"
            @click="create(row.type)"
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

    <EntryDialog
      v-if="creating?.fields"
      :key="dialogKey"
      v-model:open="dialogOpen"
      :title="dialogTitle"
      :type="creating.key"
      :entry-id="null"
      :fields="creating.fields"
      @created="created = true"
      @title="createdTitle = $event"
    />
  </AdminShell>
</template>

<style scoped>
.content {
  display: grid;
  gap: var(--cms-space-3);
}

.content__heading {
  margin: 0;
  font-size: var(--cms-type-h4-size);
  font-weight: var(--cms-type-h4-weight);
  line-height: var(--cms-type-h4-line);
}

.content__empty {
  margin: 0;
  color: var(--cms-text-secondary);
}

.content__list {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content max-content max-content;
  margin: 0;
  padding: 0;
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-lg);
  background: var(--cms-card);
  list-style: none;
}

/* One set of columns for all rows (subgrid): name, date, Manage, create;
   the buttons line up, every create button as wide as the widest. */
.content__row {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
  align-items: center;
  column-gap: var(--cms-space-2);
  padding: var(--cms-space-3) var(--cms-space-4);
}

.content__new {
  width: 100%;
}

.content__row + .content__row {
  border-top: var(--cms-border-width) solid var(--cms-border-subtle);
}

.content__main {
  display: grid;
  flex: 1 1 240px;
  gap: var(--cms-space-1);
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.content__main:hover .content__title {
  text-decoration: underline;
}

.content__main:focus-visible {
  outline: none;
  box-shadow: var(--cms-focus-ring);
}

/* A long name ends in "…" on one line. */
.content__title {
  overflow: hidden;
  font-size: var(--cms-type-body-size);
  font-weight: 600;
  line-height: var(--cms-type-body-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.content__meta {
  margin-inline-end: var(--cms-space-4);
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
  line-height: var(--cms-type-body-small-line);
}

.content__count {
  color: var(--cms-text-secondary);
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}


/* A phone: the name on its own line, the rest under it. */
@media (max-width: 767px) {
  .content__list {
    display: block;
  }

  .content__row {
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--cms-space-2) var(--cms-space-3);
  }

  .content__main,
  .content__meta {
    grid-column: 1 / -1;
  }
}
</style>
