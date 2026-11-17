<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { injectCmsEditor } from '../../editor/context'
import { warnInvalidFieldKey } from '../../primitives/field-key'
import { injectCmsMedia, resolveImage } from '../../primitives/media'
import type { CmsImageValue } from '../../types/media'

// Content stores a media id, never a URL (MASTER_PLAN C-14, C-74). The media
// itself comes with the page read (C-76): useCmsPage provides it. Without a
// value, or when its media is deleted, `src` and `alt` from code render.
// Other <img> attributes (loading, sizes, class) pass through.
const props = withDefaults(defineProps<{
  /** Stored value from the page content. */
  value?: CmsImageValue | null
  /** Field address in the entity, e.g. `hero.image` (C-48). */
  fieldKey: string
  /** Default image from code. */
  src?: string
  /** Default alt from code. Empty alt marks the image as decorative. */
  alt?: string
  /** Decoration only: always an empty alt, and the editor asks for none. */
  decorative?: boolean
  /** Name of the field in the editor UI. */
  fieldLabel?: string
}>(), {
  value: undefined,
  src: undefined,
  alt: '',
  decorative: false,
  fieldLabel: undefined,
})

warnInvalidFieldKey('CmsImage', props.fieldKey)

// Edit Mode only; the public site never runs this import (MASTER_PLAN C-21).
const EditableImage = defineAsyncComponent(() => import('../../editor/fields/EditableImage.vue'))
const editor = injectCmsEditor()
const media = injectCmsMedia()
const image = computed(() => resolveImage(props.value, media(), props))
</script>

<template>
  <EditableImage
    v-if="editor"
    v-bind="props"
  />
  <img
    v-else-if="image.src"
    :src="image.src"
    :alt="image.alt"
    :width="image.width"
    :height="image.height"
    :style="image.objectPosition ? { objectPosition: image.objectPosition } : undefined"
  >
</template>
