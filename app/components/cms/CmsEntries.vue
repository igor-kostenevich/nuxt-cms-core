<script setup lang="ts">
import { defineAsyncComponent, h, type FunctionalComponent } from 'vue'
import { injectCmsEditor } from '../../editor/context'
import { warnInvalidFieldKey } from '../../primitives/field-key'
import { CmsEntryScope } from '../../primitives/entry-scope'
import type { CmsEntry, CmsEntrySelectionValue } from '../../types/entries'

// Renders entries of a list or a section (014 §7): the slot once per entry,
// each inside its own boundary (primitives there are read-only in Edit Mode).
//
// With `field-key` it is also the section's choice of entries: the page
// stores `{ mode: 'automatic', limit }` or `{ mode: 'manual', ids }`, reads the
// entries itself (`useCmsEntries(type, cmsEntrySelection(value, { limit }))`)
// and passes them here; in Edit Mode the section is a field with a picker.
// Then it renders its own element (`tag`), the same on the site and in Edit Mode.
const props = withDefaults(defineProps<{
  entries: CmsEntry[] | null | undefined
  /** The stored choice of the section. */
  value?: CmsEntrySelectionValue | null
  /** Field address of the choice, e.g. `blog.posts` (C-48). */
  fieldKey?: string
  /** Type of the entries the picker offers; required with `field-key`. */
  type?: string
  /** Default number of the newest entries (Automatic), as in `cmsEntrySelection`. */
  limit?: number
  /** Most entries a section may show (both modes). */
  max?: number
  /** Name of the section in the editor UI, e.g. «Featured posts». */
  fieldLabel?: string
  tag?: string
}>(), {
  value: null,
  fieldKey: undefined,
  type: undefined,
  limit: 3,
  max: 12,
  fieldLabel: undefined,
  tag: 'div',
})

if (props.fieldKey !== undefined) {
  warnInvalidFieldKey('CmsEntries', props.fieldKey)

  if (import.meta.dev && !props.type) {
    console.warn(`[cms] <CmsEntries field-key="${props.fieldKey}"> needs \`type\`: the picker offers entries of that type.`)
  }
}

// Edit Mode only; the public site never runs this import (MASTER_PLAN C-21).
const EditableEntries = defineAsyncComponent(() => import('../../editor/fields/EditableEntries.vue'))
const editor = injectCmsEditor()

const slots = defineSlots<{
  default(props: { entry: CmsEntry, index: number }): unknown
}>()

/** Each entry inside its own boundary, the slot once per entry. */
const Items: FunctionalComponent = () => (props.entries ?? []).map((entry, index) =>
  h(CmsEntryScope, { key: entry.id, entry }, () => slots.default?.({ entry, index })))
</script>

<template>
  <EditableEntries
    v-if="editor && fieldKey !== undefined && type"
    v-bind="props"
    :field-key="fieldKey"
    :type="type"
  >
    <template #default="scope">
      <slot v-bind="scope" />
    </template>
  </EditableEntries>
  <component
    :is="tag"
    v-else-if="fieldKey !== undefined"
  >
    <Items />
  </component>
  <Items v-else />
</template>
