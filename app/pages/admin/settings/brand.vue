<script setup lang="ts">
import { adminErrorKey } from '../../../admin/error-key'
import { useAdminI18n } from '../../../admin/useAdminI18n'
import { useAdminSettings } from '../../../admin/useAdminSettings'
import type { CmsMedia } from '../../../types/media'

definePageMeta({
  // The Client Project's layouts frame the site, not the admin.
  layout: false,
  middleware: ['cms-auth'],
})

const { t } = useAdminI18n()
const { can } = usePermissions()
const { settings, error: loadError, saveBrand, ready } = useAdminSettings()

await ready

const canUpdate = computed(() => can('settings.update'))

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
</script>

<template>
  <AdminSettingsLayout :title="t('cms.settings.nav.brand')">
    <AdminAlert
      v-if="loadError"
      tone="danger"
      :title="t(adminErrorKey(loadError))"
    />

    <section
      v-else
      class="settings-card"
      :aria-label="t('cms.settings.brand.title')"
    >
      <p class="settings-card__hint">
        {{ t('cms.settings.brand.hint') }}
      </p>
      <AdminAlert
        v-if="!canUpdate"
        tone="info"
        :title="t('cms.settings.readOnly')"
      />
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
  </AdminSettingsLayout>
</template>

<style scoped>
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
