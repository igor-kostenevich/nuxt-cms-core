<script setup lang="ts">
import { useForm } from 'vee-validate'
import { adminErrorKey } from '../../../admin/error-key'
import { displayName } from '../../../admin/languages'
import { useAdminI18n } from '../../../admin/useAdminI18n'
import { useAdminValidation } from '../../../admin/useAdminValidation'
import { useAdminLanguages } from '../../../admin/useAdminLanguages'
import { useAdminSettings } from '../../../admin/useAdminSettings'

definePageMeta({
  // The Client Project's layouts frame the site, not the admin.
  layout: false,
  middleware: ['cms-auth'],
})

const { t, locale: adminLocale } = useAdminI18n()
const { can } = usePermissions()
const { required, email: emailRule, phone: phoneRule } = useAdminValidation()
const { settings, translations, error: loadError, save, saveTranslations, ready } = useAdminSettings()
// Every language, hidden ones included: a language being translated needs its site name too.
const { languages, defaultLanguage, ready: languagesReady } = useAdminLanguages()
const defaultLocale = computed(() => defaultLanguage.value.code)
const multilingual = computed(() => languages.value.length > 1)

await Promise.all([ready, languagesReady])

const canUpdate = computed(() => can('settings.update'))
const saving = ref(false)
const failure = ref('')
const current = settings.value

const saved = ref(false)

// The site name in the other active languages (C-82): only on a multilingual
// site. Empty shows the default language's name.
const otherLanguages = computed(() => languages.value.filter(language => language.code !== defaultLocale.value))
const siteNames = reactive<Record<string, string>>({})

function loadSiteNames() {
  for (const language of otherLanguages.value) {
    siteNames[language.code] = translations.value?.find(item => item.locale === language.code)?.siteName ?? ''
  }
}

loadSiteNames()

function languageLabel(code: string) {
  return displayName(code, adminLocale.value) ?? code
}

// The site name in other languages folds away: most of the time only the main
// name changes. The summary says how many are filled in.
const namesOpen = ref(false)
const namesFilled = computed(() => otherLanguages.value.filter(language => siteNames[language.code]?.trim()).length)

const { handleSubmit, defineField, errors, submitCount, resetForm } = useForm({
  initialValues: {
    siteName: current?.siteName ?? '',
    contactEmail: current?.contactEmail ?? '',
    contactPhone: current?.contactPhone ?? '',
    maintenanceMode: current?.maintenanceMode ?? false,
  },
  validationSchema: {
    siteName: required(),
    contactEmail: emailRule(),
    contactPhone: phoneRule(),
  },
})

const fieldOptions = () => ({
  validateOnBlur: submitCount.value > 0,
  validateOnChange: false,
  validateOnInput: false,
  validateOnModelUpdate: false,
})

const [siteName, siteNameProps] = defineField('siteName', fieldOptions)
const [contactEmail, contactEmailProps] = defineField('contactEmail', fieldOptions)
const [contactPhone, contactPhoneProps] = defineField('contactPhone', fieldOptions)
const [maintenanceMode] = defineField('maintenanceMode')

const onSubmit = handleSubmit(async (values) => {
  if (!canUpdate.value) {
    return
  }

  saving.value = true
  failure.value = ''
  saved.value = false

  try {
    const next = await save({
      siteName: values.siteName,
      contactEmail: values.contactEmail,
      contactPhone: values.contactPhone,
      maintenanceMode: values.maintenanceMode,
    })

    if (multilingual.value) {
      await saveTranslations(otherLanguages.value.map(language => ({
        locale: language.code,
        siteName: siteNames[language.code] ?? '',
      })))
      loadSiteNames()
    }

    // Show what was stored: trimmed text, blank contacts cleared.
    resetForm({
      values: {
        siteName: next.siteName,
        contactEmail: next.contactEmail ?? '',
        contactPhone: next.contactPhone ?? '',
        maintenanceMode: next.maintenanceMode,
      },
    })
    saved.value = true
  } catch (cause) {
    failure.value = t(adminErrorKey(cause))
  } finally {
    saving.value = false
  }
})
</script>

<template>
  <AdminSettingsLayout :title="t('cms.settings.nav.general')">
    <AdminAlert
      v-if="loadError"
      tone="danger"
      :title="t(adminErrorKey(loadError))"
    />

    <form
      v-else
      class="settings-card"
      novalidate
      @submit="onSubmit"
    >
      <AdminAlert
        v-if="!canUpdate"
        tone="info"
        :title="t('cms.settings.readOnly')"
      />
      <AdminAlert
        v-if="saved"
        tone="success"
        :title="t('cms.settings.saved')"
        dismissible
        @dismiss="saved = false"
      />
      <AdminAlert
        v-if="failure"
        tone="danger"
        :title="failure"
      />

      <AdminInput
        v-model="siteName"
        v-bind="siteNameProps"
        :label="t('cms.settings.siteName')"
        :hint="multilingual ? t('cms.settings.siteNameDefaultHint', { language: languageLabel(defaultLocale) }) : undefined"
        :error="errors.siteName"
        :disabled="!canUpdate || saving"
        name="siteName"
        type="text"
        autocomplete="organization"
        required
      />
      <div
        v-if="multilingual"
        class="site-names"
      >
        <button
          type="button"
          class="site-names__toggle"
          :aria-expanded="namesOpen"
          aria-controls="site-names-list"
          @click="namesOpen = !namesOpen"
        >
          <Icon
            name="lucide:chevron-right"
            class="site-names__chevron"
            aria-hidden="true"
          />
          {{ t('cms.settings.siteNameOther') }}
          <span class="site-names__count">
            {{ t('cms.settings.siteNameFilled', { filled: namesFilled, total: otherLanguages.length }) }}
          </span>
        </button>
        <div
          v-show="namesOpen"
          id="site-names-list"
          class="site-names__list"
        >
          <p class="site-names__hint">
            {{ t('cms.settings.siteNameTranslationHint') }}
          </p>
          <AdminInput
            v-for="language in otherLanguages"
            :key="language.code"
            v-model="siteNames[language.code]"
            :label="languageLabel(language.code)"
            :placeholder="siteName"
            :disabled="!canUpdate || saving"
            :name="`siteName-${language.code}`"
            :lang="language.code"
            size="sm"
            type="text"
          />
        </div>
      </div>
      <AdminInput
        v-model="contactEmail"
        v-bind="contactEmailProps"
        :label="t('cms.settings.contactEmail')"
        :placeholder="t('cms.common.emailPlaceholder')"
        :error="errors.contactEmail"
        :disabled="!canUpdate || saving"
        name="contactEmail"
        type="email"
        autocomplete="email"
      />
      <AdminInput
        v-model="contactPhone"
        v-bind="contactPhoneProps"
        :label="t('cms.settings.contactPhone')"
        :error="errors.contactPhone"
        :disabled="!canUpdate || saving"
        name="contactPhone"
        type="tel"
        autocomplete="tel"
      />
      <AdminSwitch
        v-model="maintenanceMode"
        :label="t('cms.settings.maintenance')"
        :hint="t('cms.settings.maintenanceHint')"
        :disabled="!canUpdate || saving"
      />

      <AdminButton
        v-if="canUpdate"
        class="settings__save"
        type="submit"
        variant="primary"
        size="md"
        :loading="saving"
      >
        {{ t('cms.settings.save') }}
      </AdminButton>
    </form>
  </AdminSettingsLayout>
</template>

<style scoped>
.settings-card :deep(.settings__save) {
  align-self: flex-start;
}

.site-names {
  display: grid;
  gap: var(--cms-space-3);
  margin-top: calc(var(--cms-space-2) * -1);
}

.site-names__toggle {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: var(--cms-space-2);
  padding: var(--cms-space-1) 0;
  border: 0;
  background: transparent;
  color: var(--cms-primary);
  font: inherit;
  font-size: var(--cms-type-body-small-size);
  font-weight: var(--cms-type-label-weight);
  cursor: pointer;
}

.site-names__toggle:focus-visible {
  outline: none;
  border-radius: var(--cms-radius-sm);
  box-shadow: var(--cms-focus-ring);
}

.site-names__chevron {
  transition: transform 120ms ease;
}

.site-names__toggle[aria-expanded="true"] .site-names__chevron {
  transform: rotate(90deg);
}

.site-names__count {
  color: var(--cms-text-secondary);
  font-weight: normal;
}

.site-names__list {
  display: grid;
  gap: var(--cms-space-2);
  padding: var(--cms-space-3) var(--cms-space-4);
  border-radius: var(--cms-radius-md);
  background: var(--cms-surface-secondary);
}

.site-names__hint {
  margin: 0 0 var(--cms-space-1);
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-helper-size);
}

/* One row per language: the name on the left, the field on the right. */
.site-names__list :deep(.admin-input) {
  display: grid;
  grid-template-columns: minmax(8rem, 12rem) minmax(0, 1fr);
  align-items: center;
  gap: var(--cms-space-3);
}

.site-names__list :deep(.admin-input__label) {
  margin: 0;
}

@media (max-width: 600px) {
  .site-names__list :deep(.admin-input) {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--cms-space-1);
  }
}
</style>
