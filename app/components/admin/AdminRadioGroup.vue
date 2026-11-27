<script setup lang="ts" generic="T extends string">
// Radio buttons of the admin UI kit (design: Figma "Radio button", node
// 17:7609): every choice visible, one at a time. A native radio group, so
// arrow keys move the choice.
import { useId } from 'vue'

export interface AdminRadioOption<V extends string = string> {
  value: V
  label: string
}

const model = defineModel<T | null>({ required: true })

defineProps<{
  options: AdminRadioOption<T>[]
  /** Name of the group for screen readers (shown by the field around it). */
  label: string
  disabled?: boolean
  /** Choices in a row instead of a column. */
  inline?: boolean
}>()

const name = useId()
</script>

<template>
  <div
    class="admin-radio"
    :class="{ 'admin-radio--inline': inline }"
    role="radiogroup"
    :aria-label="label"
  >
    <label
      v-for="option in options"
      :key="option.value"
      class="admin-radio__option"
      :class="{ 'admin-radio__option--disabled': disabled }"
    >
      <input
        type="radio"
        class="admin-radio__input"
        :name="name"
        :value="option.value"
        :checked="model === option.value"
        :disabled="disabled"
        @change="model = option.value"
      >
      <span
        class="admin-radio__dot"
        aria-hidden="true"
      />
      <span class="admin-radio__label">{{ option.label }}</span>
    </label>
  </div>
</template>

<style scoped>
.admin-radio {
  display: grid;
  gap: var(--cms-space-2);
}

.admin-radio--inline {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cms-space-2) var(--cms-space-5);
}

.admin-radio__option {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--cms-space-2);
  min-height: var(--cms-control-xs);
  color: var(--cms-foreground);
  font-size: var(--cms-type-body-small-size);
  line-height: var(--cms-type-body-small-line);
  cursor: pointer;
}

.admin-radio__input {
  position: absolute;
  width: var(--cms-icon-size);
  height: var(--cms-icon-size);
  margin: 0;
  opacity: 0;
  cursor: inherit;
}

.admin-radio__dot {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: var(--cms-icon-size);
  height: var(--cms-icon-size);
  border: var(--cms-border-width) solid var(--cms-border-strong);
  border-radius: 50%;
  background: var(--cms-card);
}

.admin-radio__input:checked + .admin-radio__dot {
  border-color: var(--cms-primary);
}

.admin-radio__input:checked + .admin-radio__dot::after {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--cms-primary);
  content: "";
}

.admin-radio__option:hover:not(.admin-radio__option--disabled) .admin-radio__dot {
  border-color: var(--cms-primary);
}

.admin-radio__option:hover:not(.admin-radio__option--disabled) .admin-radio__label {
  color: var(--cms-primary);
}

.admin-radio__input:focus-visible + .admin-radio__dot {
  box-shadow: var(--cms-focus-ring);
}

.admin-radio__option--disabled {
  color: var(--cms-text-disabled);
  cursor: not-allowed;
}

.admin-radio__option--disabled .admin-radio__dot {
  border-color: var(--cms-border-disabled);
  background: var(--cms-surface-disabled);
}
</style>
