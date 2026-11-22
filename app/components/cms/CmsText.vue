<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { injectCmsEditor } from '../../editor/context'
import { warnInvalidFieldKey } from '../../primitives/field-key'

// Loaded only when an Edit Mode context is present; the public site never
// runs this import (MASTER_PLAN C-21, R-04).
const EditableText = defineAsyncComponent(() => import('../../editor/fields/EditableText.vue'))

// Public render of a plain text field. The value only flows in: Edit Mode
// changes it through the Editor Engine, never through v-model (MASTER_PLAN C-47).
const props = withDefaults(defineProps<{
  /**
   * Stored value. A string renders as is (`''` included); anything else
   * renders the default from the slot: a stored value is untrusted, and a
   * translation or a direct write can leave an object here (C-78).
   */
  value?: string | null
  /** Field address in the entity, e.g. `hero.title` (C-48). */
  fieldKey: string
  tag?: string
  /** Name of the field in the editor UI. */
  fieldLabel?: string
  /** Edit Mode blocks Publish while the field is empty. */
  required?: boolean
  /** Edit Mode shows a counter and blocks Publish above this length. */
  maxLength?: number
}>(), {
  value: null,
  tag: 'span',
  fieldLabel: undefined,
  required: false,
  maxLength: undefined,
})

warnInvalidFieldKey('CmsText', props.fieldKey)

const editor = injectCmsEditor()
</script>

<template>
  <EditableText
    v-if="editor"
    v-bind="props"
  >
    <slot />
  </EditableText>
  <component
    :is="tag"
    v-else
  >
    <template v-if="typeof value === 'string'">{{ value }}</template>
    <slot v-else />
  </component>
</template>
