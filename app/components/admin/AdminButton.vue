<script setup lang="ts">
const props = withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'link'
  /** `xs` is the compact size of editor panels and toolbars; 44px on touch screens. */
  size?: 'xs' | 'sm' | 'md' | 'lg'
  iconOnly?: boolean
  loading?: boolean
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  /** Renders a link styled as a button. Navigation must stay a link, not a click handler. */
  to?: string
}>(), {
  variant: 'primary',
  size: 'md',
  iconOnly: false,
  loading: false,
  disabled: false,
  type: 'button',
  to: undefined,
})

const NuxtLink = resolveComponent('NuxtLink')

const slots = useSlots()
const isDisabled = computed(() => props.disabled || props.loading)
const showLabel = computed(() => !props.iconOnly && Boolean(slots.default))
const showTrailing = computed(() => !props.iconOnly && Boolean(slots.trailing))
</script>

<template>
  <component
    :is="to ? NuxtLink : 'button'"
    :to="to"
    :type="to ? undefined : type"
    class="admin-button"
    :class="[
      `admin-button--${variant}`,
      `admin-button--${size}`,
      { 'admin-button--icon': iconOnly },
    ]"
    :disabled="to ? undefined : isDisabled"
    :aria-busy="loading || undefined"
  >
    <span
      v-if="loading"
      class="admin-button__icon admin-button__icon--spin"
    >
      <Icon
        name="lucide:loader-circle"
        aria-hidden="true"
      />
    </span>
    <span
      v-else-if="slots.leading"
      class="admin-button__icon"
    >
      <slot name="leading" />
    </span>
    <span
      v-if="showLabel"
      class="admin-button__label"
    >
      <slot />
    </span>
    <span
      v-else-if="iconOnly && !loading && !slots.leading && slots.default"
      class="admin-button__icon"
    >
      <slot />
    </span>
    <span
      v-if="showTrailing"
      class="admin-button__icon"
    >
      <slot name="trailing" />
    </span>
  </component>
</template>

<style scoped>
.admin-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--cms-space-2);
  margin: 0;
  border: var(--cms-border-width) solid transparent;
  border-radius: var(--cms-radius-sm);
  background: transparent;
  color: var(--cms-foreground);
  font-family: inherit;
  font-size: var(--cms-type-label-large-size);
  font-weight: var(--cms-type-label-large-weight);
  line-height: var(--cms-type-label-large-line);
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  user-select: none;
}

.admin-button:focus {
  outline: none;
}

.admin-button:focus-visible {
  box-shadow: var(--cms-focus-ring);
}

.admin-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.admin-button--xs {
  height: var(--cms-control-xs);
  padding-inline: var(--cms-space-2);
  font-size: var(--cms-type-label-size);
  font-weight: var(--cms-type-label-weight);
}

.admin-button--sm {
  height: var(--cms-control-sm);
  padding-inline: var(--cms-space-3);
}

.admin-button--md {
  height: var(--cms-control-md);
  padding-inline: var(--cms-space-4);
}

.admin-button--lg {
  height: var(--cms-control-lg);
  padding-inline: var(--cms-space-4);
}

.admin-button--icon {
  width: var(--cms-control-md);
  padding-inline: 0;
}

.admin-button--xs.admin-button--icon {
  width: var(--cms-control-xs);
}

.admin-button--sm.admin-button--icon {
  width: var(--cms-control-sm);
}

/* Touch targets: 44px where the pointer is a finger (WCAG 2.5.8 / Apple HIG). */
@media (pointer: coarse) {
  .admin-button--xs,
  .admin-button--sm {
    min-height: 44px;
  }

  .admin-button--xs.admin-button--icon,
  .admin-button--sm.admin-button--icon {
    min-width: 44px;
  }
}

.admin-button--lg.admin-button--icon {
  width: var(--cms-control-lg);
}

.admin-button--primary {
  background: var(--cms-primary);
  color: var(--cms-primary-foreground);
}

.admin-button--primary:hover:not(:disabled) {
  background: var(--cms-primary-hover);
}

.admin-button--primary:active:not(:disabled) {
  background: var(--cms-primary-active);
}

.admin-button--secondary {
  border-color: var(--cms-border);
  background: var(--cms-card);
  color: var(--cms-foreground);
}

.admin-button--secondary:hover:not(:disabled),
.admin-button--secondary:active:not(:disabled) {
  background: var(--cms-surface-hover);
}

.admin-button--ghost {
  color: var(--cms-text-secondary);
}

.admin-button--ghost:hover:not(:disabled),
.admin-button--ghost:active:not(:disabled) {
  background: var(--cms-surface-hover);
}

.admin-button--destructive {
  background: var(--cms-destructive);
  color: var(--cms-primary-foreground);
}

.admin-button--destructive:hover:not(:disabled) {
  background: var(--cms-destructive-text);
}

.admin-button--destructive:active:not(:disabled) {
  background: color-mix(in srgb, var(--cms-destructive-text) 78%, black);
}

.admin-button--link {
  color: var(--cms-primary);
}

.admin-button--link:hover:not(:disabled) {
  color: var(--cms-primary-hover);
  text-decoration: underline;
}

.admin-button--link:active:not(:disabled) {
  color: var(--cms-primary-active);
}

/* An icon put in the label slot (not #leading) sits on the text's center too. */
.admin-button__label {
  display: inline-flex;
  align-items: center;
  gap: var(--cms-space-2);
}

.admin-button__label :deep(svg) {
  flex: none;
  width: var(--cms-icon-size);
  height: var(--cms-icon-size);
}

.admin-button__icon {
  display: inline-flex;
  flex: none;
  width: var(--cms-icon-size);
  height: var(--cms-icon-size);
}

.admin-button__icon :deep(svg) {
  width: var(--cms-icon-size);
  height: var(--cms-icon-size);
}

.admin-button__icon--spin :deep(svg) {
  animation: cms-admin-spin 0.8s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .admin-button__icon--spin :deep(svg) {
    animation: none;
  }
}

@keyframes cms-admin-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
