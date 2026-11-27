<script setup lang="ts">
import { computed } from 'vue'
import { useAdminI18n } from '../../admin/useAdminI18n'
import type { FieldRegistration } from '../kinds'
import FloatingPanel from './FloatingPanel.vue'
import TextPanel from './TextPanel.vue'
import RichTextPanel from './RichTextPanel.vue'
import LinkPanel from './LinkPanel.vue'
import ImagePanel from './ImagePanel.vue'
import CollectionPanel from './CollectionPanel.vue'
import OptionalPanel from './OptionalPanel.vue'
import EntriesPanel from './EntriesPanel.vue'

// Controls of the selected field, kept next to it (MASTER_PLAN C-66: popover,
// not a side panel). Items have no panel: ItemControls covers them.
const props = defineProps<{
  field: FieldRegistration
}>()

const { t } = useAdminI18n()
const label = computed(() => props.field.label ?? t(`cms.editor.kinds.${props.field.kind}`))
</script>

<template>
  <FloatingPanel
    v-if="field.kind === 'text'"
    :anchor="field.el"
    :label="label"
    placement="bottom-start"
    :gap="8"
    toolbar
  >
    <TextPanel :field="field" />
  </FloatingPanel>
  <FloatingPanel
    v-else-if="field.kind === 'richText'"
    :anchor="field.el"
    :label="label"
    placement="top-start"
    :gap="8"
    toolbar
  >
    <RichTextPanel :field="field" />
  </FloatingPanel>
  <FloatingPanel
    v-else-if="field.kind === 'link' || field.kind === 'button'"
    :anchor="field.el"
    :label="label"
    placement="bottom-start"
  >
    <LinkPanel :field="field" />
  </FloatingPanel>
  <FloatingPanel
    v-else-if="field.kind === 'image' || field.kind === 'background'"
    :anchor="field.el"
    :label="label"
    :placement="field.kind === 'background' ? 'bottom-end' : 'right-start'"
  >
    <ImagePanel :field="field" />
  </FloatingPanel>
  <FloatingPanel
    v-else-if="field.kind === 'collection'"
    :anchor="field.el"
    :label="label"
    placement="bottom"
    toolbar
  >
    <CollectionPanel :field="field" />
  </FloatingPanel>
  <FloatingPanel
    v-else-if="field.kind === 'optional'"
    :anchor="field.el"
    :label="label"
    placement="top-end"
    :gap="8"
    toolbar
  >
    <OptionalPanel :field="field" />
  </FloatingPanel>
  <FloatingPanel
    v-else-if="field.kind === 'entries'"
    :anchor="field.el"
    :label="label"
    placement="bottom-start"
  >
    <EntriesPanel :field="field" />
  </FloatingPanel>
</template>
