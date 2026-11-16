<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { injectCmsEditor } from '../../editor/context'
import { warnInvalidFieldKey } from '../../primitives/field-key'

// Until Media (009) there is no stored image value: `src` is the default from
// the page code. Content will store a media id, never a URL (MASTER_PLAN C-14),
// so the `value` prop arrives with the CmsImageValue format (D-24).
// Other <img> attributes (width, height, loading) pass through.
const props = withDefaults(defineProps<{
  /** Field address in the entity, e.g. `hero.image` (C-48). */
  fieldKey: string
  src?: string
  /** Empty alt marks the image as decorative. */
  alt?: string
  /** Decoration only: always an empty alt, and the editor asks for none. */
  decorative?: boolean
  /** Name of the field in the editor UI. */
  fieldLabel?: string
}>(), {
  src: undefined,
  alt: '',
  decorative: false,
  fieldLabel: undefined,
})

warnInvalidFieldKey('CmsImage', props.fieldKey)

// Edit Mode only; the public site never runs this import (MASTER_PLAN C-21).
const EditableImage = defineAsyncComponent(() => import('../../editor/fields/EditableImage.vue'))
const editor = injectCmsEditor()
</script>

<template>
  <EditableImage
    v-if="editor"
    v-bind="props"
  />
  <img
    v-else-if="src"
    :src="src"
    :alt="decorative ? '' : alt"
  >
</template>
