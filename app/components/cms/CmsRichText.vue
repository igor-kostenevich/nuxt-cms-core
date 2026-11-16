<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { injectCmsEditor } from '../../editor/context'
import type { CmsRichTextValue } from '../../types/primitives'
import { warnInvalidFieldKey } from '../../primitives/field-key'
import { isRichTextDoc, renderRichText, warnBlockInPhrasingTag } from '../../primitives/rich-text'

// Public renderer of a rich text field (MASTER_PLAN C-49). Tiptap is loaded
// only by the editor in Edit Mode, never here.
const props = withDefaults(defineProps<{
  /** Stored document; null, undefined or a non-document renders the default from the slot. */
  value?: CmsRichTextValue | null
  /** Field address in the entity, e.g. `hero.lead` (C-48). */
  fieldKey: string
  tag?: string
  /** Inline content only (paragraphs joined by `<br>`), for headings and other inline tags. */
  inline?: boolean
  /** Name of the field in the editor UI. */
  fieldLabel?: string
  /** Edit Mode blocks Publish while the field is empty. */
  required?: boolean
  /** Edit Mode blocks Publish above this many characters of text. */
  maxLength?: number
}>(), {
  value: null,
  tag: 'div',
  inline: false,
  fieldLabel: undefined,
  required: false,
  maxLength: undefined,
})

warnInvalidFieldKey('CmsRichText', props.fieldKey)
warnBlockInPhrasingTag(props.tag, props.inline)

// Edit Mode only, with Tiptap; the public site never runs this import
// (MASTER_PLAN C-21).
const EditableRichText = defineAsyncComponent(() => import('../../editor/fields/EditableRichText.vue'))
const editor = injectCmsEditor()

// A stored value that is not a document (null, or a plain string of an older
// format) falls back to the default from the slot.
const hasDocument = computed(() => isRichTextDoc(props.value))
const RichTextContent = () => renderRichText(props.value, { inline: props.inline })
</script>

<template>
  <EditableRichText
    v-if="editor"
    v-bind="props"
  >
    <slot />
  </EditableRichText>
  <component
    :is="tag"
    v-else
  >
    <RichTextContent v-if="hasDocument" />
    <slot v-else />
  </component>
</template>
