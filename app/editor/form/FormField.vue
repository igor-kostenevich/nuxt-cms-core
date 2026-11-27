<script setup lang="ts">
// The frame of one field of Core's entry form (014, C-103): its label, the
// control, then one line under it: the error, else the help, and in a
// translation what the original says or that the field is the same in every
// language. One look for every field type.
defineProps<{
  label: string
  /** Id of the control the label names; none for a group (image, link). */
  for?: string
  required?: boolean
  hint?: string
  error?: string
  /** Translation: the original text, or that the field is structure (C-78). */
  note?: string
}>()
</script>

<template>
  <div
    class="entry-form-field"
    :class="{ 'entry-form-field--error': error }"
  >
    <component
      :is="$props.for ? 'label' : 'span'"
      v-if="label"
      class="entry-form-field__label"
      :for="$props.for"
    >
      {{ label }}<span
        v-if="required"
        class="entry-form-field__required"
        aria-hidden="true"
      > *</span>
    </component>
    <slot />
    <p
      v-if="error"
      class="entry-form-field__error"
      role="alert"
    >
      {{ error }}
    </p>
    <p
      v-if="note"
      class="entry-form-field__note"
    >
      {{ note }}
    </p>
    <p
      v-if="hint"
      class="entry-form-field__hint"
    >
      {{ hint }}
    </p>
  </div>
</template>

<style scoped>
.entry-form-field {
  display: grid;
  gap: var(--cms-space-1);
  min-width: 0;
}

.entry-form-field__label {
  color: var(--cms-foreground);
  font-size: var(--cms-type-label-large-size);
  font-weight: var(--cms-type-label-large-weight);
  line-height: var(--cms-type-label-large-line);
}

.entry-form-field--error :deep([aria-invalid="true"]) {
  border-color: var(--cms-destructive);
}

/* Read-only in a translation (structure, C-78) or without the lock. */
.entry-form-field :deep(input[readonly]),
.entry-form-field :deep(textarea[readonly]) {
  background: var(--cms-surface-secondary);
  color: var(--cms-text-secondary);
}

.entry-form-field__required {
  color: var(--cms-destructive-text);
}

.entry-form-field__error,
.entry-form-field__note,
.entry-form-field__hint {
  margin: 0;
  font-size: var(--cms-type-helper-size);
  line-height: var(--cms-type-helper-line);
  overflow-wrap: anywhere;
}

.entry-form-field__error {
  color: var(--cms-destructive-text);
}

.entry-form-field__note {
  color: var(--cms-info-text);
}

.entry-form-field__hint {
  color: var(--cms-text-secondary);
}
</style>
