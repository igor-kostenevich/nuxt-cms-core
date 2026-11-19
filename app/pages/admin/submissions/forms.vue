<script setup lang="ts">
import { adminErrorKey } from '../../../admin/error-key'
import { formName, pageNames } from '../../../admin/forms-view'
import { useAdminFormsOverview, useAdminFormTexts } from '../../../admin/useAdminForms'
import { useAdminI18n } from '../../../admin/useAdminI18n'
import { useAdminToast } from '../../../admin/useAdminToast'

definePageMeta({
  layout: false,
  middleware: ['cms-auth'],
})

// Manage forms (011): the forms the site code declares, with their numbers.
// The one action is to stop and resume taking messages, without a deploy.
// Fields and rules belong to the code and are not shown here: there is
// nothing to do with them in the admin (their labels are site texts). Forms gone from the code stay listed
// while they have submissions.
const { t, locale: adminLocale } = useAdminI18n()
const { can } = usePermissions()
const toasts = useAdminToast()

const canView = computed(() => can('forms.view'))
const canManage = computed(() => can('forms.manage'))

const { text, ready: textsReady } = useAdminFormTexts()
const { overview, error, ready, setEnabled } = useAdminFormsOverview(canView)
const { languages, ready: languagesReady } = useCmsLanguages()

await Promise.all([textsReady, languagesReady, canView.value ? ready : Promise.resolve()])

function sources(paths: string[]) {
  return pageNames(paths, languages.value.map(language => language.code), t('cms.submissions.homePage')).join(', ')
}

const dateFormat = computed(() => new Intl.DateTimeFormat(adminLocale.value, { dateStyle: 'medium' }))
const pending = reactive<Record<string, boolean>>({})
const confirmOff = ref<string | null>(null)

const confirmOpen = computed({
  get: () => confirmOff.value !== null,
  set: (open) => {
    if (!open) {
      confirmOff.value = null
    }
  },
})

async function apply(key: string, enabled: boolean) {
  pending[key] = true

  try {
    await setEnabled(key, enabled)
    toasts.toast(t(enabled ? 'cms.submissions.forms.turnedOn' : 'cms.submissions.forms.turnedOff', { name: formName(key, text) }), {
      tone: enabled ? 'success' : 'neutral',
    })
  } catch (cause) {
    toasts.toast(t(adminErrorKey(cause)), { tone: 'error' })
  } finally {
    pending[key] = false
  }
}

/** Turning on is immediate; turning off asks first. */
function toggle(key: string, enabled: boolean) {
  if (enabled) {
    void apply(key, true)
  } else {
    confirmOff.value = key
  }
}

async function turnOff() {
  const key = confirmOff.value

  if (key) {
    confirmOff.value = null
    await apply(key, false)
  }
}
</script>

<template>
  <AdminShell :title="t('cms.submissions.forms.title')">
    <AdminAlert
      v-if="!canView"
      tone="info"
      :title="t('cms.submissions.noAccess')"
    />

    <div
      v-else
      class="forms"
    >
      <NuxtLink
        to="/admin/submissions"
        class="forms__back"
      >
        <Icon
          name="lucide:arrow-left"
          aria-hidden="true"
        />
        {{ t('cms.submissions.forms.back') }}
      </NuxtLink>

      <p class="forms__hint">
        {{ t('cms.submissions.forms.hint') }}
      </p>

      <AdminAlert
        v-if="error"
        tone="danger"
        :title="t(adminErrorKey(error))"
      />

      <section
        v-if="overview.length === 0"
        class="forms__empty"
      >
        <h2 class="forms__empty-title">
          {{ t('cms.submissions.noForms.title') }}
        </h2>
        <p class="forms__muted">
          {{ t('cms.submissions.noForms.body') }}
        </p>
      </section>

      <ul
        v-else
        class="forms__list"
      >
        <li
          v-for="entry in overview"
          :key="entry.key"
          class="form-card"
        >
          <div class="form-card__head">
            <div class="form-card__title-wrap">
              <h2 class="form-card__title">
                {{ formName(entry.key, text) }}
              </h2>
            </div>
            <AdminSwitch
              v-if="entry.form"
              :model-value="entry.enabled"
              :label="t('cms.submissions.forms.accepting')"
              :disabled="!canManage || pending[entry.key]"
              @update:model-value="toggle(entry.key, $event)"
            />
            <span
              v-else
              class="form-card__removed"
            >{{ t('cms.submissions.forms.removed') }}</span>
          </div>

          <p
            v-if="!entry.form"
            class="forms__muted"
          >
            {{ t('cms.submissions.forms.removedHint') }}
          </p>

          <dl class="form-card__facts">
            <div>
              <dt>{{ t('cms.submissions.forms.sources') }}</dt>
              <dd>
                <span
                  v-if="entry.stats.sources.length > 0"
                  :title="entry.stats.sources.join(', ')"
                >{{ sources(entry.stats.sources) }}</span>
                <span
                  v-else
                  class="forms__muted"
                >{{ t('cms.submissions.forms.noSubmissions') }}</span>
              </dd>
            </div>
          </dl>

          <div class="form-card__foot">
            <span class="forms__muted">
              {{ t('cms.submissions.forms.total', { count: entry.stats.total }) }}<template v-if="entry.stats.unread > 0"> · {{ t('cms.submissions.forms.unread', { count: entry.stats.unread }) }}</template><template v-if="entry.stats.lastAt"> · {{ t('cms.submissions.forms.last', { date: dateFormat.format(new Date(entry.stats.lastAt)) }) }}</template>
            </span>
            <AdminButton
              v-if="entry.stats.total > 0"
              :to="`/admin/submissions?form=${encodeURIComponent(entry.key)}`"
              variant="ghost"
              size="sm"
            >
              {{ t('cms.submissions.forms.view') }}
            </AdminButton>
          </div>
        </li>
      </ul>
    </div>

    <AdminDialog
      v-model:open="confirmOpen"
      :title="t('cms.submissions.forms.offTitle', { name: confirmOff ? formName(confirmOff, text) : '' })"
    >
      <p class="forms__dialog-text">
        {{ t('cms.submissions.forms.offBody') }}
      </p>
      <template #footer>
        <AdminButton
          type="button"
          variant="ghost"
          @click="confirmOff = null"
        >
          {{ t('cms.common.cancel') }}
        </AdminButton>
        <AdminButton
          type="button"
          variant="destructive"
          @click="turnOff"
        >
          {{ t('cms.submissions.forms.offConfirm') }}
        </AdminButton>
      </template>
    </AdminDialog>
  </AdminShell>
</template>

<style scoped>
.forms {
  display: grid;
  gap: var(--cms-space-4);
  max-width: 960px;
}

.forms__back {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: var(--cms-space-1);
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-label-size);
  text-decoration: none;
}

.forms__back:hover {
  color: var(--cms-foreground);
}

.forms__back:focus-visible {
  outline: none;
  box-shadow: var(--cms-focus-ring);
}

.forms__hint,
.forms__dialog-text {
  margin: 0;
}

.forms__hint {
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
}

.forms__muted {
  margin: 0;
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
}

.forms__empty {
  display: grid;
  justify-items: center;
  gap: var(--cms-space-2);
  padding: var(--cms-space-10) var(--cms-space-4);
  border: var(--cms-border-width) dashed var(--cms-border);
  border-radius: var(--cms-radius-lg);
  text-align: center;
}

.forms__empty-title {
  margin: 0;
  font-size: var(--cms-type-h4-size);
  font-weight: var(--cms-type-h4-weight);
}

.forms__list {
  display: grid;
  gap: var(--cms-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.form-card {
  display: grid;
  gap: var(--cms-space-3);
  padding: var(--cms-space-4);
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-lg);
  background: var(--cms-card);
}

.form-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cms-space-3);
}

.form-card__title-wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--cms-space-2);
  min-width: 0;
}

.form-card__title {
  margin: 0;
  font-size: var(--cms-type-h4-size);
  font-weight: var(--cms-type-h4-weight);
  line-height: var(--cms-type-h4-line);
}

.form-card__removed {
  padding: 0 var(--cms-space-2);
  border-radius: var(--cms-radius-full);
  background: var(--cms-surface-secondary);
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-label-small-size);
  line-height: var(--cms-space-6);
}

.form-card__facts {
  display: grid;
  gap: var(--cms-space-2);
  margin: 0;
}

.form-card__facts > div {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  gap: var(--cms-space-3);
}

.form-card__facts dt {
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
}

.form-card__facts dd {
  margin: 0;
  font-size: var(--cms-type-body-small-size);
  overflow-wrap: anywhere;
}

.form-card__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cms-space-2);
}

@media (max-width: 767px) {
  .form-card__facts > div {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }
}
</style>
