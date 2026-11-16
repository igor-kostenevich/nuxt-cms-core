<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAdminI18n } from '../../admin/useAdminI18n'
import { focalPosition } from '../../primitives/media'
import { useEditorField } from '../field'

// Editable branch of CmsImage. Until Media (009) a replacement lives only in
// this session (Engine.media): it previews, but Save does not store it.
const props = defineProps<{
  fieldKey: string
  src?: string
  alt?: string
  decorative?: boolean
  fieldLabel?: string
}>()

const { t } = useAdminI18n()
const el = ref<HTMLElement | null>(null)
const { view, key } = useEditorField({
  kind: 'image',
  fieldKey: () => props.fieldKey,
  el,
  label: () => props.fieldLabel,
  api: {
    defaultSrc: () => props.src,
    defaultAlt: () => props.alt ?? '',
    decorative: () => props.decorative ?? false,
  },
})

const override = computed(() => view.media.get(key.value))
const src = computed(() => override.value?.src ?? props.src)
const alt = computed(() => {
  if (props.decorative || override.value?.decorative) {
    return ''
  }

  return override.value?.alt ?? props.alt ?? ''
})
const objectPosition = computed(() => focalPosition(override.value?.focal))
</script>

<template>
  <img
    v-if="src"
    ref="el"
    :src="src"
    :alt="alt"
    :style="objectPosition ? { objectPosition } : undefined"
  >
  <span
    v-else
    ref="el"
    class="cms-image-empty"
  >
    {{ t('cms.editor.kinds.image') }}
  </span>
</template>
