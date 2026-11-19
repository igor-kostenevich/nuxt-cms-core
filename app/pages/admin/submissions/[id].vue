<script setup lang="ts">
import { adminErrorKey } from '../../../admin/error-key'
import { formName, pageName, submissionContacts, submissionFields, submissionPreview } from '../../../admin/forms-view'
import { displayName } from '../../../admin/languages'
import { adminForms, useAdminFormTexts, useAdminSubmission } from '../../../admin/useAdminForms'
import { useAdminI18n } from '../../../admin/useAdminI18n'
import { useAdminToast } from '../../../admin/useAdminToast'
import type { AdminMenuItem } from '../../../components/admin/AdminMenu.vue'
import type { CmsSubmissionLocation } from '../../../types/forms'

definePageMeta({
  layout: false,
  middleware: ['cms-auth'],
})

// One submission (011): who and how to reach them first, then what they
// wrote, then the rest of the answers and where it came from. Values are
// untrusted input and render as text; contact links are built from checked
// values with fixed schemes (forms-view.ts). Opening it marks it read.
const { t, locale: adminLocale } = useAdminI18n()
const { can } = usePermissions()
const toasts = useAdminToast()
const route = useRoute()

const canView = computed(() => can('forms.view'))
const canManage = computed(() => can('forms.manage'))

const LOCATIONS: CmsSubmissionLocation[] = ['inbox', 'archived', 'spam']
const id = computed(() => String(route.params.id ?? ''))
const from = computed(() => {
  const location = route.query.location as CmsSubmissionLocation
  const form = route.query.form
  return {
    location: LOCATIONS.includes(location) ? location : 'inbox' as CmsSubmissionLocation,
    formKey: typeof form === 'string' && form ? form : null,
  }
})

const { text, ready: textsReady } = useAdminFormTexts()
const item = useAdminSubmission(id, from, canView)
const { languages, ready: languagesReady } = useCmsLanguages()

await Promise.all([textsReady, languagesReady, canView.value ? item.ready : Promise.resolve()])

const page = computed(() => pageName(submission.value?.pagePath ?? null, languages.value.map(language => language.code), t('cms.submissions.homePage')))

const submission = item.submission
const form = computed(() => (submission.value ? adminForms.get(submission.value.formKey) : undefined))
const words = computed(() => ({ yes: t('cms.submissions.yes'), no: t('cms.submissions.no') }))

const preview = computed(() => (submission.value ? submissionPreview(submission.value, form.value) : null))
const contacts = computed(() => (submission.value ? submissionContacts(submission.value, form.value) : {}))
const fields = computed(() => (submission.value ? submissionFields(submission.value, form.value, text, words.value) : []))
const message = computed(() => fields.value.find(field => field.role === 'message'))
// Shown above as the title, contacts or the message; the rest is listed as answers.
const answers = computed(() => fields.value.filter(field =>
  field.role !== 'message'
  && !(field.role === 'name' && field.value === preview.value?.title)
  && !(field.role === 'email' && contacts.value.email)
  && !(field.role === 'phone' && contacts.value.phone)))

const sentAt = computed(() => (submission.value
  ? new Intl.DateTimeFormat(adminLocale.value, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(submission.value.createdAt))
  : ''))

function listLink(extra: Record<string, string> = {}) {
  const query: Record<string, string> = { ...extra }

  if (from.value.location !== 'inbox') {
    query.location = from.value.location
  }

  if (from.value.formKey) {
    query.form = from.value.formKey
  }

  return { path: '/admin/submissions', query }
}

function neighbourHref(neighbour: string) {
  const query = new URLSearchParams(listLink().query).toString()
  return `/admin/submissions/${neighbour}${query ? `?${query}` : ''}`
}

function fail(cause: unknown) {
  toasts.toast(t(adminErrorKey(cause)), { tone: 'error' })
}

// Opening marks it read (once, in the browser).
onMounted(() => {
  if (canManage.value && submission.value && submission.value.readAt === null) {
    item.setRead(true).catch(fail)
  }
})

watch(id, () => {
  if (canManage.value && submission.value && submission.value.readAt === null) {
    item.setRead(true).catch(fail)
  }
})

async function move(to: CmsSubmissionLocation) {
  const before = submission.value?.location ?? 'inbox'

  try {
    await item.setLocation(to)
    const key = to === 'archived' ? 'cms.submissions.archived' : to === 'spam' ? 'cms.submissions.movedToSpam' : 'cms.submissions.movedToInbox'
    toasts.toast(t(key, { count: 1 }), {
      action: { label: t('cms.submissions.undo'), run: () => void item.setLocation(before).catch(fail) },
    })
  } catch (cause) {
    fail(cause)
  }
}

const confirmDelete = ref(false)
const deleting = ref(false)

async function remove() {
  deleting.value = true

  try {
    await item.remove()
    confirmDelete.value = false
    toasts.toast(t('cms.submissions.deleted'))
    await navigateTo(listLink())
  } catch (cause) {
    fail(cause)
  } finally {
    deleting.value = false
  }
}

const menuItems = computed<AdminMenuItem[]>(() => {
  const current = submission.value

  if (!current || !canManage.value) {
    return []
  }

  return [
    current.readAt
      ? { key: 'unread', label: t('cms.submissions.markUnread'), icon: 'lucide:mail' }
      : { key: 'read', label: t('cms.submissions.markRead'), icon: 'lucide:mail-open' },
    current.location === 'spam'
      ? { key: 'inbox', label: t('cms.submissions.notSpam'), icon: 'lucide:inbox' }
      : { key: 'spam', label: t('cms.submissions.spam'), icon: 'lucide:shield-alert' },
    { key: 'delete', label: t('cms.submissions.delete'), icon: 'lucide:trash-2', danger: true },
  ]
})

function onMenu(key: string) {
  if (key === 'read' || key === 'unread') {
    item.setRead(key === 'read').catch(fail)
  } else if (key === 'spam' || key === 'inbox') {
    void move(key)
  } else if (key === 'delete') {
    confirmDelete.value = true
  }
}

async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    toasts.toast(t('cms.submissions.copied'))
  } catch (cause) {
    fail(cause)
  }
}

function languageName(code: string) {
  return displayName(code, adminLocale.value) ?? code
}
</script>

<template>
  <AdminShell :title="t('cms.submissions.title')">
    <AdminAlert
      v-if="!canView"
      tone="info"
      :title="t('cms.submissions.noAccess')"
    />

    <div
      v-else
      class="submission"
    >
      <NuxtLink
        :to="listLink()"
        class="submission__back"
      >
        <Icon
          name="lucide:arrow-left"
          aria-hidden="true"
        />
        {{ t('cms.submissions.back') }}
      </NuxtLink>

      <AdminAlert
        v-if="item.error.value"
        tone="danger"
        :title="t(adminErrorKey(item.error.value))"
      />
      <AdminAlert
        v-else-if="!submission"
        tone="info"
        :title="t('cms.submissions.notFound')"
      />

      <template v-else>
        <header class="submission__head">
          <div class="submission__heading">
            <h2 class="submission__title">
              {{ preview?.title || t('cms.submissions.noName') }}
            </h2>
            <p class="submission__sub">
              {{ formName(submission.formKey, text) }} · <time :datetime="submission.createdAt">{{ sentAt }}</time>
            </p>
          </div>
          <div
            v-if="canManage"
            class="submission__actions"
          >
            <AdminButton
              v-if="submission.location !== 'archived'"
              type="button"
              variant="secondary"
              size="sm"
              @click="move('archived')"
            >
              <Icon
                name="lucide:archive"
                aria-hidden="true"
              />
              {{ t('cms.submissions.archive') }}
            </AdminButton>
            <AdminButton
              v-else
              type="button"
              variant="secondary"
              size="sm"
              @click="move('inbox')"
            >
              <Icon
                name="lucide:inbox"
                aria-hidden="true"
              />
              {{ t('cms.submissions.toInbox') }}
            </AdminButton>
            <AdminMenu
              :label="t('cms.submissions.moreActions')"
              :items="menuItems"
              @select="onMenu"
            />
          </div>
        </header>

        <div class="submission__body">
          <div class="submission__main">
            <section
              v-if="contacts.email || contacts.phone"
              class="submission__card"
              :aria-label="t('cms.submissions.contacts')"
            >
              <h3 class="submission__label">
                {{ t('cms.submissions.contacts') }}
              </h3>
              <div
                v-if="contacts.email"
                class="contact"
              >
                <span class="contact__value">{{ contacts.email.value }}</span>
                <div class="contact__actions">
                  <AdminButton
                    :to="contacts.email.mailto"
                    variant="secondary"
                    size="sm"
                  >
                    <Icon
                      name="lucide:mail"
                      aria-hidden="true"
                    />
                    {{ t('cms.submissions.write') }}
                  </AdminButton>
                  <AdminButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon-only
                    :aria-label="t('cms.submissions.copy', { name: contacts.email.value })"
                    @click="copy(contacts.email.value)"
                  >
                    <Icon
                      name="lucide:copy"
                      aria-hidden="true"
                    />
                  </AdminButton>
                </div>
              </div>
              <div
                v-if="contacts.phone"
                class="contact"
              >
                <span class="contact__value">{{ contacts.phone.value }}</span>
                <div class="contact__actions">
                  <AdminButton
                    :to="contacts.phone.tel"
                    variant="secondary"
                    size="sm"
                  >
                    <Icon
                      name="lucide:phone"
                      aria-hidden="true"
                    />
                    {{ t('cms.submissions.call') }}
                  </AdminButton>
                  <AdminButton
                    :to="contacts.phone.whatsapp"
                    variant="ghost"
                    size="sm"
                  >
                    {{ t('cms.submissions.whatsapp') }}
                  </AdminButton>
                  <AdminButton
                    :to="contacts.phone.viber"
                    variant="ghost"
                    size="sm"
                  >
                    {{ t('cms.submissions.viber') }}
                  </AdminButton>
                  <AdminButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon-only
                    :aria-label="t('cms.submissions.copy', { name: contacts.phone.value })"
                    @click="copy(contacts.phone.value)"
                  >
                    <Icon
                      name="lucide:copy"
                      aria-hidden="true"
                    />
                  </AdminButton>
                </div>
              </div>
            </section>

            <section
              v-if="message"
              class="submission__card"
            >
              <h3 class="submission__label">
                {{ message.label }}
              </h3>
              <p class="submission__message">
                {{ message.value }}
              </p>
            </section>

            <section
              v-if="answers.length > 0"
              class="submission__card"
            >
              <h3 class="submission__label">
                {{ t('cms.submissions.fields') }}
              </h3>
              <dl class="answers">
                <div
                  v-for="field in answers"
                  :key="field.key"
                  class="answers__row"
                >
                  <dt
                    class="answers__term"
                    :title="field.historical ? t('cms.submissions.historical') : undefined"
                  >
                    {{ field.label }}
                    <Icon
                      v-if="field.historical"
                      name="lucide:history"
                      class="answers__historical"
                      :aria-label="t('cms.submissions.historical')"
                    />
                  </dt>
                  <dd class="answers__value">
                    {{ field.value }}
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          <aside
            class="submission__card submission__info"
            :aria-label="t('cms.submissions.about')"
          >
            <h3 class="submission__label">
              {{ t('cms.submissions.about') }}
            </h3>
            <dl class="answers answers--compact">
              <div class="answers__row">
                <dt class="answers__term">
                  {{ t('cms.submissions.formLabel') }}
                </dt>
                <dd class="answers__value">
                  {{ formName(submission.formKey, text) }}
                </dd>
              </div>
              <div
                v-if="submission.pagePath"
                class="answers__row"
              >
                <dt class="answers__term">
                  {{ t('cms.submissions.page') }}
                </dt>
                <dd
                  class="answers__value"
                  :title="submission.pagePath"
                >
                  {{ page }}
                </dd>
              </div>
              <div
                v-if="submission.locale"
                class="answers__row"
              >
                <dt class="answers__term">
                  {{ t('cms.submissions.language') }}
                </dt>
                <dd class="answers__value">
                  {{ languageName(submission.locale) }}
                </dd>
              </div>
              <div class="answers__row">
                <dt class="answers__term">
                  {{ t('cms.submissions.sent') }}
                </dt>
                <dd class="answers__value">
                  {{ sentAt }}
                </dd>
              </div>
              <div class="answers__row">
                <dt class="answers__term">
                  {{ t('cms.submissions.status') }}
                </dt>
                <dd class="answers__value">
                  {{ t(`cms.submissions.tabs.${submission.location}`) }}
                </dd>
              </div>
            </dl>
          </aside>
        </div>

        <nav
          class="submission__neighbours"
          :aria-label="t('cms.submissions.neighbours')"
        >
          <AdminButton
            v-if="item.neighbours.value.newer"
            :to="neighbourHref(item.neighbours.value.newer)"
            variant="ghost"
            size="sm"
          >
            <Icon
              name="lucide:chevron-left"
              aria-hidden="true"
            />
            {{ t('cms.submissions.newer') }}
          </AdminButton>
          <AdminButton
            v-if="item.neighbours.value.older"
            class="submission__older"
            :to="neighbourHref(item.neighbours.value.older)"
            variant="ghost"
            size="sm"
          >
            {{ t('cms.submissions.older') }}
            <Icon
              name="lucide:chevron-right"
              aria-hidden="true"
            />
          </AdminButton>
        </nav>
      </template>
    </div>

    <AdminDialog
      v-model:open="confirmDelete"
      :title="t('cms.submissions.deleteTitle')"
    >
      <p class="submission__dialog-text">
        {{ t('cms.submissions.deleteBody') }}
      </p>
      <template #footer>
        <AdminButton
          type="button"
          variant="ghost"
          @click="confirmDelete = false"
        >
          {{ t('cms.common.cancel') }}
        </AdminButton>
        <AdminButton
          type="button"
          variant="destructive"
          :loading="deleting"
          @click="remove"
        >
          {{ t('cms.submissions.deleteConfirm') }}
        </AdminButton>
      </template>
    </AdminDialog>
  </AdminShell>
</template>

<style scoped>
.submission {
  display: grid;
  gap: var(--cms-space-4);
  max-width: 960px;
}

.submission__back {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: var(--cms-space-1);
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-label-size);
  text-decoration: none;
}

.submission__back:hover {
  color: var(--cms-foreground);
}

.submission__back:focus-visible {
  outline: none;
  box-shadow: var(--cms-focus-ring);
}

.submission__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cms-space-3);
}

.submission__heading {
  min-width: 0;
}

.submission__title {
  margin: 0;
  font-size: var(--cms-type-h2-size);
  font-weight: var(--cms-type-h2-weight);
  line-height: var(--cms-type-h2-line);
  overflow-wrap: anywhere;
}

.submission__sub {
  margin: var(--cms-space-1) 0 0;
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
}

.submission__actions {
  display: flex;
  align-items: center;
  gap: var(--cms-space-2);
}

.submission__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  align-items: start;
  gap: var(--cms-space-4);
}

.submission__main {
  display: grid;
  gap: var(--cms-space-4);
  min-width: 0;
}

.submission__card {
  display: grid;
  gap: var(--cms-space-3);
  padding: var(--cms-space-4);
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-lg);
  background: var(--cms-card);
}

.submission__label {
  margin: 0;
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-label-small-size);
  font-weight: var(--cms-type-label-small-weight);
  line-height: var(--cms-type-label-small-line);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.contact {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cms-space-2);
}

.contact__value {
  min-width: 0;
  font-size: var(--cms-type-body-size);
  overflow-wrap: anywhere;
}

.contact__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cms-space-1);
}

.submission__message {
  margin: 0;
  font-size: var(--cms-type-body-size);
  line-height: var(--cms-type-body-line);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.answers {
  display: grid;
  gap: var(--cms-space-3);
  margin: 0;
}

.answers__row {
  display: grid;
  grid-template-columns: minmax(120px, 200px) minmax(0, 1fr);
  gap: var(--cms-space-3);
}

.answers--compact .answers__row {
  grid-template-columns: 1fr;
  gap: 0;
}

.answers__term {
  display: flex;
  align-items: center;
  gap: var(--cms-space-1);
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
}

.answers__historical {
  color: var(--cms-text-tertiary);
}

.answers__value {
  margin: 0;
  font-size: var(--cms-type-body-size);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.answers--compact .answers__value {
  font-size: var(--cms-type-body-small-size);
}

.submission__neighbours {
  display: flex;
  gap: var(--cms-space-2);
}

.submission__older {
  margin-left: auto;
}

.submission__dialog-text {
  margin: 0;
}

@media (max-width: 767px) {
  .submission__body {
    grid-template-columns: minmax(0, 1fr);
  }

  .answers__row {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .contact {
    display: grid;
  }
}
</style>
