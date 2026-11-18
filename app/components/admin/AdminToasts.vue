<script setup lang="ts">
import { useAdminI18n } from '../../admin/useAdminI18n'
import { useAdminToast } from '../../admin/useAdminToast'

// The toast stack of the admin, bottom right. Toasts pause while hovered or
// focused (WCAG 2.2.1); errors are alerts, everything else a status.
const { t, locale } = useAdminI18n()
const store = useAdminToast()

function run(id: number, action: () => void) {
  action()
  store.dismiss(id)
}
</script>

<template>
  <Teleport to="body">
    <div
      class="cms-admin admin-toasts"
      :lang="locale"
    >
      <TransitionGroup name="admin-toast">
        <div
          v-for="toast in store.toasts"
          :key="toast.id"
          class="admin-toast"
          :class="`admin-toast--${toast.tone}`"
          :role="toast.tone === 'error' ? 'alert' : 'status'"
          @pointerenter="store.pause(toast.id)"
          @pointerleave="store.resume(toast.id)"
          @focusin="store.pause(toast.id)"
          @focusout="store.resume(toast.id)"
        >
          <Icon
            v-if="toast.tone !== 'neutral'"
            :name="toast.tone === 'success' ? 'lucide:circle-check' : 'lucide:circle-alert'"
            aria-hidden="true"
          />
          <span class="admin-toast__text">{{ toast.message }}</span>
          <button
            v-if="toast.action"
            type="button"
            class="admin-toast__action"
            @click="run(toast.id, toast.action.run)"
          >
            {{ toast.action.label }}
          </button>
          <button
            type="button"
            class="admin-toast__close"
            :aria-label="t('cms.common.close')"
            @click="store.dismiss(toast.id)"
          >
            <Icon
              name="lucide:x"
              aria-hidden="true"
            />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.admin-toasts {
  position: fixed;
  right: max(var(--cms-space-6), env(safe-area-inset-right));
  bottom: max(var(--cms-space-6), env(safe-area-inset-bottom));
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--cms-space-2);
  min-height: 0;
  max-width: calc(100vw - 2 * var(--cms-space-6));
  background: transparent;
  pointer-events: none;
}

.admin-toast {
  display: flex;
  align-items: center;
  gap: var(--cms-space-3);
  max-width: 28rem;
  min-height: 44px;
  padding: var(--cms-space-2) var(--cms-space-2) var(--cms-space-2) var(--cms-space-4);
  border-radius: var(--cms-radius-lg);
  background: var(--cms-neutral-900);
  color: var(--cms-neutral-0);
  font-size: var(--cms-type-body-small-size);
  line-height: var(--cms-type-body-small-line);
  box-shadow: var(--cms-shadow-overlay);
  pointer-events: auto;
}

.admin-toast > .iconify {
  flex: none;
}

.admin-toast--success > .iconify {
  color: var(--cms-success-border);
}

.admin-toast--error > .iconify {
  color: var(--cms-destructive-border);
}

.admin-toast__text {
  flex: 1;
  min-width: 0;
}

.admin-toast__action,
.admin-toast__close {
  flex: none;
  min-height: var(--cms-control-sm);
  padding: 0 var(--cms-space-2);
  border: 0;
  border-radius: var(--cms-radius-sm);
  background: transparent;
  color: var(--cms-info-border);
  font: inherit;
  font-weight: var(--cms-type-label-large-weight);
  cursor: pointer;
}

.admin-toast__close {
  display: inline-flex;
  align-items: center;
  color: var(--cms-neutral-300);
}

.admin-toast__action:hover,
.admin-toast__close:hover {
  background: var(--cms-neutral-800);
}

.admin-toast__action:focus-visible,
.admin-toast__close:focus-visible {
  outline: none;
  box-shadow: var(--cms-focus-ring);
}

.admin-toast-enter-from,
.admin-toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (prefers-reduced-motion: no-preference) {
  .admin-toast-enter-active,
  .admin-toast-leave-active {
    transition: opacity 160ms ease, transform 160ms ease;
  }
}
</style>
