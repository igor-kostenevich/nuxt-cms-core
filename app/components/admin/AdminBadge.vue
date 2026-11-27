<script setup lang="ts">
// Status badge of the admin UI kit: a short word in a pill. The tone carries
// the meaning (published, needs attention, off), the text says it.
import type { AdminBadgeTone } from '../../admin/status-tone'

withDefaults(defineProps<{ tone?: AdminBadgeTone }>(), { tone: 'neutral' })
</script>

<template>
  <span
    class="admin-badge"
    :class="`admin-badge--${tone}`"
  ><slot /></span>
</template>

<style scoped>
.admin-badge {
  justify-self: start;
  padding: 2px var(--cms-space-2);
  border-radius: var(--cms-radius-full);
  background: var(--cms-surface-secondary);
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-caption-size);
  font-weight: 600;
  white-space: nowrap;
}

.admin-badge--success {
  background: var(--cms-success-subtle);
  color: var(--cms-success-text);
}

.admin-badge--warning {
  background: var(--cms-warning-subtle);
  color: var(--cms-warning);
}

.admin-badge--muted {
  color: var(--cms-text-tertiary);
}
</style>
