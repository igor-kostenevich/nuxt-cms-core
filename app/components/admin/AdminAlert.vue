<script setup lang="ts">
const props = defineProps<{
  tone: 'info' | 'success' | 'warning' | 'danger'
  title: string
  dismissible?: boolean
}>()

const emit = defineEmits<{
  dismiss: []
}>()

const { t } = useI18n()

const toneIcon = {
  info: 'lucide:info',
  success: 'lucide:circle-check',
  warning: 'lucide:triangle-alert',
  danger: 'lucide:circle-alert',
} as const

const role = computed(() => {
  return props.tone === 'danger' || props.tone === 'warning' ? 'alert' : 'status'
})
</script>

<template>
  <div
    class="admin-alert"
    :class="`admin-alert--${tone}`"
    :role="role"
  >
    <Icon
      class="admin-alert__icon"
      :name="toneIcon[tone]"
      aria-hidden="true"
    />
    <div class="admin-alert__body">
      <p class="admin-alert__title">
        {{ title }}
      </p>
      <div
        v-if="$slots.default"
        class="admin-alert__description"
      >
        <slot />
      </div>
      <div
        v-if="$slots.action"
        class="admin-alert__action"
      >
        <slot name="action" />
      </div>
    </div>
    <AdminButton
      v-if="dismissible"
      class="admin-alert__dismiss"
      variant="ghost"
      size="sm"
      icon-only
      type="button"
      :aria-label="t('admin.alert.dismiss')"
      @click="emit('dismiss')"
    >
      <template #leading>
        <Icon
          name="lucide:x"
          aria-hidden="true"
        />
      </template>
    </AdminButton>
  </div>
</template>

<style scoped>
.admin-alert {
  display: flex;
  align-items: flex-start;
  gap: var(--cms-space-3);
  padding: var(--cms-space-4);
  border: var(--cms-border-width) solid transparent;
  border-radius: var(--cms-radius-sm);
}

.admin-alert--info {
  border-color: var(--cms-info-border);
  background: var(--cms-info-subtle);
  color: var(--cms-info-text);
}

.admin-alert--success {
  border-color: var(--cms-success-border);
  background: var(--cms-success-subtle);
  color: var(--cms-success-text);
}

.admin-alert--warning {
  border-color: var(--cms-warning-border);
  background: var(--cms-warning-subtle);
  color: var(--cms-warning);
}

.admin-alert--danger {
  border-color: var(--cms-destructive-border);
  background: var(--cms-destructive-subtle);
  color: var(--cms-destructive-text);
}

.admin-alert__icon {
  flex: none;
  width: var(--cms-icon-size);
  height: var(--cms-icon-size);
  margin-top: 2px;
}

.admin-alert__body {
  flex: 1;
  min-width: 0;
}

.admin-alert__title {
  margin: 0;
  font-size: var(--cms-type-label-large-size);
  font-weight: var(--cms-type-label-large-weight);
  line-height: var(--cms-type-label-large-line);
}

.admin-alert__description {
  margin-top: var(--cms-space-1);
  opacity: 0.9;
  font-size: var(--cms-type-helper-size);
  font-weight: var(--cms-type-helper-weight);
  line-height: var(--cms-type-helper-line);
}

.admin-alert__description :deep(p) {
  margin: 0;
}

.admin-alert__action {
  margin-top: var(--cms-space-2);
}

.admin-alert__action :deep(.admin-button--link) {
  height: auto;
  padding: 0;
  color: inherit;
}

.admin-alert__dismiss.admin-button--ghost {
  flex: none;
  margin: calc(var(--cms-space-2) * -1);
  color: inherit;
}
</style>
