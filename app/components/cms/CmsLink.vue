<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { injectCmsEditor } from '../../editor/context'
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
  /** Name of the field in the editor UI. */
  fieldLabel?: string
}>(), {
  value: null,
  href: undefined,
  fieldLabel: undefined,
})

warnInvalidFieldKey('CmsLink', props.fieldKey)

// Edit Mode only; the public site never runs this import (MASTER_PLAN C-21).
const EditableLink = defineAsyncComponent(() => import('../../editor/fields/EditableLink.vue'))
const editor = injectCmsEditor()

const rawHref = computed(() => props.value?.href ?? props.href)
const link = computed(() => resolveCmsLink(rawHref.value, props.value?.newTab ?? false))
const label = computed(() => props.value?.label)

if (import.meta.dev) {
  watchEffect(() => warnUnsafeHref('CmsLink', rawHref.value))
}
</script>

<template>
  <EditableLink
    v-if="editor"
    v-bind="props"
    as="link"
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
  <span v-else>
    <template v-if="label != null">{{ label }}</template>
    <slot v-else />
  </span>
</template>
