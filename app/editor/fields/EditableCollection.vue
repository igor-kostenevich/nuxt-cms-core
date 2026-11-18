<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useAdminI18n } from '../../admin/useAdminI18n'
import { withDefaultIds } from '../../primitives/collection'
import type { CmsCollectionItem } from '../../types/primitives'
import { useEditorField } from '../field'
import { scrollBehavior } from '../motion'
import { cloneDocument } from '../../primitives/paths'
import EditableCollectionItem from './EditableCollectionItem.vue'

// Editable branch of CmsCollection: the list is a field (Add item), each item
// is a field (reorder, duplicate, delete) and a scope for the fields inside it.
const props = defineProps<{
  value?: CmsCollectionItem[] | Record<string, unknown> | null
  fieldKey: string
  defaults: Record<string, unknown>[]
  items: CmsCollectionItem[]
  tag: string
  itemTag: string
  itemClass?: string
  min: number
  max?: number
  template: Record<string, unknown>
  fieldLabel?: string
}>()

defineSlots<{
  default(props: { item: CmsCollectionItem, index: number }): unknown
}>()

const { t } = useAdminI18n()
const el = ref<HTMLElement | null>(null)
const canAdd = computed(() => props.max === undefined || props.items.length < props.max)

const { engine, view, key, id } = useEditorField({
  kind: 'collection',
  fieldKey: () => props.fieldKey,
  el,
  label: () => props.fieldLabel,
  api: {
    get key(): string {
      return key.value
    },
    count: () => props.items.length,
    max: () => props.max,
    canAdd: () => canAdd.value,
    add: (afterId?: string): string | null => add(afterId),
  },
})

const stopDefaults = engine.registerCollectionDefaults(key.value, () => cloneDocument(withDefaultIds(props.defaults)))

onBeforeUnmount(stopDefaults)

function add(afterId?: string): string | null {
  if (!canAdd.value) {
    return null
  }

  const newId: string | null = engine.addItem(key.value, props.template, afterId)

  // Select the new item once it renders, so its controls and fields are at hand.
  if (newId) {
    requestAnimationFrame(() => {
      const item = el.value?.querySelector<HTMLElement>(`[data-cms-item="${newId}"]`)
      const itemId = item?.dataset.cmsField

      if (item && itemId) {
        view.select(itemId, 'keyboard')
        item.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() })
        item.focus({ preventScroll: true })
      }
    })
  }

  return newId
}
</script>

<template>
  <component
    :is="tag"
    ref="el"
  >
    <EditableCollectionItem
      v-for="(item, index) in items"
      :key="item.id"
      :tag="itemTag"
      :class="itemClass"
      :collection-key="key"
      :collection-id="id"
      :collection-label="fieldLabel"
      :item="item"
      :index="index"
      :count="items.length"
      :min="min"
      :can-add="canAdd"
    >
      <slot
        :item="item"
        :index="index"
      />
    </EditableCollectionItem>
    <component
      :is="itemTag"
      v-if="items.length === 0"
      class="cms-collection-empty"
    >
      <span>{{ t('cms.editor.collection.empty') }}</span>
      <button
        v-if="view.editable.value && !engine.translating.value"
        type="button"
        class="cms-collection-empty__add"
        @click="add()"
      >
        <span aria-hidden="true">+</span>
        {{ t('cms.editor.collection.add') }}
      </button>
    </component>
  </component>
</template>
