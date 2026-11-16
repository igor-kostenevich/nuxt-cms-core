<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { injectCmsEditor } from '../../editor/context'
import { warnInvalidFieldKey } from '../../primitives/field-key'
import type { CmsOptionalValue } from '../../types/primitives'

// A block the editor may hide, e.g. a testimonial or a promo banner. The page
// code decides what is optional; the CMS only stores whether it is hidden.
const props = withDefaults(defineProps<{
  value?: CmsOptionalValue | null
  /** Field address in the entity, e.g. `quote.visibility` (C-48). */
  fieldKey: string
  tag?: string
  /** Name of the block in the editor UI, e.g. «Testimonial». */
  fieldLabel?: string
}>(), {
  value: null,
  tag: 'div',
  fieldLabel: undefined,
})

warnInvalidFieldKey('CmsOptional', props.fieldKey)

// Edit Mode only; the public site never runs this import (MASTER_PLAN C-21).
const EditableOptional = defineAsyncComponent(() => import('../../editor/fields/EditableOptional.vue'))
const editor = injectCmsEditor()
</script>

<template>
  <EditableOptional
    v-if="editor"
    v-bind="props"
  >
    <slot />
  </EditableOptional>
  <component
    :is="tag"
    v-else-if="!value?.hidden"
  >
    <slot />
  </component>
</template>
