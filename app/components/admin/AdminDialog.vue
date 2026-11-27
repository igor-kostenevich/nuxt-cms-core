<script setup lang="ts">
import '../../assets/admin/admin.css'
import { nextTick, useId, useTemplateRef, watch } from 'vue'
import { useAdminI18n } from '../../admin/useAdminI18n'

// Modal on a native <dialog>: focus trap, Esc and the backdrop come from the
// browser. Teleported to <body>, so it carries .cms-admin itself and works in
// the admin and in Edit Mode alike. Focus returns to where it was on close.
const props = withDefaults(defineProps<{
  title: string
  /** `lg` fits the media grid. */
  size?: 'md' | 'lg'
  /**
   * Open, but not shown yet: the content is there (it can work), the dialog
   * appears when this turns off. For work that may need no dialog at all.
   */
  silent?: boolean
}>(), {
  size: 'md',
  silent: false,
})

const open = defineModel<boolean>('open', { required: true })

const { t, locale } = useAdminI18n()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const titleId = `${useId()}-title`
let returnFocus: HTMLElement | null = null

watch([open, () => props.silent], async ([next, silent]) => {
  await nextTick()
  const element = dialog.value

  if (!element) {
    return
  }

  if (next && !silent && !element.open) {
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

/**
 * Esc (the browser's close request) closes through the model. A `cancel` that
 * bubbles up from inside is not ours: a file input fires one when its picker
 * is dismissed, and that must not close the dialog.
 */
function onCancel(event: Event) {
  if (event.target !== dialog.value) {
    return
  }

  event.preventDefault()
  close()
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
      @cancel="onCancel"
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
  /* Only the body scrolls. The dialog itself never does: its panel is as tall
     as the dialog's content box, and a scroll chained from the body would
     show a scrollbar over the header too. */
  overflow: hidden;
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
  /* The dialog's max-height without its border, so the panel fits inside. */
  max-height: calc(100vh - 2 * var(--cms-space-8) - 2 * var(--cms-border-width));
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
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  /* Larger than the field labels inside: the dialog's heading. */
  font-size: var(--cms-type-h2-size);
  font-weight: var(--cms-type-h2-weight);
  line-height: var(--cms-type-h2-line);
}

.admin-dialog__body {
  flex: 1;
  min-height: 0;
  padding: var(--cms-space-5);
  overflow: auto;
  overscroll-behavior: contain;
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

/* A phone has little height: tighter frame, same content. */
@media (max-width: 767px) {
  .admin-dialog,
  .admin-dialog--lg {
    width: calc(100vw - 2 * var(--cms-space-2));
    /* The browser's own dialog style caps the width at 100% - 2em. */
    max-width: none;
    max-height: calc(100vh - 2 * var(--cms-space-4));
  }

  .admin-dialog__panel {
    max-height: calc(100vh - 2 * var(--cms-space-4) - 2 * var(--cms-border-width));
  }

  .admin-dialog__header {
    padding: var(--cms-space-2) var(--cms-space-2) var(--cms-space-2) var(--cms-space-4);
  }

  .admin-dialog__body {
    padding: var(--cms-space-3);
  }
}
</style>
