<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAdminI18n } from '../../admin/useAdminI18n'
import type { CmsContentLinkField } from '../../../src/content-fields'
import type { CmsLinkValue } from '../../types/primitives'
import { useEditorField } from '../field'
import { useEditor } from '../inject'
import { linkKind } from '../link-kind'
import FormField from './FormField.vue'
import { issueMessage } from './messages'
import { useShownIssue } from './shown-issue'

// A link of Core's entry form (014, C-103): its text, its address and "new
// tab" as plain fields, no floating panel. Stores `{ label?, href?, newTab? }`
// like CmsLink. In a translation only the text is this language's (C-78).
const props = defineProps<{
  address: string
  field: CmsContentLinkField
  label: string
  hint?: string
}>()

const { t } = useAdminI18n()
const el = ref<HTMLElement | null>(null)

const { engine } = useEditor()
const { view, key, id } = useEditorField({
  kind: 'link',
  fieldKey: () => props.address,
  el,
  label: () => props.label,
  required: () => props.field.required,
  form: true,
  value: () => engine.get(props.address),
  api: {
    defaultLabel: () => '',
    defaultHref: () => undefined,
  },
})

const stored = computed(() => {
  const value = engine.get(key.value)
  return (typeof value === 'object' && value !== null ? value : {}) as CmsLinkValue
})
const href = computed(() => stored.value.href ?? '')
const kind = computed(() => linkKind(href.value))
const structureLocked = computed(() => engine.translating.value || !view.editable.value)
const labelLocked = computed(() => !view.editable.value || !engine.canTranslate(key.value))

const shown = useShownIssue(el, computed(() => engine.issues.value.find(issue => issue.fieldId === id)?.kind ?? null))
const error = computed(() => issueMessage(shown.value, t, props.field)
  ?? (kind.value === 'invalid' ? t('cms.editor.form.link.invalid') : undefined))

/** Writes only what is set: an empty text or address is no value. */
function update(patch: Partial<CmsLinkValue>) {
  engine.beginEdit(key.value)
  const next: CmsLinkValue = { ...stored.value, ...patch }

  if (!next.label) {
    delete next.label
  }

  if (!next.href) {
    delete next.href
  }

  if (!next.newTab) {
    delete next.newTab
  }

  engine.set(key.value, Object.keys(next).length > 0 ? next : undefined)
}

/** Typing until blur is one Undo step. */
function endEdit() {
  engine.endEdit()
}

const note = computed(() => (engine.translating.value
  ? t('cms.editor.form.structure', { code: engine.defaultLocaleLabel.value })
  : undefined))
</script>

<template>
  <FormField
    :label="label"
    :required="field.required"
    :hint="hint ?? t('cms.editor.form.link.hrefHint')"
    :error="error"
    :note="note"
  >
    <!-- One line, like the other fields: text, address, new tab. -->
    <div
      ref="el"
      class="entry-form-link"
      :class="{ 'entry-form-link--error': error }"
      :aria-invalid="error ? 'true' : undefined"
    >
      <div class="entry-form-link__text">
        <AdminInput
          :model-value="stored.label ?? ''"
          :label="t('cms.editor.form.link.label')"
          :placeholder="t('cms.editor.form.link.label')"
          hide-label
          :readonly="labelLocked"
          autocomplete="off"
          @update:model-value="update({ label: $event })"
          @blur="endEdit"
        />
      </div>
      <div class="entry-form-link__href">
        <AdminInput
          :model-value="href"
          :label="t('cms.editor.form.link.href')"
          placeholder="https://"
          hide-label
          inputmode="url"
          spellcheck="false"
          :readonly="structureLocked"
          autocomplete="off"
          @update:model-value="update({ href: $event.trim() })"
          @blur="endEdit"
        >
          <template #leading>
            <Icon
              name="lucide:link"
              aria-hidden="true"
            />
          </template>
        </AdminInput>
      </div>
      <AdminCheckbox
        :model-value="stored.newTab === true"
        :label="t('cms.editor.form.link.newTab')"
        :disabled="structureLocked"
        class="entry-form-link__tab"
        @update:model-value="update({ newTab: $event })"
      />
    </div>
  </FormField>
</template>

<style scoped>
.entry-form-link {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr) max-content;
  align-items: center;
  gap: var(--cms-space-2) var(--cms-space-3);
  border-radius: var(--cms-radius-sm);
}

.entry-form-link--error :deep(.admin-input__control) {
  border-color: var(--cms-destructive);
}

/* A phone: text and address stacked. */
@media (max-width: 767px) {
  .entry-form-link {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
