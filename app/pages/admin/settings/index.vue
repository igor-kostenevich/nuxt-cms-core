<script setup lang="ts">
import { useForm } from 'vee-validate'
import { adminErrorKey } from '../../../admin/error-key'
import { useAdminI18n } from '../../../admin/useAdminI18n'
import { useAdminValidation } from '../../../admin/useAdminValidation'
import { useAdminSettings } from '../../../admin/useAdminSettings'
import type { CmsMedia } from '../../../types/media'

definePageMeta({
  // The Client Project's layouts frame the site, not the admin.
  layout: false,
  middleware: ['cms-auth'],
})

const { t } = useAdminI18n()
const { can } = usePermissions()
const { required, email: emailRule, phone: phoneRule } = useAdminValidation()
const { settings, error: loadError, save, saveBrand, ready } = useAdminSettings()

await ready

const canUpdate = computed(() => can('settings.update'))
const saving = ref(false)
const failure = ref('')
const current = settings.value

const saved = ref(false)

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

// Brand: each choice is saved at once, there is nothing else to fill in.
type BrandSlot = 'logo' | 'favicon'

const brandSlots: BrandSlot[] = ['logo', 'favicon']
const pickerSlot = ref<BrandSlot | null>(null)
const pickerOpen = computed({
  get: () => pickerSlot.value !== null,
  set: (open) => {
    if (!open) {
      pickerSlot.value = null
    }
  },
})
const brandSaving = ref<BrandSlot | null>(null)
const brandFailure = ref('')
const brandSaved = ref(false)

async function setBrand(slot: BrandSlot, mediaId: string | null) {
  if (!canUpdate.value) {
    return
  }

  brandSaving.value = slot
  brandFailure.value = ''
  brandSaved.value = false

  try {
    // Only the slot that changed: the other one keeps what is stored.
    await saveBrand(slot === 'logo' ? { logoMediaId: mediaId } : { faviconMediaId: mediaId })
    brandSaved.value = true
  } catch (cause) {
    brandFailure.value = t(adminErrorKey(cause))
  } finally {
    brandSaving.value = null
  }
}

function onPick(media: CmsMedia) {
  const slot = pickerSlot.value

  if (slot) {
    void setBrand(slot, media.id)
  }
}

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

    <section
      v-if="!loadError"
      class="settings"
      aria-labelledby="settings-brand-title"
    >
      <h2
        id="settings-brand-title"
        class="settings__title"
      >
        {{ t('cms.settings.brand.title') }}
      </h2>
      <p class="settings__hint">
        {{ t('cms.settings.brand.hint') }}
      </p>
      <AdminAlert
        v-if="brandSaved"
        tone="success"
        :title="t('cms.settings.brand.saved')"
        dismissible
        @dismiss="brandSaved = false"
      />
      <AdminAlert
        v-if="brandFailure"
        tone="danger"
        :title="brandFailure"
      />

      <div
        v-for="slot in brandSlots"
        :key="slot"
        class="brand"
      >
        <span class="brand__thumb">
          <img
            v-if="settings?.[slot]"
            :src="settings[slot]!.url"
            alt=""
          >
          <Icon
            v-else
            name="lucide:image"
            aria-hidden="true"
          />
        </span>
        <span class="brand__text">
          <span class="brand__label">{{ t(`cms.settings.brand.${slot}`) }}</span>
          <span class="brand__value">{{ settings?.[slot]?.name ?? t('cms.settings.brand.none') }}</span>
        </span>
        <template v-if="canUpdate">
          <AdminButton
            variant="secondary"
            size="sm"
            aria-haspopup="dialog"
            :loading="brandSaving === slot"
            :disabled="brandSaving !== null && brandSaving !== slot"
            @click="pickerSlot = slot"
          >
            {{ settings?.[slot] ? t('cms.settings.brand.change') : t('cms.settings.brand.choose') }}
          </AdminButton>
          <AdminButton
            v-if="settings?.[slot]"
            variant="ghost"
            size="sm"
            :disabled="brandSaving !== null"
            @click="setBrand(slot, null)"
          >
            {{ t('cms.settings.brand.remove') }}
          </AdminButton>
        </template>
      </div>
    </section>

    <AdminMediaPicker
      v-model:open="pickerOpen"
      :title="pickerSlot ? t(`cms.settings.brand.${pickerSlot}`) : undefined"
      :selected-id="pickerSlot ? settings?.[pickerSlot]?.id ?? null : null"
      @pick="onPick"
    />
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

.settings + .settings {
  margin-top: var(--cms-space-6);
}

.settings__hint {
  margin: 0;
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--cms-space-3);
}

.brand__thumb {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  overflow: hidden;
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-md);
  background: var(--cms-surface-secondary);
  color: var(--cms-text-tertiary);
}

.brand__thumb img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.brand__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.brand__label {
  font-size: var(--cms-type-label-size);
  font-weight: var(--cms-type-label-weight);
}

.brand__value {
  overflow: hidden;
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
