<script setup lang="ts">
import { useAdminI18n } from '../../admin/useAdminI18n'
import { useEditor } from '../inject'
import type { FieldRegistration } from '../kinds'
import ResetButton from './ResetButton.vue'

// Hide or show an optional block.
defineProps<{
  field: Extract<FieldRegistration, { kind: 'optional' }>
}>()

const { t } = useAdminI18n()
const { engine } = useEditor()
</script>

<template>
  <div class="ed-mini">
    <span class="ed-mini__counter">{{ field.label ?? t('cms.editor.kinds.optional') }}</span>
    <span
      v-if="engine.translating.value"
      class="ed-mini__locked"
    >
      <Icon
        name="lucide:lock"
        aria-hidden="true"
      />
      {{ t('cms.editor.locale.structureShort', { code: engine.defaultLocaleLabel.value }) }}
    </span>
    <AdminButton
      v-else
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
    <ResetButton
      v-if="!engine.translating.value"
      :field="field"
    />
  </div>
</template>
