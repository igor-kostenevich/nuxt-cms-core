<script setup lang="ts">
import { nextTick, useTemplateRef, watch } from 'vue'
import { useAdminI18n } from '../admin/useAdminI18n'
import { useEditorUi } from './ui'

// Confirmation dialog of Edit Mode on a native <dialog>: the focus trap, Esc
// and the backdrop come from the browser. A destructive action never gets the
// initial focus, so a stray Enter cancels instead of resetting.
const { t, locale } = useAdminI18n()
const ui = useEditorUi()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
let returnFocus: HTMLElement | null = null

watch(() => ui.state.dialog, async (open) => {
  await nextTick()

  if (open && !dialog.value?.open) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.value?.showModal()
    dialog.value?.querySelector<HTMLElement>(open.destructive || open.focusCancel ? '[data-cancel]' : '[data-confirm]')?.focus()
  } else if (!open && dialog.value?.open) {
    dialog.value.close()

    if (returnFocus?.isConnected) {
      returnFocus.focus({ preventScroll: true })
    }

    returnFocus = null
  }
})

function answer(result: 'confirm' | 'alternative' | 'cancel') {
  ui.state.dialog?.resolve(result)
}

function onBackdrop(event: MouseEvent) {
  if (event.target === dialog.value) {
    answer('cancel')
  }
}
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="cms-admin cms-editor-ui ed-dialog"
      :lang="locale"
      aria-labelledby="cms-editor-dialog-title"
      :aria-describedby="ui.state.dialog?.body ? 'cms-editor-dialog-body' : undefined"
      @cancel.prevent="answer('cancel')"
      @click="onBackdrop"
    >
      <div
        v-if="ui.state.dialog"
        class="ed-dialog__body"
      >
        <AdminButton
          variant="ghost"
          size="sm"
          icon-only
          class="ed-dialog__close"
          :aria-label="t('cms.editor.history.close')"
          @click="answer('cancel')"
        >
          <Icon
            name="lucide:x"
            aria-hidden="true"
          />
        </AdminButton>
        <h2
          id="cms-editor-dialog-title"
          class="ed-dialog__title"
        >
          {{ ui.state.dialog.title }}
        </h2>
        <p
          v-if="ui.state.dialog.body"
          id="cms-editor-dialog-body"
          class="ed-dialog__text"
        >
          {{ ui.state.dialog.body }}
        </p>
        <div
          v-if="ui.state.dialog.notice"
          class="ed-dialog__notice"
          role="note"
        >
          <p class="ed-dialog__notice-text">
            {{ ui.state.dialog.notice }}
          </p>
          <details
            v-if="ui.state.dialog.noticeItems?.length"
            class="ed-dialog__notice-details"
          >
            <summary>{{ ui.state.dialog.noticeToggle }}</summary>
            <ul>
              <li
                v-for="item in ui.state.dialog.noticeItems"
                :key="item"
              >
                {{ item }}
              </li>
            </ul>
          </details>
        </div>
        <AdminCheckbox
          v-if="ui.state.dialog.checkbox"
          v-model="ui.state.dialog.checked"
          :label="ui.state.dialog.checkbox"
          class="ed-dialog__remember"
        />
        <div class="ed-dialog__actions">
          <AdminButton
            variant="secondary"
            size="sm"
            data-cancel
            @click="answer('cancel')"
          >
            {{ ui.state.dialog.cancel }}
          </AdminButton>
          <AdminButton
            v-if="ui.state.dialog.alternative"
            variant="ghost"
            size="sm"
            class="ed-dialog__alternative"
            @click="answer('alternative')"
          >
            {{ ui.state.dialog.alternative }}
          </AdminButton>
          <AdminButton
            :variant="ui.state.dialog.destructive ? 'destructive' : 'primary'"
            size="sm"
            data-confirm
            @click="answer('confirm')"
          >
            {{ ui.state.dialog.confirm }}
          </AdminButton>
        </div>
      </div>
    </dialog>
  </Teleport>
</template>
