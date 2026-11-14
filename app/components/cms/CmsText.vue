<script setup lang="ts">
import { warnInvalidFieldKey } from '../../primitives/field-key'

// Public render of a plain text field. The value only flows in: Edit Mode (008)
// changes it through the Editor Engine, never through v-model (MASTER_PLAN C-47).
const props = withDefaults(defineProps<{
  /** Stored value; null or undefined renders the default from the slot. */
  value?: string | null
  /** Field address in the entity, e.g. `hero.title` (C-48). */
  fieldKey: string
  tag?: string
}>(), {
  value: null,
  tag: 'span',
})

warnInvalidFieldKey('CmsText', props.fieldKey)
</script>

<template>
  <component :is="tag">
    <template v-if="value != null">{{ value }}</template>
    <slot v-else />
  </component>
</template>
