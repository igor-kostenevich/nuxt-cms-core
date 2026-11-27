<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAdminI18n } from '../../admin/useAdminI18n'
import type { CmsContentRichTextField } from '../../../src/content-fields'
import { isRichTextDoc } from '../../primitives/rich-text'
import type { CmsRichTextValue } from '../../types/primitives'
import EditableRichText from '../fields/EditableRichText.vue'
import { useEditor } from '../inject'
import RichTextPanel from '../panels/RichTextPanel.vue'
import FormField from './FormField.vue'
import { issueMessage } from './messages'
import { useShownIssue } from './shown-issue'

// Formatted text of Core's entry form (014, C-103): the same Tiptap field as
// Edit Mode, framed like an input, with its toolbar fixed above it instead of
// floating. Translated (C-78); the toolbar says so in a translation.
const props = defineProps<{
  address: string
  field: CmsContentRichTextField
  label: string
  hint?: string
}>()

const { t } = useAdminI18n()
const { engine } = useEditor()

const value = computed(() => {
  const stored = engine.get(props.address)
  return isRichTextDoc(stored) ? stored as unknown as CmsRichTextValue : null
})

/** The field as the Engine registered it: the toolbar works on its editor. */
const registration = computed(() => {
  for (const item of engine.fields.values()) {
    if (item.kind === 'richText' && item.key === props.address) {
      return item
    }
  }

  return null
})

const frame = ref<HTMLElement | null>(null)
const issue = useShownIssue(frame, computed(() => engine.issues.value.find(item => item.fieldId === registration.value?.id)?.kind ?? null))
const error = computed(() => issueMessage(issue.value, t, props.field, {
  length: registration.value?.api.editor?.state.doc.textContent.length ?? 0,
}))
</script>

<template>
  <FormField
    :label="label"
    :required="field.required"
    :hint="hint ?? t('cms.editor.form.richTextHint')"
    :error="error"
  >
    <div
      ref="frame"
      class="entry-form-rich"
      :class="{ 'entry-form-rich--error': error }"
    >
      <RichTextPanel
        v-if="registration"
        :field="registration"
      />
      <EditableRichText
        :value="value"
        :field-key="address"
        :field-label="label"
        :required="field.required"
        :max-length="field.maxLength"
        tag="div"
        form
        class="entry-form-rich__text"
      />
    </div>
  </FormField>
</template>

<style scoped>
.entry-form-rich {
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-sm);
  background: var(--cms-card);
}

.entry-form-rich:focus-within {
  border-color: var(--cms-ring);
  box-shadow: var(--cms-focus-ring-field);
}

.entry-form-rich--error {
  border-color: var(--cms-destructive);
}

/* The toolbar sits inside the frame, not floating. */
.entry-form-rich :deep(.ed-mini) {
  display: flex;
  max-width: none;
  border: 0;
  border-bottom: var(--cms-border-width) solid var(--cms-border-subtle);
  border-radius: 0;
  box-shadow: none;
}

.entry-form-rich__text {
  min-height: 7.5em;
  padding: var(--cms-space-2) var(--cms-space-3);
  outline: none;
  font-size: var(--cms-type-body-size);
  line-height: var(--cms-type-body-line);
}

.entry-form-rich__text :deep(p) {
  margin: 0 0 var(--cms-space-2);
}

.entry-form-rich__text :deep(p:last-child) {
  margin-bottom: 0;
}
</style>
