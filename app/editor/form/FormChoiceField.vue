<script setup lang="ts">
import { computed, type ComponentPublicInstance } from 'vue'
import { contentLabel } from '../../admin/content-label'
import { useAdminI18n } from '../../admin/useAdminI18n'
import type { CmsContentField } from '../../../src/content-fields'
import { useEditor } from '../inject'
import FormField from './FormField.vue'
import { issueMessage } from './messages'
import { useFormField } from './use-form-field'

type ChoiceField = Extract<CmsContentField, { type: 'radio' | 'multiselect' | 'boolean' }>

// Choices of Core's entry form (014, C-103): radio buttons, a multi-select
// with chips, a yes / no as a switch or a checkbox. Structure: the same in
// every language (C-78). A value no longer among the options stays, marked,
// and blocks publishing until it is changed.
const props = defineProps<{
  address: string
  field: ChoiceField
  label: string
  hint?: string
}>()

const { t, locale } = useAdminI18n()
const { engine } = useEditor()
const form = useFormField(props.address, props.field, () => props.label)

const error = computed(() => issueMessage(form.issue.value, t, props.field, { value: form.value.value }))
const note = computed(() => (engine.translating.value
  ? t('cms.editor.form.structure', { code: engine.defaultLocaleLabel.value })
  : undefined))

const options = computed(() => (props.field.type === 'boolean'
  ? []
  : props.field.options.map(option => ({ value: option.value, label: contentLabel(option.label, locale.value) }))))

/** Radio: the stored value; one no longer offered shows as a marked extra choice. */
const radioOptions = computed(() => {
  const current = form.value.value
  return typeof current === 'string' && current && !options.value.some(option => option.value === current)
    ? [...options.value, { value: current, label: t('cms.editor.form.unknownOption', { value: current }) }]
    : options.value
})

const radio = computed<string | null>({
  get: () => (typeof form.value.value === 'string' ? form.value.value : null),
  set: next => form.choose(next),
})

const many = computed<string[]>({
  get: () => (Array.isArray(form.value.value) ? form.value.value.filter((item): item is string => typeof item === 'string') : []),
  set: next => form.choose(next),
})

const yes = computed<boolean>({
  get: () => form.value.value === true,
  set: next => form.choose(next),
})

const placeholder = computed(() => ('placeholder' in props.field && props.field.placeholder
  ? contentLabel(props.field.placeholder, locale.value)
  : t('cms.editor.form.addOption')))

function bind(selector: string) {
  return (node: Element | ComponentPublicInstance | null) => {
    const root = node && '$el' in node ? node.$el as Element : node
    form.el.value = root instanceof Element ? root.querySelector<HTMLElement>(selector) ?? root as HTMLElement : null
  }
}
</script>

<template>
  <FormField
    :label="field.type === 'boolean' ? '' : label"
    :required="'required' in field && field.required"
    :hint="hint"
    :error="error"
    :note="note"
  >
    <AdminRadioGroup
      v-if="field.type === 'radio'"
      :ref="bind('input')"
      v-model="radio"
      :options="radioOptions"
      :label="label"
      :disabled="form.readonly.value"
      inline
    />
    <AdminMultiSelect
      v-else-if="field.type === 'multiselect'"
      :ref="bind('input')"
      v-model="many"
      :options="options"
      :label="label"
      :placeholder="placeholder"
      :max="field.max"
      :disabled="form.readonly.value"
      :invalid="Boolean(error)"
      :unknown-label="(value: string) => t('cms.editor.form.unknownOption', { value })"
    />
    <!-- Next to fields with a label, on the line of their controls. -->
    <div
      v-else
      class="form-boolean"
      :class="{ 'form-boolean--beside': field.width && field.width !== 'full' }"
    >
      <AdminCheckbox
        v-if="field.appearance === 'checkbox'"
        :ref="bind('input')"
        v-model="yes"
        :label="label"
        :disabled="form.readonly.value"
      />
      <AdminSwitch
        v-else
        :ref="bind('button')"
        v-model="yes"
        :label="label"
        :disabled="form.readonly.value"
      />
    </div>
  </FormField>
</template>

<style scoped>
.form-boolean {
  display: flex;
  align-items: center;
}

/* In a row with other fields: below where their labels are, centred on
   their controls. */
.form-boolean--beside {
  min-height: var(--cms-control-md);
  margin-top: calc(var(--cms-type-label-large-line) + var(--cms-space-1));
}

@media (max-width: 767px) {
  .form-boolean--beside {
    min-height: 0;
    margin-top: 0;
  }
}
</style>
