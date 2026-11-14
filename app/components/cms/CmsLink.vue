<script setup lang="ts">
import type { CmsLinkValue } from '../../types/primitives'
import { warnInvalidFieldKey } from '../../primitives/field-key'
import { resolveCmsLink, warnUnsafeHref } from '../../primitives/link'

// Each part of the stored value wins over its code default on its own:
// `label` over the slot, `href` over the `href` prop.
const props = withDefaults(defineProps<{
  value?: CmsLinkValue | null
  /** Field address in the entity, e.g. `hero.more` (C-48). */
  fieldKey: string
  /** Default href from the page code. */
  href?: string
}>(), {
  value: null,
  href: undefined,
})

warnInvalidFieldKey('CmsLink', props.fieldKey)

const rawHref = computed(() => props.value?.href ?? props.href)
const link = computed(() => resolveCmsLink(rawHref.value, props.value?.newTab ?? false))
const label = computed(() => props.value?.label)

if (import.meta.dev) {
  watchEffect(() => warnUnsafeHref('CmsLink', rawHref.value))
}
</script>

<template>
  <NuxtLink
    v-if="link"
    :to="link.href"
    :target="link.target"
    :rel="link.rel"
  >
    <template v-if="label != null">{{ label }}</template>
    <slot v-else />
  </NuxtLink>
  <span v-else>
    <template v-if="label != null">{{ label }}</template>
    <slot v-else />
  </span>
</template>
