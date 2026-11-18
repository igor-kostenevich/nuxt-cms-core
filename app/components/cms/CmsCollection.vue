<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { injectCmsEditor } from '../../editor/context'
import { warnInvalidFieldKey } from '../../primitives/field-key'
import { collectionItems, warnDefaultIds } from '../../primitives/collection'
import type { CmsCollectionItem } from '../../types/primitives'

// Local repeatable content of a page: FAQ, service cards, benefits
// (MASTER_PLAN C-03). Items render in `itemTag` wrappers, so the editor has an
// element per item to select, reorder and delete. Inside the slot, fields use
// keys relative to the item: `field-key="title"` → `services.<id>.title`.
const props = withDefaults(defineProps<{
  /**
   * Stored items. An object instead: a translation (or a text change) of
   * items that are still code defaults, keyed by item id (C-78, C-88).
   */
  value?: CmsCollectionItem[] | Record<string, unknown> | null
  /** Field address in the entity, e.g. `services` (C-48). */
  fieldKey: string
  /**
   * Items from the page code, shown until the collection is edited. Give each
   * a stable `id` (C-88): translations are kept by it.
   */
  defaults?: Record<string, unknown>[]
  tag?: string
  itemTag?: string
  itemClass?: string
  /** Edit Mode: fewest and most items the editor may leave. */
  min?: number
  max?: number
  /** Fields of a new item, before the editor fills them in. */
  template?: Record<string, unknown>
  /** Name of the field in the editor UI. */
  fieldLabel?: string
}>(), {
  value: null,
  defaults: () => [],
  tag: 'div',
  itemTag: 'div',
  itemClass: undefined,
  min: 0,
  max: undefined,
  template: () => ({}),
  fieldLabel: undefined,
})

defineSlots<{
  default(props: { item: CmsCollectionItem, index: number }): unknown
}>()

warnInvalidFieldKey('CmsCollection', props.fieldKey)
warnDefaultIds(props.fieldKey, props.defaults)

// Edit Mode only; the public site never runs this import (MASTER_PLAN C-21).
const EditableCollection = defineAsyncComponent(() => import('../../editor/fields/EditableCollection.vue'))
const editor = injectCmsEditor()

/** Stored items, or the code defaults with stable ids until the first edit. */
const items = computed<CmsCollectionItem[]>(() => collectionItems(props.value, props.defaults))
</script>

<template>
  <EditableCollection
    v-if="editor"
    v-bind="props"
    :items="items"
  >
    <template #default="slotProps">
      <slot v-bind="slotProps" />
    </template>
  </EditableCollection>
  <component
    :is="tag"
    v-else
  >
    <component
      :is="itemTag"
      v-for="(item, index) in items"
      :key="item.id"
      :class="itemClass"
    >
      <slot
        :item="item"
        :index="index"
      />
    </component>
  </component>
</template>
