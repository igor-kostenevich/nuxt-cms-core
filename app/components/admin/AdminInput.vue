<script setup lang="ts">
defineOptions({ inheritAttrs: false })

const model = defineModel<string>({ default: '' })

const props = withDefaults(defineProps<{
  label: string
  disabled?: boolean
  error?: string
  /** Help text under the field, read with it by screen readers. */
  hint?: string
  /** `sm` is the compact size of editor panels. */
  size?: 'sm' | 'md'
  /** Several lines of text. */
  multiline?: boolean
  rows?: number
  /** Keeps the label for screen readers only, e.g. a search field with a placeholder. */
  hideLabel?: boolean
}>(), {
  error: undefined,
  hint: undefined,
  size: 'md',
  multiline: false,
  rows: 2,
})

const attrs = useAttrs()
const slots = useSlots()
const id = useId()
const errorId = `${id}-error`
const hintId = `${id}-hint`
const describedBy = computed(() => [props.error ? errorId : null, props.hint ? hintId : null]
  .filter(Boolean)
  .join(' ') || undefined)
</script>

<template>
  <div class="admin-input">
    <label
      class="admin-input__label"
      :class="{ 'admin-input__label--sm': size === 'sm', 'admin-input__label--hidden': hideLabel }"
      :for="id"
    >
      {{ label }}
    </label>
    <div
      class="admin-input__field"
      :class="{ 'admin-input__field--icon': slots.leading }"
    >
      <span
        v-if="slots.leading"
        class="admin-input__icon"
      >
        <slot name="leading" />
      </span>
      <!-- v-model on <component :is> binds a component model, not the native
           field: value and input are wired by hand for both tags. -->
      <component
        :is="multiline ? 'textarea' : 'input'"
        :id="id"
        :value="model"
        v-bind="attrs"
        class="admin-input__control"
        :class="{
          'admin-input__control--error': error,
          'admin-input__control--sm': size === 'sm',
          'admin-input__control--multiline': multiline,
        }"
        :rows="multiline ? rows : undefined"
        :disabled="disabled"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="describedBy"
        @input="model = ($event.target as HTMLInputElement).value"
      />
    </div>
    <p
      v-if="error"
      :id="errorId"
      class="admin-input__error"
    >
      {{ error }}
    </p>
    <p
      v-if="hint"
      :id="hintId"
      class="admin-input__hint"
    >
      {{ hint }}
    </p>
  </div>
</template>

<style scoped>
.admin-input__label {
  display: block;
  margin: 0 0 var(--cms-space-2);
  color: var(--cms-foreground);
  font-size: var(--cms-type-label-large-size);
  font-weight: var(--cms-type-label-large-weight);
  line-height: var(--cms-type-label-large-line);
}

.admin-input__label--sm {
  margin-bottom: var(--cms-space-1);
  font-size: var(--cms-type-label-size);
  font-weight: var(--cms-type-label-weight);
  line-height: var(--cms-type-label-line);
}

.admin-input__field {
  position: relative;
}

.admin-input__icon {
  position: absolute;
  top: 50%;
  left: var(--cms-space-3);
  display: inline-flex;
  width: var(--cms-icon-size);
  height: var(--cms-icon-size);
  color: var(--cms-text-tertiary);
  transform: translateY(-50%);
  pointer-events: none;
}

.admin-input__icon :deep(svg) {
  width: var(--cms-icon-size);
  height: var(--cms-icon-size);
}

.admin-input__control {
  display: block;
  width: 100%;
  height: var(--cms-control-md);
  margin: 0;
  padding: 0 var(--cms-space-3);
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-sm);
  background: var(--cms-card);
  color: var(--cms-foreground);
  font-family: inherit;
  font-size: var(--cms-type-body-size);
  font-weight: var(--cms-type-body-weight);
  line-height: var(--cms-type-body-line);
}

.admin-input__field--icon .admin-input__control {
  padding-left: calc(var(--cms-space-3) + var(--cms-icon-size) + var(--cms-space-2));
}

.admin-input__control::placeholder {
  color: var(--cms-text-secondary);
  opacity: 1;
}

.admin-input__control:focus {
  outline: none;
  border-color: var(--cms-ring);
  box-shadow: var(--cms-focus-ring-field);
}

.admin-input__control--error,
.admin-input__control--error:focus {
  border-color: var(--cms-destructive);
}

.admin-input__control--error:focus {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--cms-destructive) 20%, transparent);
}

.admin-input__error {
  margin: var(--cms-space-1) 0 0;
  color: var(--cms-destructive-text);
  font-size: var(--cms-type-helper-size);
  font-weight: var(--cms-type-helper-weight);
  line-height: var(--cms-type-helper-line);
}

.admin-input__control--sm {
  height: var(--cms-control-sm);
  padding-inline: var(--cms-space-2);
  font-size: var(--cms-type-body-small-size);
}

.admin-input__control--multiline {
  height: auto;
  padding-block: var(--cms-space-2);
  resize: vertical;
}

.admin-input__hint {
  margin: var(--cms-space-1) 0 0;
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-helper-size);
  line-height: var(--cms-type-helper-line);
}

.admin-input__control:disabled {
  border-color: var(--cms-border-disabled);
  background: var(--cms-surface-disabled);
  color: var(--cms-text-disabled);
  cursor: not-allowed;
}
.admin-input__label--hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
