<script setup lang="ts">
import { provide, ref } from 'vue'
import type { CmsCollectionItem } from '../../types/primitives'
import { CMS_FIELD_SCOPE } from '../context'
import { useEditorField } from '../field'

// One item of an editable collection. Fields inside it address the item by
// id (`services.k3f9.title`), so reordering never mixes their values up.
const props = defineProps<{
  tag: string
  collectionKey: string
  collectionId: string
  collectionLabel?: string
  item: CmsCollectionItem
  index: number
  count: number
  min: number
  canAdd: boolean
}>()

const el = ref<HTMLElement | null>(null)
const itemKey = `${props.collectionKey}.${props.item.id}`

provide(CMS_FIELD_SCOPE, itemKey)

useEditorField({
  kind: 'item',
  fieldKey: () => itemKey,
  absolute: true,
  el,
  label: () => props.collectionLabel ? `${props.collectionLabel} · ${props.index + 1}` : undefined,
  api: {
    collectionKey: props.collectionKey,
    collectionId: props.collectionId,
    itemId: props.item.id,
    index: () => props.index,
    count: () => props.count,
    canRemove: () => props.count > props.min,
    canAdd: () => props.canAdd,
  },
})
</script>

<template>
  <component
    :is="tag"
    ref="el"
    :data-cms-item="item.id"
  >
    <slot />
  </component>
</template>
