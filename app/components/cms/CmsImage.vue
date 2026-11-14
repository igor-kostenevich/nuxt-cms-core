<script setup lang="ts">
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
}>(), {
  src: undefined,
  alt: '',
})

warnInvalidFieldKey('CmsImage', props.fieldKey)
</script>

<template>
  <img
    v-if="src"
    :src="src"
    :alt="alt"
  >
</template>
