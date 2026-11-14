<script setup lang="ts">
import type { CmsButtonValue } from '../../types/primitives'
import { warnInvalidFieldKey } from '../../primitives/field-key'
import { resolveCmsLink, warnUnsafeHref } from '../../primitives/link'

// Same value as CmsLink. Without a safe href it is a `<button>`: the Client
// Project's own `@click` reaches it as a fallthrough attribute.
const props = withDefaults(defineProps<{
  value?: CmsButtonValue | null
  /** Field address in the entity, e.g. `hero.cta` (C-48). */
  fieldKey: string
  /** Default href from the page code. */
  href?: string
}>(), {
  value: null,
  href: undefined,
})

warnInvalidFieldKey('CmsButton', props.fieldKey)

const rawHref = computed(() => props.value?.href ?? props.href)
const link = computed(() => resolveCmsLink(rawHref.value, props.value?.newTab ?? false))
const label = computed(() => props.value?.label)

if (import.meta.dev) {
  watchEffect(() => warnUnsafeHref('CmsButton', rawHref.value))
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
  <button
    v-else
    type="button"
  >
    <template v-if="label != null">{{ label }}</template>
    <slot v-else />
  </button>
</template>
