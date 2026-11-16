<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { injectCmsEditor } from '../../editor/context'
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
  /** Name of the field in the editor UI. */
  fieldLabel?: string
}>(), {
  value: null,
  href: undefined,
  fieldLabel: undefined,
})

warnInvalidFieldKey('CmsButton', props.fieldKey)

// Edit Mode only; the public site never runs this import (MASTER_PLAN C-21).
const EditableLink = defineAsyncComponent(() => import('../../editor/fields/EditableLink.vue'))
const editor = injectCmsEditor()

const rawHref = computed(() => props.value?.href ?? props.href)
const link = computed(() => resolveCmsLink(rawHref.value, props.value?.newTab ?? false))
const label = computed(() => props.value?.label)

if (import.meta.dev) {
  watchEffect(() => warnUnsafeHref('CmsButton', rawHref.value))
}
</script>

<template>
  <EditableLink
    v-if="editor"
    v-bind="props"
    as="button"
  >
    <slot />
  </EditableLink>
  <NuxtLink
    v-else-if="link"
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
