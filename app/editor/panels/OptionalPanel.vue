<script setup lang="ts">
import { useAdminI18n } from '../../admin/useAdminI18n'
import type { FieldRegistration } from '../kinds'
import ResetButton from './ResetButton.vue'

// Hide or show an optional block.
defineProps<{
  field: Extract<FieldRegistration, { kind: 'optional' }>
}>()

const { t } = useAdminI18n()
</script>

<template>
  <div class="ed-mini">
    <span class="ed-mini__counter">{{ field.label ?? t('cms.editor.kinds.optional') }}</span>
    <AdminButton
      variant="ghost"
      size="xs"
      @click="field.api.toggle()"
    >
      <template #leading>
        <Icon
          :name="field.api.hidden() ? 'lucide:eye' : 'lucide:eye-off'"
          aria-hidden="true"
        />
      </template>
      {{ field.api.hidden() ? t('cms.editor.field.show') : t('cms.editor.field.hide') }}
    </AdminButton>
    <ResetButton :field="field" />
  </div>
</template>
