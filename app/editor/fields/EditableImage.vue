<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAdminI18n } from '../../admin/useAdminI18n'
import { resolveImage } from '../../primitives/media'
import type { CmsImageValue } from '../../types/media'
import { useEditorField } from '../field'

// Editable branch of CmsImage. The value is a media id in the document
// (C-74); the Engine knows the media of the reads and of the Picker, so a
// freshly chosen image renders before Save.
const props = defineProps<{
  value?: CmsImageValue | null
  fieldKey: string
  src?: string
  alt?: string
  decorative?: boolean
  fieldLabel?: string
}>()

const { t } = useAdminI18n()
const el = ref<HTMLElement | null>(null)
const { engine } = useEditorField({
  kind: 'image',
  value: () => props.value,
  fieldKey: () => props.fieldKey,
  el,
  label: () => props.fieldLabel,
  api: {
    defaultSrc: () => props.src,
    defaultAlt: () => props.alt ?? '',
    decorative: () => props.decorative ?? false,
  },
})

const image = computed(() => resolveImage(props.value, engine.media.value, props))
</script>

<template>
  <img
    v-if="image.src"
    ref="el"
    :src="image.src"
    :alt="image.alt"
    :width="image.width"
    :height="image.height"
    :style="image.objectPosition ? { objectPosition: image.objectPosition } : undefined"
  >
  <span
    v-else
    ref="el"
    class="cms-image-empty"
  >
    {{ t('cms.editor.kinds.image') }}
  </span>
</template>
