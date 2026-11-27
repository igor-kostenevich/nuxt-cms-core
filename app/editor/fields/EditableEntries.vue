<script setup lang="ts">
import { ref } from 'vue'
import { useAdminI18n } from '../../admin/useAdminI18n'
import { CmsEntryScope } from '../../primitives/entry-scope'
import type { CmsEntry, CmsEntrySelectionValue } from '../../types/entries'
import { useEditorField } from '../field'

// Editable branch of <CmsEntries field-key>: the section is one field; its
// panel chooses Automatic / Manual and the entries (EntriesPanel). The
// entries themselves stay read-only: they are not the page's document.
const props = defineProps<{
  entries: CmsEntry[] | null | undefined
  value?: CmsEntrySelectionValue | null
  fieldKey: string
  type: string
  limit: number
  max: number
  fieldLabel?: string
  tag: string
}>()

defineSlots<{
  default(props: { entry: CmsEntry, index: number }): unknown
}>()

const { t } = useAdminI18n()
const el = ref<HTMLElement | null>(null)

useEditorField({
  kind: 'entries',
  value: () => props.value,
  fieldKey: () => props.fieldKey,
  el,
  label: () => props.fieldLabel,
  api: {
    type: () => props.type,
    limit: () => props.limit,
    max: () => props.max,
    shown: () => (props.entries ?? []).map(entry => entry.id),
  },
})
</script>

<template>
  <component
    :is="tag"
    ref="el"
  >
    <CmsEntryScope
      v-for="(item, index) in entries ?? []"
      :key="item.id"
      :entry="item"
    >
      <slot
        :entry="item"
        :index="index"
      />
    </CmsEntryScope>
    <p
      v-if="(entries ?? []).length === 0"
      class="cms-admin cms-editor-ui cms-collection-empty"
    >
      {{ t('cms.editor.entries.empty') }}
    </p>
  </component>
</template>
