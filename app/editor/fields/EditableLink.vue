<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import type { CmsLinkValue } from '../../types/primitives'
import { resolveCmsLink } from '../../primitives/link'
import { useEditorField } from '../field'

// Editable branch of CmsLink and CmsButton. Renders exactly like the public
// branch; a click selects it (the Overlay prevents navigation) and the link
// panel edits label, address and target.
const props = defineProps<{
  value?: CmsLinkValue | null
  fieldKey: string
  href?: string
  as: 'link' | 'button'
  fieldLabel?: string
}>()

const el = ref<HTMLElement | null>(null)
const probe = useTemplateRef<HTMLElement>('probe')
// The slot is the label's default. It is read from a hidden copy rendered once,
// so it is known even when a stored label replaces the slot.
const defaultLabel = ref('')
const seeded = ref(false)

const rawHref = computed(() => props.value?.href ?? props.href)
const link = computed(() => resolveCmsLink(rawHref.value, props.value?.newTab ?? false))
const text = computed(() => props.value?.label)

useEditorField({
  kind: props.as,
  fieldKey: () => props.fieldKey,
  el,
  label: () => props.fieldLabel,
  api: {
    defaultLabel: () => defaultLabel.value,
    defaultHref: () => props.href,
  },
})

onMounted(() => {
  // Without a stored label the slot is on screen and is the default itself.
  defaultLabel.value = (probe.value ?? el.value)?.textContent?.trim() ?? ''
  seeded.value = true
})

function setEl(node: unknown) {
  el.value = (node as { $el?: HTMLElement } | null)?.$el ?? (node as HTMLElement | null)
}
</script>

<template>
  <NuxtLink
    v-if="link"
    :ref="setEl"
    :to="link.href"
    :target="link.target"
    :rel="link.rel"
  >
    <template v-if="text != null">{{ text }}</template>
    <slot v-else />
    <span
      v-if="!seeded && text != null"
      ref="probe"
      hidden
    ><slot /></span>
  </NuxtLink>
  <component
    :is="as === 'button' ? 'button' : 'span'"
    v-else
    :ref="setEl"
    :type="as === 'button' ? 'button' : undefined"
    :tabindex="as === 'link' ? 0 : undefined"
  >
    <template v-if="text != null">{{ text }}</template>
    <slot v-else />
    <span
      v-if="!seeded && text != null"
      ref="probe"
      hidden
    ><slot /></span>
  </component>
</template>
