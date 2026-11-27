<script setup lang="ts">
import { contentLabel } from '../../admin/content-label'
import type { CmsContentField } from '../../../src/content-fields'
import FormChoiceField from './FormChoiceField.vue'
import FormDateField from './FormDateField.vue'
import FormImageField from './FormImageField.vue'
import FormLinkField from './FormLinkField.vue'
import FormRichTextField from './FormRichTextField.vue'
import FormValueField from './FormValueField.vue'

// The form of a Content type (014, C-103): the fields declared in
// cms.content.ts, in their order, each with the admin's own control, on the
// same Engine as Edit Mode. A row has four columns: a field takes all of
// them (full), two (half) or one (quarter); on narrower screens quarters
// grow to halves, and on a phone every field is full.
defineProps<{
  fields: Record<string, CmsContentField>
  /** The admin's language, for the labels of the declaration. */
  locale: string
}>()

const VALUE_TYPES = new Set(['text', 'textarea', 'email', 'url', 'phone', 'number', 'select'])
const CHOICE_TYPES = new Set(['radio', 'multiselect', 'boolean'])
const DATE_TYPES = new Set(['date', 'datetime', 'dateRange'])
</script>

<template>
  <div
    class="entry-form"
    data-test="entry-form"
  >
    <div
      v-for="(field, address) in fields"
      :key="address"
      class="entry-form__cell"
      :class="`entry-form__cell--${field.width ?? 'full'}`"
      :data-field="String(address)"
    >
      <FormRichTextField
        v-if="field.type === 'richText'"
        :address="String(address)"
        :field="field"
        :label="contentLabel(field.label, locale)"
        :hint="field.hint ? contentLabel(field.hint, locale) : undefined"
      />
      <FormImageField
        v-else-if="field.type === 'image'"
        :address="String(address)"
        :field="field"
        :label="contentLabel(field.label, locale)"
        :hint="field.hint ? contentLabel(field.hint, locale) : undefined"
      />
      <FormLinkField
        v-else-if="field.type === 'link'"
        :address="String(address)"
        :field="field"
        :label="contentLabel(field.label, locale)"
        :hint="field.hint ? contentLabel(field.hint, locale) : undefined"
      />
      <FormDateField
        v-else-if="DATE_TYPES.has(field.type)"
        :address="String(address)"
        :field="field as Extract<CmsContentField, { type: 'date' | 'datetime' | 'dateRange' }>"
        :label="contentLabel(field.label, locale)"
        :hint="field.hint ? contentLabel(field.hint, locale) : undefined"
      />
      <FormChoiceField
        v-else-if="CHOICE_TYPES.has(field.type)"
        :address="String(address)"
        :field="field as Extract<CmsContentField, { type: 'radio' | 'multiselect' | 'boolean' }>"
        :label="contentLabel(field.label, locale)"
        :hint="field.hint ? contentLabel(field.hint, locale) : undefined"
      />
      <FormValueField
        v-else-if="VALUE_TYPES.has(field.type)"
        :address="String(address)"
        :field="field as Extract<CmsContentField, { type: 'text' | 'textarea' | 'email' | 'url' | 'phone' | 'number' | 'select' }>"
        :label="contentLabel(field.label, locale)"
        :hint="field.hint ? contentLabel(field.hint, locale) : undefined"
      />
    </div>
  </div>
</template>

<style scoped>
.entry-form {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--cms-space-5) var(--cms-space-4);
  align-items: start;
}

.entry-form__cell {
  grid-column: span 4;
  min-width: 0;
}

.entry-form__cell--half {
  grid-column: span 2;
}

.entry-form__cell--quarter {
  grid-column: span 1;
}

@media (max-width: 1023px) {
  .entry-form__cell--quarter {
    grid-column: span 2;
  }
}

@media (max-width: 767px) {
  .entry-form__cell--half,
  .entry-form__cell--quarter {
    grid-column: span 4;
  }
}
</style>
