<script setup lang="ts">
import { computed, type ComponentPublicInstance } from 'vue'
import { contentLabel } from '../../admin/content-label'
import { useAdminI18n } from '../../admin/useAdminI18n'
import type { CmsContentField } from '../../../src/content-fields'
import { useEditor } from '../inject'
import FormField from './FormField.vue'
import { issueMessage } from './messages'
import { useFormField } from './use-form-field'

type ValueField = Extract<CmsContentField, { type: 'text' | 'textarea' | 'email' | 'url' | 'phone' | 'number' | 'select' }>

// Texts, contacts, a number and a choice of Core's entry form (014, C-103),
// on the admin kit: AdminInput, the number stepper, AdminSelect. Texts are
// translated; contacts, the number and the choice are structure (C-78).
const props = defineProps<{
  address: string
  field: ValueField
  label: string
  hint?: string
}>()

const { t, locale } = useAdminI18n()
const { engine } = useEditor()
const form = useFormField(props.address, props.field, () => props.label)

const text = computed(() => (typeof form.value.value === 'string' ? form.value.value : ''))
const placeholder = computed(() => ('placeholder' in props.field && props.field.placeholder
  ? contentLabel(props.field.placeholder, locale.value)
  : undefined))

const error = computed(() => issueMessage(form.issue.value, t, props.field, { length: text.value.length, value: form.value.value }))

const note = computed(() => {
  if (!engine.translating.value) {
    return undefined
  }

  return form.translatable
    ? (form.original.value ? t('cms.editor.form.original', { text: form.original.value }) : undefined)
    : t('cms.editor.form.structure', { code: engine.defaultLocaleLabel.value })
})

// The count once something is typed: an empty field needs no "0 / 120".
const counter = computed(() => ('maxLength' in props.field && props.field.maxLength && text.value.length > 0
  ? `${text.value.length} / ${props.field.maxLength}`
  : undefined))

const INPUT_TYPES = { text: 'text', textarea: 'text', email: 'email', url: 'url', phone: 'tel' } as const

/** Options in the admin's language; a stored value no longer offered stays, marked. */
const options = computed(() => {
  if (props.field.type !== 'select') {
    return []
  }

  const list = props.field.options.map(option => ({ value: option.value, label: contentLabel(option.label, locale.value) }))
  const current = form.value.value

  if (typeof current === 'string' && current && !list.some(option => option.value === current)) {
    list.unshift({ value: current, label: t('cms.editor.form.unknownOption', { value: current }) })
  }

  return props.field.required ? list : [{ value: '', label: t('cms.editor.form.empty') }, ...list]
})

const choice = computed<string | null>({
  get: () => (typeof form.value.value === 'string' ? form.value.value : ''),
  set: next => form.choose(next ?? ''),
})

const number = computed<number | null>({
  get: () => (typeof form.value.value === 'number' ? form.value.value : null),
  set: next => form.type(next),
})

/** The focusable control inside a kit component, for validation focus. */
function bind(selector: string) {
  return (node: Element | ComponentPublicInstance | null) => {
    const root = node && '$el' in node ? node.$el as Element : node
    form.el.value = root instanceof Element ? root.querySelector<HTMLElement>(selector) : null
  }
}
</script>

<template>
  <FormField
    :label="label"
    :required="'required' in field && field.required"
    :hint="[hint, counter].filter(Boolean).join(' · ') || undefined"
    :error="error"
    :note="note"
  >
    <AdminSelect
      v-if="field.type === 'select'"
      :ref="bind('button')"
      v-model="choice"
      :options="options"
      :label="label"
      label-placement="hidden"
      :placeholder="placeholder ?? t('cms.editor.form.empty')"
      :disabled="form.readonly.value"
    />
    <AdminNumberInput
      v-else-if="field.type === 'number'"
      :ref="bind('input')"
      v-model="number"
      :label="label"
      :min="field.min"
      :max="field.max"
      :placeholder="placeholder"
      :readonly="form.readonly.value"
      :invalid="Boolean(error)"
    />
    <AdminInput
      v-else
      :ref="bind(field.type === 'textarea' ? 'textarea' : 'input')"
      :model-value="text"
      :label="label"
      hide-label
      :multiline="field.type === 'textarea'"
      :rows="field.type === 'textarea' ? field.rows ?? 4 : undefined"
      :type="INPUT_TYPES[field.type]"
      :inputmode="field.type === 'phone' ? 'tel' : field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : undefined"
      :placeholder="placeholder"
      :readonly="form.readonly.value"
      :spellcheck="field.type === 'text' || field.type === 'textarea' ? undefined : 'false'"
      autocomplete="off"
      @update:model-value="form.type(field.type === 'url' || field.type === 'email' || field.type === 'phone' ? $event.trim() : $event)"
    />
  </FormField>
</template>
