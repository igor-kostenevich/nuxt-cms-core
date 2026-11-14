<script setup lang="ts">
const model = defineModel<boolean>({ default: false })

defineProps<{
  label: string
  hint?: string
  disabled?: boolean
}>()

const id = useId()
const hintId = `${id}-hint`
</script>

<template>
  <div class="admin-switch">
    <button
      :id="id"
      type="button"
      role="switch"
      class="admin-switch__control"
      :class="{ 'admin-switch__control--on': model }"
      :aria-checked="model"
      :aria-describedby="hint ? hintId : undefined"
      :disabled="disabled"
      @click="model = !model"
    >
      <span class="admin-switch__thumb" />
    </button>
    <div class="admin-switch__copy">
      <label
        class="admin-switch__label"
        :for="id"
      >
        {{ label }}
      </label>
      <p
        v-if="hint"
        :id="hintId"
        class="admin-switch__hint"
      >
        {{ hint }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.admin-switch {
  display: flex;
  align-items: flex-start;
  gap: var(--cms-space-3);
}

.admin-switch__control {
  position: relative;
  flex: none;
  width: var(--cms-switch-width);
  height: var(--cms-switch-height);
  margin: 1px 0 0;
  padding: 0;
  border: 0;
  border-radius: var(--cms-radius-full);
  background: var(--cms-neutral-300);
  cursor: pointer;
}

.admin-switch__control:focus-visible {
  outline: none;
  box-shadow: var(--cms-focus-ring);
}

.admin-switch__control--on {
  background: var(--cms-primary);
}

.admin-switch__thumb {
  position: absolute;
  top: var(--cms-switch-inset);
  left: var(--cms-switch-inset);
  width: var(--cms-switch-thumb);
  height: var(--cms-switch-thumb);
  border-radius: var(--cms-radius-full);
  background: var(--cms-neutral-0);
  transition: transform 120ms ease;
}

.admin-switch__control--on .admin-switch__thumb {
  transform: translateX(calc(var(--cms-switch-width) - var(--cms-switch-thumb) - var(--cms-switch-inset) * 2));
}

.admin-switch__control:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.admin-switch__label {
  display: block;
  color: var(--cms-foreground);
  font-size: var(--cms-type-label-large-size);
  font-weight: var(--cms-type-label-large-weight);
  line-height: var(--cms-type-label-large-line);
  cursor: pointer;
}

.admin-switch__control:disabled + .admin-switch__copy .admin-switch__label {
  cursor: not-allowed;
}

.admin-switch__hint {
  margin: var(--cms-space-1) 0 0;
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-helper-size);
  font-weight: var(--cms-type-helper-weight);
  line-height: var(--cms-type-helper-line);
}

@media (prefers-reduced-motion: reduce) {
  .admin-switch__thumb {
    transition: none;
  }
}
</style>
