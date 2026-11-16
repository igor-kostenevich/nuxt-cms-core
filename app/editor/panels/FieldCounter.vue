<script setup lang="ts">
import { computed } from 'vue'
import { useAdminI18n } from '../../admin/useAdminI18n'

// Character count of a text field: amber near the limit, red above it. Read
// out only when it crosses a threshold, not on every keystroke.
const props = defineProps<{
  length: number
  max: number
}>()

/** From this share of the limit the counter warns. */
const WARN_AT = 0.9

const { t } = useAdminI18n()
const state = computed(() => {
  if (props.length > props.max) {
    return 'over'
  }

  return props.length >= props.max * WARN_AT ? 'near' : 'ok'
})
</script>

<template>
  <span
    class="ed-counter"
    :class="`ed-counter--${state}`"
  >
    <span aria-hidden="true">{{ t('cms.editor.field.counter', { count: length, max }) }}</span>
    <span class="ed-visually-hidden">{{ t('cms.editor.field.counterLabel', { count: length, max }) }}</span>
    <span
      class="ed-visually-hidden"
      role="status"
    >{{ state === 'over' ? t('cms.editor.field.overLimit', { max }) : state === 'near' ? t('cms.editor.field.nearLimit', { max }) : '' }}</span>
  </span>
</template>
