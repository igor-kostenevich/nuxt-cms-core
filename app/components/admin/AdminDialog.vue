<script setup lang="ts">
import '../../assets/admin/admin.css'
import { nextTick, useId, useTemplateRef, watch } from 'vue'
import { useAdminI18n } from '../../admin/useAdminI18n'

// Modal on a native <dialog>: focus trap, Esc and the backdrop come from the
// browser. Teleported to <body>, so it carries .cms-admin itself and works in
// the admin and in Edit Mode alike. Focus returns to where it was on close.
withDefaults(defineProps<{
  title: string
  /** `lg` fits the media grid. */
  size?: 'md' | 'lg'
}>(), {
  size: 'md',
})

const open = defineModel<boolean>('open', { required: true })

const { t, locale } = useAdminI18n()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const titleId = `${useId()}-title`
let returnFocus: HTMLElement | null = null

watch(open, async (next) => {
  await nextTick()
  const element = dialog.value

  if (!element) {
    return
  }

  if (next && !element.open) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element.showModal()
  } else if (!next && element.open) {
    element.close()

    if (returnFocus?.isConnected) {
      returnFocus.focus({ preventScroll: true })
    }

    returnFocus = null
  }
}, { immediate: true })

function close() {
  open.value = false
}

function onBackdrop(event: MouseEvent) {
  if (event.target === dialog.value) {
    close()
  }
}

defineExpose({ close })
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="cms-admin admin-dialog"
      :class="`admin-dialog--${size}`"
      :lang="locale"
      :aria-labelledby="titleId"
      @cancel.prevent="close"
      @click="onBackdrop"
    >
      <div
        v-if="open"
        class="admin-dialog__panel"
      >
        <header class="admin-dialog__header">
          <h2
            :id="titleId"
            class="admin-dialog__title"
          >
            {{ title }}
          </h2>
          <AdminButton
            variant="ghost"
            size="sm"
            icon-only
            :aria-label="t('cms.common.close')"
            @click="close"
          >
            <Icon
              name="lucide:x"
              aria-hidden="true"
            />
          </AdminButton>
        </header>
        <div class="admin-dialog__body">
          <slot />
        </div>
        <footer
          v-if="$slots.footer"
          class="admin-dialog__footer"
        >
          <slot name="footer" />
        </footer>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.admin-dialog {
  /* .cms-admin fills the page; a dialog sizes to its content. */
  min-height: 0;
  width: min(32rem, calc(100vw - 2 * var(--cms-space-4)));
  max-height: calc(100vh - 2 * var(--cms-space-8));
  padding: 0;
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-lg);
  background: var(--cms-card);
  box-shadow: var(--cms-shadow-overlay);
  color: var(--cms-foreground);
}

.admin-dialog--lg {
  width: min(64rem, calc(100vw - 2 * var(--cms-space-4)));
}

.admin-dialog::backdrop {
  background: rgb(0 0 0 / 40%);
}

.admin-dialog__panel {
  display: flex;
  flex-direction: column;
  max-height: inherit;
}

.admin-dialog__header {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: var(--cms-space-3);
  padding: var(--cms-space-4) var(--cms-space-5);
  border-bottom: var(--cms-border-width) solid var(--cms-border);
}

.admin-dialog__title {
  margin: 0;
  font-size: var(--cms-type-h4-size);
  font-weight: var(--cms-type-h4-weight);
  line-height: var(--cms-type-h4-line);
}

.admin-dialog__body {
  flex: 1;
  min-height: 0;
  padding: var(--cms-space-5);
  overflow: auto;
}

.admin-dialog__footer {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--cms-space-2);
  padding: var(--cms-space-4) var(--cms-space-5);
  border-top: var(--cms-border-width) solid var(--cms-border);
}
</style>
