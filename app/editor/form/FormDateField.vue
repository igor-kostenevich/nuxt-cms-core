<script setup lang="ts">
import { computed, ref, watch, type ComponentPublicInstance } from 'vue'
import { contentLabel } from '../../admin/content-label'
import { useAdminI18n } from '../../admin/useAdminI18n'
import type { CmsContentField } from '../../../src/content-fields'
import { useEditor } from '../inject'
import { browserTimeZone, formatOffset, localToUtc, utcToLocal, type LocalMoment } from './datetime'
import FormField from './FormField.vue'
import { issueMessage } from './messages'
import { useFormField } from './use-form-field'

type DateField = Extract<CmsContentField, { type: 'date' | 'datetime' | 'dateRange' }>

// Dates of Core's entry form (014, C-103): a day, a range of days, or a
// moment. Days are stored as written (`YYYY-MM-DD`), never through a time
// zone. A moment is stored in UTC and edited in the editor's own zone, shown
// under the field: a time the clocks skip is refused, a time they pass twice
// asks which of the two is meant. Structure: the same in every language.
const props = defineProps<{
  address: string
  field: DateField
  label: string
  hint?: string
}>()

const { t, locale } = useAdminI18n()
const { engine } = useEditor()
const form = useFormField(props.address, props.field, () => props.label)

const zone = browserTimeZone()
const placeholder = computed(() => ('placeholder' in props.field && props.field.placeholder
  ? contentLabel(props.field.placeholder, locale.value)
  : undefined))

// ── A day / a range ──────────────────────────────────────────────────

const day = computed<string | null>({
  get: () => (typeof form.value.value === 'string' ? form.value.value : null),
  set: next => form.choose(next),
})

const range = computed<[string, string] | null>({
  get: () => {
    const value = form.value.value as { start?: unknown, end?: unknown } | undefined
    return value && typeof value.start === 'string' && typeof value.end === 'string' ? [value.start, value.end] as [string, string] : null
  },
  set: (next: [string, string] | null) => form.choose(next ? { start: next[0], end: next[1] } : undefined),
})

// ── A moment ─────────────────────────────────────────────────────────

/** The wall clock being typed: kept apart from the stored moment until it names one. */
const wallDate = ref<string | null>(null)
const wallTime = ref<string | null>(null)
/** The two moments of a time the clocks pass twice, until one is chosen. */
const ambiguous = ref<[LocalMoment, LocalMoment] | null>(null)
const nonexistent = ref(false)

watch(() => form.value.value, (value) => {
  if (props.field.type !== 'datetime') {
    return
  }

  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    const local = utcToLocal(value, zone)
    wallDate.value = local.date
    wallTime.value = local.time
  } else if (value === undefined && !ambiguous.value && !nonexistent.value) {
    wallDate.value = null
    wallTime.value = null
  }
}, { immediate: true })

function commitMoment() {
  ambiguous.value = null
  nonexistent.value = false

  if (!wallDate.value && !wallTime.value) {
    form.choose(undefined)
    return
  }

  if (!wallDate.value || !wallTime.value) {
    return
  }

  const resolved = localToUtc(wallDate.value, wallTime.value, zone)

  if (resolved.kind === 'nonexistent') {
    nonexistent.value = true
    return
  }

  if (resolved.kind === 'ambiguous') {
    ambiguous.value = resolved.moments
    return
  }

  form.choose(resolved.moment.iso)
}

const momentDate = computed<string | null>({
  get: () => wallDate.value,
  set: (next) => {
    wallDate.value = next
    commitMoment()
  },
})

const momentTime = computed<string | null>({
  get: () => wallTime.value,
  set: (next) => {
    wallTime.value = next
    commitMoment()
  },
})

function pick(moment: LocalMoment) {
  ambiguous.value = null
  form.choose(moment.iso)
}

const zoneNote = computed(() => {
  const value = form.value.value
  const offset = typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? utcToLocal(value, zone).offset : null
  return t('cms.editor.form.zone', { zone, offset: offset === null ? '' : ` (${formatOffset(offset)})` })
})

// ── The frame ────────────────────────────────────────────────────────

const error = computed(() => (nonexistent.value
  ? t('cms.editor.form.timeNonexistent')
  : issueMessage(form.issue.value, t, props.field, { value: form.value.value })))

const note = computed(() => (engine.translating.value
  ? t('cms.editor.form.structure', { code: engine.defaultLocaleLabel.value })
  : undefined))

function bind(node: Element | ComponentPublicInstance | null) {
  const root = node && '$el' in node ? node.$el as Element : node
  form.el.value = root instanceof Element ? root.querySelector<HTMLElement>('input') : null
}
</script>

<template>
  <FormField
    :label="label"
    :required="field.required"
    :hint="field.type === 'datetime' ? [hint, zoneNote].filter(Boolean).join(' · ') : hint"
    :error="error"
    :note="note"
  >
    <AdminDatePicker
      v-if="field.type === 'date'"
      :ref="bind"
      v-model="day"
      :label="label"
      :placeholder="placeholder"
      :locale="locale"
      :min="field.min"
      :max="field.max"
      :readonly="form.readonly.value"
      :invalid="Boolean(error)"
    />
    <AdminDatePicker
      v-else-if="field.type === 'dateRange'"
      :ref="bind"
      v-model="range"
      mode="range"
      :label="label"
      :placeholder="placeholder"
      :locale="locale"
      :min="field.min"
      :max="field.max"
      :readonly="form.readonly.value"
      :invalid="Boolean(error)"
    />
    <div
      v-else
      class="entry-form-moment"
    >
      <AdminDatePicker
        :ref="bind"
        v-model="momentDate"
        :label="label"
        :placeholder="placeholder"
        :locale="locale"
        :readonly="form.readonly.value"
        :invalid="Boolean(error)"
        class="entry-form-moment__date"
      />
      <AdminDatePicker
        v-model="momentTime"
        mode="time"
        :label="`${label} · ${t('cms.editor.form.time')}`"
        :placeholder="t('cms.editor.form.time')"
        :locale="locale"
        :readonly="form.readonly.value"
        :invalid="Boolean(error)"
        class="entry-form-moment__time"
      />
    </div>
    <div
      v-if="ambiguous"
      class="entry-form-moment__choice"
      role="group"
      :aria-label="t('cms.editor.form.timeAmbiguous')"
    >
      <span>{{ t('cms.editor.form.timeAmbiguous') }}</span>
      <AdminButton
        v-for="moment in ambiguous"
        :key="moment.iso"
        type="button"
        variant="secondary"
        size="sm"
        @click="pick(moment)"
      >
        {{ wallTime }} ({{ formatOffset(moment.offset) }})
      </AdminButton>
    </div>
  </FormField>
</template>

<style scoped>
.entry-form-moment {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 8rem;
  gap: var(--cms-space-2);
}

.entry-form-moment__choice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cms-space-2);
  padding: var(--cms-space-2) var(--cms-space-3);
  border-radius: var(--cms-radius-sm);
  background: var(--cms-warning-subtle);
  color: var(--cms-warning);
  font-size: var(--cms-type-body-small-size);
}
</style>
