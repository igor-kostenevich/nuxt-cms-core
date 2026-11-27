<script setup lang="ts">
// Date control of the admin UI kit (design: Figma "Date and date range",
// node 17:7682), on @vuepic/vue-datepicker with the admin's tokens. One
// component, three modes:
//   date  — a calendar day, `YYYY-MM-DD`;
//   range — two days, `[start, end]`;
//   time  — a wall-clock time, `HH:mm` (no date: no time-zone shift).
// The value never passes through a time zone: a day is a day everywhere.
// Admin only: the library and its styles load with the admin's chunks.
import { computed } from 'vue'
import { VueDatePicker, type ModelValue } from '@vuepic/vue-datepicker'
// Scoped to `.cms-admin` by Core's module (`?cms-admin`, src/admin-css.ts).
import '@vuepic/vue-datepicker/dist/main.css?cms-admin'
import { enUS, uk } from 'date-fns/locale'

type Value = string | [string, string] | null

const model = defineModel<Value>({ default: null })

const props = withDefaults(defineProps<{
  mode?: 'date' | 'range' | 'time'
  /** Accessible name (the visible label is the field's). */
  label: string
  placeholder?: string
  /** The admin's language: month and day names. */
  locale?: string
  /** `YYYY-MM-DD` bounds (date and range). */
  min?: string
  max?: string
  disabled?: boolean
  readonly?: boolean
  invalid?: boolean
}>(), { mode: 'date', placeholder: undefined, locale: 'en', min: undefined, max: undefined })

const LOCALES = { uk, en: enUS }
const dateLocale = computed(() => LOCALES[props.locale as keyof typeof LOCALES] ?? enUS)

/** The library's value for `time`: `{ hours, minutes }`. */
const pickerValue = computed<ModelValue>({
  get: () => {
    if (props.mode === 'time') {
      if (typeof model.value !== 'string' || !/^\d{2}:\d{2}$/.test(model.value)) {
        return null
      }

      const [hours = 0, minutes = 0] = model.value.split(':').map(Number)
      return { hours, minutes }
    }

    return model.value
  },
  set: (value: unknown) => {
    if (props.mode === 'time') {
      const time = value as { hours: number, minutes: number } | null
      model.value = time ? `${String(time.hours).padStart(2, '0')}:${String(time.minutes).padStart(2, '0')}` : null
      return
    }

    model.value = (value as Value) ?? null
  },
})

const inputFormat = computed(() => (props.mode === 'time' ? 'HH:mm' : 'dd.MM.yyyy'))

// Esc with the calendar open closes only the calendar, not the dialog around
// it. Whether it was open is read before the library closes it (capture), and
// the key is kept from the dialog after the library handled it (bubble).
let menuOpenOnEscape = false

function onKeydownCapture(event: KeyboardEvent) {
  menuOpenOnEscape = event.key === 'Escape' && !!(event.currentTarget as HTMLElement).querySelector('.dp--menu')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && menuOpenOnEscape) {
    event.preventDefault()
    event.stopPropagation()
  }

  menuOpenOnEscape = false
}
</script>

<template>
  <div
    class="admin-date"
    :class="{ 'admin-date--invalid': invalid }"
    @keydown.capture="onKeydownCapture"
    @keydown="onKeydown"
  >
    <VueDatePicker
      v-model="pickerValue"
      :model-type="mode === 'time' ? undefined : 'yyyy-MM-dd'"
      :range="mode === 'range' ? { partialRange: false } : false"
      :time-picker="mode === 'time'"
      :time-config="{ enableTimePicker: mode === 'time', is24: true }"
      :formats="{ input: inputFormat, preview: inputFormat }"
      :locale="dateLocale"
      :week-start="1"
      :min-date="min"
      :max-date="max"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :teleport="false"
      :auto-apply="true"
      :text-input="true"
      :aria-labels="{ input: label }"
      :input-attrs="{ clearable: true }"
    />
  </div>
</template>

<style scoped>
/* The library's theme, from the admin's tokens. */
.admin-date :deep(.dp--theme-light) {
  --dp-font-family: var(--cms-font);
  --dp-font-size: var(--cms-type-body-size);
  --dp-preview-font-size: var(--cms-type-body-small-size);
  --dp-border-radius: var(--cms-radius-sm);
  --dp-cell-border-radius: var(--cms-radius-sm);
  --dp-background-color: var(--cms-card);
  --dp-text-color: var(--cms-foreground);
  --dp-hover-color: var(--cms-surface-hover);
  --dp-hover-text-color: var(--cms-foreground);
  --dp-hover-icon-color: var(--cms-text-secondary);
  --dp-primary-color: var(--cms-primary);
  --dp-primary-disabled-color: var(--cms-primary-disabled);
  --dp-primary-text-color: var(--cms-primary-foreground);
  --dp-secondary-color: var(--cms-text-tertiary);
  --dp-border-color: var(--cms-border);
  --dp-menu-border-color: var(--cms-border);
  --dp-border-color-hover: var(--cms-border-strong);
  --dp-border-color-focus: var(--cms-ring);
  --dp-disabled-color: var(--cms-surface-disabled);
  --dp-disabled-color-text: var(--cms-text-disabled);
  --dp-icon-color: var(--cms-text-secondary);
  --dp-danger-color: var(--cms-destructive);
  --dp-highlight-color: var(--cms-primary-subtle);
  --dp-range-between-dates-background-color: var(--cms-primary-subtle);
  --dp-range-between-dates-text-color: var(--cms-foreground);
  --dp-range-between-border-color: var(--cms-primary-subtle);
  /* Room for the calendar icon on the left: its inset, the icon, a gap. */
  --dp-input-padding: 0 var(--cms-space-3) 0 calc(var(--cms-space-3) + var(--cms-icon-size) + var(--cms-space-2));
}

.admin-date :deep(.dp--input) {
  height: var(--cms-control-md);
  font-variant-numeric: tabular-nums;
}

.admin-date :deep(.dp--input-focus) {
  box-shadow: var(--cms-focus-ring-field);
}

.admin-date--invalid :deep(.dp--input) {
  border-color: var(--cms-destructive);
}

.admin-date :deep(.dp--menu) {
  box-shadow: var(--cms-shadow-overlay);
}
</style>
