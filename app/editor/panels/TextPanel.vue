<script setup lang="ts">
import { computed } from 'vue'
import { useAdminI18n } from '../../admin/useAdminI18n'
import { useEditor } from '../inject'
import type { FieldRegistration } from '../kinds'
import FieldCounter from './FieldCounter.vue'
import ResetButton from './ResetButton.vue'

// Mini toolbar under a plain text field: character count, «required», Reset.
const props = defineProps<{
  field: Extract<FieldRegistration, { kind: 'text' }>
}>()

const { t } = useAdminI18n()
const { engine } = useEditor()

// The stored value, not the DOM: CSS (uppercase…) must not change the count.
const length = computed(() => {
  const value = engine.get(props.field.key)
  return typeof value === 'string' ? value.length : (props.field.el.textContent ?? '').length
})
const issue = computed(() => engine.issues.value.find(item => item.fieldId === props.field.id))
</script>

<template>
  <div class="ed-mini">
    <FieldCounter
      v-if="field.maxLength"
      :length="length"
      :max="field.maxLength"
    />
    <span
      v-if="issue?.kind === 'required'"
      class="ed-mini__issue"
    >
      {{ t('cms.editor.field.required') }}
    </span>
    <ResetButton :field="field" />
  </div>
</template>
