<script setup lang="ts">
import { computed, ref } from 'vue'
import '../../assets/runtime.css'
import { focalPosition } from '../../primitives/media'
import { useEditorField } from '../field'

// Editable branch of CmsBackground. The section itself is the field: clicking
// its empty area (not a field inside it) selects the background.
const props = defineProps<{
  fieldKey: string
  src?: string
  tag: string
  position?: string
  loading?: 'lazy' | 'eager'
  fetchpriority?: 'high' | 'low' | 'auto'
  fieldLabel?: string
}>()

const el = ref<HTMLElement | null>(null)
const { view, key } = useEditorField({
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

const override = computed(() => view.media.get(key.value))
const src = computed(() => override.value?.src ?? props.src)
const objectPosition = computed(() => focalPosition(override.value?.focal, props.position))
</script>

<template>
  <component
    :is="tag"
    ref="el"
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
      :style="objectPosition ? { objectPosition } : undefined"
    >
    <slot />
  </component>
</template>
