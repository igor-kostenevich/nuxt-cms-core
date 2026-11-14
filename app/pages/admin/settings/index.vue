<script setup lang="ts">
import { useForm } from 'vee-validate'
import { adminErrorKey } from '../../../admin/error-key'

definePageMeta({
  middleware: ['cms-auth'],
})

const { t } = useAdminI18n()
const { can } = usePermissions()
const { required, email: emailRule, phone: phoneRule } = useAdminValidation()
const { settings, error: loadError, save, ready } = useAdminSettings()

await ready

const canUpdate = computed(() => can('settings.update'))
const saving = ref(false)
const failure = ref('')
const current = settings.value

const { handleSubmit, defineField, errors, submitCount } = useForm({
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

  try {
    await save({
      siteName: values.siteName,
      contactEmail: values.contactEmail,
      contactPhone: values.contactPhone,
      maintenanceMode: values.maintenanceMode,
    })
  } catch (cause) {
    failure.value = t(adminErrorKey(cause))
  } finally {
    saving.value = false
  }
})
</script>

<template>
  <AdminShell :title="t('cms.shell.nav.settings')">
    <AdminAlert
      v-if="loadError"
      tone="danger"
      :title="t(adminErrorKey(loadError))"
    />

    <form
      v-else
      class="settings"
      novalidate
      @submit="onSubmit"
    >
      <h2 class="settings__title">
        {{ t('cms.settings.general') }}
      </h2>

      <AdminAlert
        v-if="!canUpdate"
        tone="warning"
        :title="t('cms.settings.readOnly')"
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
        :error="errors.siteName"
        :disabled="!canUpdate || saving"
        name="siteName"
        type="text"
        autocomplete="organization"
        required
      />
      <AdminInput
        v-model="contactEmail"
        v-bind="contactEmailProps"
        :label="t('cms.settings.contactEmail')"
        :placeholder="t('cms.login.emailPlaceholder')"
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
  </AdminShell>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--cms-space-5);
  max-width: 36rem;
  padding: var(--cms-space-6);
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-lg);
  background: var(--cms-card);
}

.settings__title {
  margin: 0;
  font-size: var(--cms-type-h3-size);
  font-weight: var(--cms-type-h3-weight);
  line-height: var(--cms-type-h3-line);
}

.settings :deep(.settings__save) {
  align-self: flex-start;
}
</style>
