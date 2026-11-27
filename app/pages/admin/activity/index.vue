<script setup lang="ts">
import { cmsContent } from '#cms/content'
import { describeActivity, groupByDay, submissionForm } from '../../../admin/activity-view'
import { contentLabel } from '../../../admin/content-label'
import { adminErrorKey } from '../../../admin/error-key'
import { formName } from '../../../admin/forms-view'
import { useAdminActivity } from '../../../admin/useAdminActivity'
import { useAdminFormTexts } from '../../../admin/useAdminForms'
import { useAdminI18n } from '../../../admin/useAdminI18n'
import { CMS_ACTIVITY_CATEGORIES, type CmsActivityCategory } from '../../../types/activity'

definePageMeta({
  layout: false,
  middleware: ['cms-auth'],
})

// Activity (012): who did what in the CMS, newest first. The category is in
// the URL; "Show more" appends older events. Read-only.
const { t, locale: adminLocale } = useAdminI18n()
const { can } = usePermissions()
const route = useRoute()

const canView = computed(() => can('activity.view'))

const category = computed<CmsActivityCategory>(() => {
  const value = route.query.category
  return typeof value === 'string' && (CMS_ACTIVITY_CATEGORIES as readonly string[]).includes(value)
    ? value as CmsActivityCategory
    : 'all'
})

const log = useAdminActivity(category, canView)
const { text, ready: textsReady } = useAdminFormTexts()
const { languages, ready: languagesReady } = useCmsLanguages()

await Promise.all([textsReady, languagesReady, canView.value ? log.ready : Promise.resolve()])

const languageCodes = computed(() => languages.value.map(language => language.code))
const multilingual = computed(() => languages.value.length > 1)

// The server does not know the viewer's time zone. The server render and
// hydration both use UTC, so they agree whatever the zones of the server and
// the browser; after mount the times and days switch to the browser's zone.
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})
const timeZone = computed(() => (mounted.value ? undefined : 'UTC'))

const timeFormat = computed(() => new Intl.DateTimeFormat(adminLocale.value, { hour: '2-digit', minute: '2-digit', timeZone: timeZone.value }))
const fullFormat = computed(() => new Intl.DateTimeFormat(adminLocale.value, { dateStyle: 'long', timeStyle: 'short', timeZone: timeZone.value }))
const dayFormat = computed(() => new Intl.DateTimeFormat(adminLocale.value, { day: 'numeric', month: 'long', timeZone: timeZone.value }))
const dayYearFormat = computed(() => new Intl.DateTimeFormat(adminLocale.value, { day: 'numeric', month: 'long', year: 'numeric', timeZone: timeZone.value }))

// Types of cms.content.ts: names and editors of entry events (014).
const entryTypes = computed(() => new Map(cmsContent.types.map(type => [type.key, { label: contentLabel(type.label, adminLocale.value), route: type.route }])))

const rows = computed(() => log.items.value.map((event) => {
  const { title, link } = describeActivity(event, {
    t,
    can,
    editPaths: log.editPaths.value,
    existingSubmissions: log.existingSubmissions.value,
    languageCodes: languageCodes.value,
    formName: key => formName(key, text),
    entryTypes: entryTypes.value,
  })
  const form = submissionForm(event)
  const date = new Date(event.createdAt)

  return {
    id: event.id,
    createdAt: event.createdAt,
    title,
    link,
    actor: event.actorEmail ?? t('cms.activity.system'),
    meta: [
      multilingual.value && event.locale ? event.locale.toUpperCase() : null,
      form ? formName(form, text) : null,
    ].filter(Boolean).join(' · '),
    time: timeFormat.value.format(date),
    fullTime: fullFormat.value.format(date),
  }
}))

const days = computed(() => {
  const now = new Date()
  const utc = !mounted.value
  const year = (date: Date) => (utc ? date.getUTCFullYear() : date.getFullYear())
  return groupByDay(rows.value, now, {
    today: t('cms.activity.today'),
    yesterday: t('cms.activity.yesterday'),
    date: date => (year(date) === year(now) ? dayFormat.value : dayYearFormat.value).format(date),
  }, { utc })
})
</script>

<template>
  <AdminShell :title="t('cms.activity.title')">
    <AdminAlert
      v-if="!canView"
      tone="info"
      :title="t('cms.activity.noAccess')"
    />

    <div
      v-else
      class="activity"
    >
      <p class="activity__intro">
        {{ t('cms.activity.intro') }}
      </p>

      <nav
        class="activity__tabs"
        :aria-label="t('cms.activity.categoriesLabel')"
      >
        <NuxtLink
          v-for="item in CMS_ACTIVITY_CATEGORIES"
          :key="item"
          :to="{ query: item === 'all' ? {} : { category: item } }"
          class="activity__tab"
          :aria-current="category === item ? 'page' : undefined"
          replace
        >
          {{ t(`cms.activity.categories.${item}`) }}
        </NuxtLink>
      </nav>

      <AdminAlert
        v-if="log.error.value"
        tone="danger"
        :title="t(adminErrorKey(log.error.value))"
      />

      <p
        v-else-if="log.pending.value && rows.length === 0"
        class="activity__status"
        role="status"
      >
        {{ t('cms.activity.loading') }}
      </p>

      <section
        v-else-if="rows.length === 0"
        class="activity-empty"
      >
        <Icon
          name="lucide:activity"
          class="activity-empty__icon"
          aria-hidden="true"
        />
        <h2 class="activity-empty__title">
          {{ category === 'all' ? t('cms.activity.empty.all') : t('cms.activity.empty.category') }}
        </h2>
        <p class="activity-empty__body">
          {{ t('cms.activity.empty.body') }}
        </p>
      </section>

      <template v-else>
        <section
          v-for="day in days"
          :key="day.key"
          class="activity__day"
          :aria-labelledby="`activity-day-${day.key}`"
        >
          <h2
            :id="`activity-day-${day.key}`"
            class="activity__day-title"
          >
            {{ day.label }}
          </h2>
          <ul class="activity__list">
            <li
              v-for="row in day.items"
              :key="row.id"
              class="activity__row"
            >
              <span class="activity__head">
                <NuxtLink
                  v-if="row.link"
                  :to="row.link"
                  class="activity__title activity__title--link"
                >{{ row.title }}</NuxtLink>
                <span
                  v-else
                  class="activity__title"
                >{{ row.title }}</span>
                <time
                  class="activity__time"
                  :datetime="row.createdAt"
                  :title="row.fullTime"
                >{{ row.time }}</time>
              </span>
              <span class="activity__meta">
                <span class="activity__actor">{{ row.actor }}</span>
                <template v-if="row.meta">
                  · {{ row.meta }}
                </template>
              </span>
            </li>
          </ul>
        </section>

        <AdminAlert
          v-if="log.moreError.value"
          tone="danger"
          :title="t(adminErrorKey(log.moreError.value))"
        />

        <div
          v-if="log.hasMore.value"
          class="activity__more"
        >
          <AdminButton
            type="button"
            variant="secondary"
            size="md"
            :loading="log.loadingMore.value"
            :disabled="log.loadingMore.value"
            @click="log.loadMore()"
          >
            {{ t('cms.activity.showMore') }}
          </AdminButton>
        </div>
      </template>
    </div>
  </AdminShell>
</template>

<style scoped>
.activity {
  display: grid;
  gap: var(--cms-space-4);
  max-width: 960px;
}

.activity__intro {
  margin: 0;
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
  line-height: var(--cms-type-body-small-line);
}

.activity__tabs {
  display: flex;
  gap: var(--cms-space-1);
  min-width: 0;
  overflow-x: auto;
}

.activity__tab {
  padding: var(--cms-space-2) var(--cms-space-3);
  border-radius: var(--cms-radius-md);
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-label-size);
  font-weight: var(--cms-type-label-weight);
  line-height: var(--cms-type-label-line);
  text-decoration: none;
  white-space: nowrap;
}

.activity__tab:hover {
  background: var(--cms-surface-hover);
  color: var(--cms-foreground);
}

.activity__tab[aria-current="page"] {
  background: var(--cms-surface-selected);
  color: var(--cms-foreground);
}

.activity__tab:focus-visible,
.activity__title--link:focus-visible {
  outline: none;
  box-shadow: var(--cms-focus-ring);
}

.activity__status {
  margin: 0;
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
}

.activity__day {
  display: grid;
  gap: var(--cms-space-2);
}

.activity__day-title {
  margin: 0;
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-label-size);
  font-weight: var(--cms-type-label-weight);
  line-height: var(--cms-type-label-line);
}

.activity__list {
  margin: 0;
  padding: 0;
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-lg);
  background: var(--cms-card);
  list-style: none;
}

.activity__row {
  display: grid;
  gap: var(--cms-space-1);
  padding: var(--cms-space-3) var(--cms-space-4);
}

.activity__row + .activity__row {
  border-top: var(--cms-border-width) solid var(--cms-border-subtle);
}

.activity__head {
  display: flex;
  align-items: baseline;
  gap: var(--cms-space-2);
  min-width: 0;
}

.activity__title {
  flex: 1;
  min-width: 0;
  font-size: var(--cms-type-body-size);
  line-height: var(--cms-type-body-line);
  overflow-wrap: anywhere;
}

.activity__title--link {
  border-radius: var(--cms-radius-sm);
  color: inherit;
  text-decoration: none;
}

.activity__title--link:hover {
  text-decoration: underline;
}

.activity__time {
  flex: none;
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
  line-height: var(--cms-type-body-small-line);
}

.activity__meta {
  overflow: hidden;
  color: var(--cms-text-tertiary);
  font-size: var(--cms-type-helper-size);
  line-height: var(--cms-type-helper-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity__more {
  display: flex;
  justify-content: center;
}

.activity-empty {
  display: grid;
  justify-items: center;
  gap: var(--cms-space-2);
  padding: var(--cms-space-10) var(--cms-space-4);
  border: var(--cms-border-width) dashed var(--cms-border);
  border-radius: var(--cms-radius-lg);
  text-align: center;
}

.activity-empty__icon {
  width: var(--cms-space-8);
  height: var(--cms-space-8);
  color: var(--cms-text-tertiary);
}

.activity-empty__title {
  margin: 0;
  font-size: var(--cms-type-h4-size);
  font-weight: var(--cms-type-h4-weight);
  line-height: var(--cms-type-h4-line);
}

.activity-empty__body {
  max-width: 420px;
  margin: 0;
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
  line-height: var(--cms-type-body-small-line);
}

@media (max-width: 767px) {
  .activity__row {
    padding: var(--cms-space-3);
  }
}
</style>
