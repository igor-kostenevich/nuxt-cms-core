<script setup lang="ts">
import { useAdminI18n } from '../../admin/useAdminI18n'
import { useEditor } from '../inject'
import type { FieldRegistration } from '../kinds'
import ResetButton from './ResetButton.vue'

// The selected list as a whole: how many items, Add item, Reset.
defineProps<{
  field: Extract<FieldRegistration, { kind: 'collection' }>
}>()

const { t } = useAdminI18n()
const { engine } = useEditor()
</script>

<template>
  <div class="ed-mini">
    <span class="ed-mini__counter">
      {{ field.label ?? t('cms.editor.kinds.collection') }} · {{ field.api.count() }}<template v-if="field.api.max() !== undefined"> / {{ field.api.max() }}</template>
    </span>
    <!-- Items belong to the default language: a translation only translates their texts (C-78). -->
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
      v-if="!field.api.canAdd() && !engine.translating.value"
      class="ed-mini__issue"
    >
      {{ t('cms.editor.collection.max', { max: field.api.max() ?? 0 }) }}
    </span>
    <ResetButton
      v-if="!engine.translating.value"
      :field="field"
    />
  </div>
</template>
