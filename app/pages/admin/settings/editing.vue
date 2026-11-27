<script setup lang="ts">
import { useAdminI18n } from '../../../admin/useAdminI18n'
import { useConfirmPublish } from '../../../admin/useConfirmPublish'

definePageMeta({
  // The Client Project's layouts frame the site, not the admin.
  layout: false,
  middleware: ['cms-auth'],
})

// Settings → Editing: preferences of the person at this browser. They apply at
// once and need no permission: nothing here is a setting of the site.
const { t } = useAdminI18n()
const { askBeforePublish } = useConfirmPublish()
</script>

<template>
  <AdminSettingsLayout :title="t('cms.settings.nav.editing')">
    <div class="settings-card">
      <p class="settings-card__hint">
        {{ t('cms.settings.editing.scope') }}
      </p>
      <AdminSwitch
        v-model="askBeforePublish"
        :label="t('cms.settings.editing.confirmPublish')"
        :hint="t('cms.settings.editing.confirmPublishHint')"
        data-test="confirm-publish"
      />
    </div>
  </AdminSettingsLayout>
</template>
