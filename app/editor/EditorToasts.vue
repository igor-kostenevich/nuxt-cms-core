<script setup lang="ts">
import { useAdminI18n } from '../admin/useAdminI18n'
import { useEditorUi } from './ui'

// Toasts pause while hovered or focused (WCAG 2.2.1); errors are alerts.
const { t, locale } = useAdminI18n()
const ui = useEditorUi()

function run(id: number, action: () => void) {
  action()
  ui.dismiss(id)
}
</script>

<template>
  <Teleport to="body">
    <div
      class="cms-admin cms-editor-ui ed-toasts"
      :lang="locale"
    >
      <TransitionGroup name="ed-toast">
        <div
          v-for="toast in ui.toasts"
          :key="toast.id"
          class="ed-toast"
          :class="`ed-toast--${toast.tone}`"
          :role="toast.tone === 'error' ? 'alert' : 'status'"
          @pointerenter="ui.pause(toast.id)"
          @pointerleave="ui.resume(toast.id)"
          @focusin="ui.pause(toast.id)"
          @focusout="ui.resume(toast.id)"
        >
          <Icon
            v-if="toast.tone !== 'neutral'"
            :name="toast.tone === 'success' ? 'lucide:circle-check' : 'lucide:circle-alert'"
            aria-hidden="true"
          />
          <span class="ed-toast__text">{{ toast.message }}</span>
          <button
            v-if="toast.action"
            type="button"
            class="ed-toast__action"
            @click="run(toast.id, toast.action.run)"
          >
            {{ toast.action.label }}
          </button>
          <button
            type="button"
            class="ed-toast__close"
            :aria-label="t('cms.editor.history.close')"
            @click="ui.dismiss(toast.id)"
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
