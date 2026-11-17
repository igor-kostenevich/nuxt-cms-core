<script setup lang="ts">
import { computed, ref } from 'vue'
import '../../assets/runtime.css'
import { resolveImage } from '../../primitives/media'
import type { CmsImageValue } from '../../types/media'
import { useEditorField } from '../field'

// Editable branch of CmsBackground. The section itself is the field: clicking
// its empty area (not a field inside it) selects the background.
const props = defineProps<{
  value?: CmsImageValue | null
  fieldKey: string
  src?: string
  tag: string
  position?: string
  loading?: 'lazy' | 'eager'
  fetchpriority?: 'high' | 'low' | 'auto'
  fieldLabel?: string
}>()

const el = ref<HTMLElement | null>(null)
const { engine } = useEditorField({
  kind: 'background',
  fieldKey: () => props.fieldKey,
  el,
  label: () => props.fieldLabel,
  api: {
    defaultSrc: () => props.src,
    defaultAlt: () => '',
    decorative: () => true,
  },
})

const image = computed(() => resolveImage(props.value, engine.media.value, { ...props, decorative: true }))
</script>

<template>
  <component
    :is="tag"
    ref="el"
    class="cms-background"
  >
    <img
      v-if="image.src"
      :src="image.src"
      alt=""
      aria-hidden="true"
      class="cms-background__image"
      :width="image.width"
      :height="image.height"
      :loading="loading"
      :fetchpriority="fetchpriority"
      :style="image.objectPosition ? { objectPosition: image.objectPosition } : undefined"
    >
    <slot />
  </component>
</template>
