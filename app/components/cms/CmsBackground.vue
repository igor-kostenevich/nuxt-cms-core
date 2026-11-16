<script setup lang="ts">
import '../../assets/runtime.css'
import { defineAsyncComponent } from 'vue'
import { injectCmsEditor } from '../../editor/context'
import { warnInvalidFieldKey } from '../../primitives/field-key'

// A section with a background image. The image is an <img> behind the slot
// (object-fit: cover), not a CSS background: it stays a field the editor can
// select, and the browser can lazy-load and size it like any image.
// Background images are decorative: the alt is always empty.
const props = withDefaults(defineProps<{
  /** Field address in the entity, e.g. `hero.background` (C-48). */
  fieldKey: string
  src?: string
  tag?: string
  /** CSS object-position of the image, e.g. `50% 30%`. */
  position?: string
  /** `eager` for a background above the fold, e.g. the hero. */
  loading?: 'lazy' | 'eager'
  fetchpriority?: 'high' | 'low' | 'auto'
  /** Name of the field in the editor UI. */
  fieldLabel?: string
}>(), {
  src: undefined,
  tag: 'section',
  position: undefined,
  loading: 'lazy',
  fetchpriority: undefined,
  fieldLabel: undefined,
})

warnInvalidFieldKey('CmsBackground', props.fieldKey)

// Edit Mode only; the public site never runs this import (MASTER_PLAN C-21).
const EditableBackground = defineAsyncComponent(() => import('../../editor/fields/EditableBackground.vue'))
const editor = injectCmsEditor()
</script>

<template>
  <EditableBackground
    v-if="editor"
    v-bind="props"
  >
    <slot />
  </EditableBackground>
  <component
    :is="tag"
    v-else
    class="cms-background"
  >
    <img
      v-if="src"
      :src="src"
      alt=""
      aria-hidden="true"
      class="cms-background__image"
      :loading="loading"
      :fetchpriority="fetchpriority"
      :style="position ? { objectPosition: position } : undefined"
    >
    <slot />
  </component>
</template>
