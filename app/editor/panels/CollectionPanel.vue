<script setup lang="ts">
import { useAdminI18n } from '../../admin/useAdminI18n'
import type { FieldRegistration } from '../kinds'
import ResetButton from './ResetButton.vue'

// The selected list as a whole: how many items, Add item, Reset.
defineProps<{
  field: Extract<FieldRegistration, { kind: 'collection' }>
}>()

const { t } = useAdminI18n()
</script>

<template>
  <div class="ed-mini">
    <span class="ed-mini__counter">
      {{ field.label ?? t('cms.editor.kinds.collection') }} · {{ field.api.count() }}<template v-if="field.api.max() !== undefined"> / {{ field.api.max() }}</template>
    </span>
    <AdminButton
      variant="primary"
      size="xs"
      :disabled="!field.api.canAdd()"
      @click="field.api.add()"
    >
      <template #leading>
        <Icon
          name="lucide:plus"
          aria-hidden="true"
        />
      </template>
      {{ t('cms.editor.collection.add') }}
    </AdminButton>
    <span
      v-if="!field.api.canAdd()"
      class="ed-mini__issue"
    >
      {{ t('cms.editor.collection.max', { max: field.api.max() ?? 0 }) }}
    </span>
    <ResetButton :field="field" />
  </div>
</template>
