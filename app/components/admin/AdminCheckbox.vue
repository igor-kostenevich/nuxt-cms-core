<script setup lang="ts">
// Checkbox of the admin UI kit (design: Figma "Checkbox", node 17:7578):
// a 16px box, filled with the primary color when checked; `indeterminate`
// shows a dash. The native input keeps keyboard and form behaviour.
const model = defineModel<boolean>({ default: false })

defineProps<{
  label: string
  disabled?: boolean
  indeterminate?: boolean
}>()
</script>

<template>
  <label
    class="admin-checkbox"
    :class="{ 'admin-checkbox--disabled': disabled }"
  >
    <input
      v-model="model"
      type="checkbox"
      class="admin-checkbox__input"
      :disabled="disabled"
      :indeterminate="indeterminate"
    >
    <span
      class="admin-checkbox__box"
      aria-hidden="true"
    >
      <Icon
        v-if="indeterminate"
        name="lucide:minus"
      />
      <Icon
        v-else-if="model"
        name="lucide:check"
      />
    </span>
    <span class="admin-checkbox__label">{{ label }}</span>
  </label>
</template>

<style scoped>
.admin-checkbox {
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

.admin-checkbox__input {
  position: absolute;
  width: var(--cms-icon-size);
  height: var(--cms-icon-size);
  margin: 0;
  opacity: 0;
  cursor: inherit;
}

.admin-checkbox__box {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: var(--cms-icon-size);
  height: var(--cms-icon-size);
  border: var(--cms-border-width) solid var(--cms-border-strong);
  border-radius: var(--cms-radius-sm);
  background: var(--cms-card);
  color: var(--cms-primary-foreground);
}

.admin-checkbox__box :deep(svg) {
  width: 12px;
  height: 12px;
}

.admin-checkbox__input:checked + .admin-checkbox__box,
.admin-checkbox__input:indeterminate + .admin-checkbox__box {
  border-color: var(--cms-primary);
  background: var(--cms-primary);
}

.admin-checkbox:hover:not(.admin-checkbox--disabled) .admin-checkbox__box {
  border-color: var(--cms-primary);
}

.admin-checkbox:hover:not(.admin-checkbox--disabled) .admin-checkbox__label {
  color: var(--cms-primary);
}

.admin-checkbox__input:focus-visible + .admin-checkbox__box {
  box-shadow: var(--cms-focus-ring);
}

.admin-checkbox--disabled {
  color: var(--cms-text-disabled);
  cursor: not-allowed;
}

.admin-checkbox--disabled .admin-checkbox__box {
  border-color: var(--cms-border-disabled);
  background: var(--cms-surface-disabled);
}

.admin-checkbox--disabled .admin-checkbox__input:checked + .admin-checkbox__box {
  border-color: var(--cms-primary-disabled);
  background: var(--cms-primary-disabled);
}
</style>
