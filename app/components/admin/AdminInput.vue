<script setup lang="ts">
defineOptions({ inheritAttrs: false })

const model = defineModel<string>({ default: '' })

defineProps<{
  label: string
  disabled?: boolean
  error?: string
}>()

const attrs = useAttrs()
const slots = useSlots()
const id = useId()
const errorId = `${id}-error`
</script>

<template>
  <div class="admin-input">
    <label
      class="admin-input__label"
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
      <input
        :id="id"
        v-model="model"
        v-bind="attrs"
        class="admin-input__control"
        :class="{ 'admin-input__control--error': error }"
        :disabled="disabled"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="error ? errorId : undefined"
      >
    </div>
    <p
      v-if="error"
      :id="errorId"
      class="admin-input__error"
    >
      {{ error }}
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

.admin-input__control:disabled {
  border-color: var(--cms-border-disabled);
  background: var(--cms-surface-disabled);
  color: var(--cms-text-disabled);
  cursor: not-allowed;
}
</style>
