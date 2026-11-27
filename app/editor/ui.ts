import { reactive, type InjectionKey } from 'vue'
import { createToasts } from '../admin/toasts'
import { injectRequired } from './inject'

export interface EditorDialogOptions {
  title: string
  body?: string
  confirm: string
  cancel: string
  /** Optional third choice, e.g. «Leave without saving». */
  alternative?: string
  destructive?: boolean
  /** The initial focus goes to Cancel (as for a destructive one), so a stray Enter does nothing. */
  focusCancel?: boolean
  /** A warning under the text, e.g. the languages left untranslated. */
  notice?: string
  /** Details of the warning, folded away: one line each. */
  noticeItems?: string[]
  /** The label that opens the folded details. */
  noticeToggle?: string
  /** An unticked checkbox under the text, e.g. «Don't ask again». */
  checkbox?: string
  /** Called with the checkbox when the dialog is confirmed (not on cancel). */
  remember?: (checked: boolean) => void
}

export type EditorDialogResult = 'confirm' | 'alternative' | 'cancel'

interface OpenDialog extends EditorDialogOptions {
  /** The checkbox, ticked or not (bound by the dialog). */
  checked: boolean
  resolve: (result: EditorDialogResult) => void
}

/** Toasts and confirmation dialogs of Edit Mode. One instance per editor. */
export function createEditorUi() {
  const { toasts, toast, pause, resume, dismiss, dispose } = createToasts()
  const state = reactive<{ dialog: OpenDialog | null }>({ dialog: null })

  function confirm(options: EditorDialogOptions): Promise<EditorDialogResult> {
    state.dialog?.resolve('cancel')

    return new Promise((resolve) => {
      state.dialog = {
        ...options,
        checked: false,
        resolve: (result) => {
          const open = state.dialog
          state.dialog = null

          if (result === 'confirm' && open?.checkbox) {
            options.remember?.(open.checked)
          }

          resolve(result)
        },
      }
    })
  }

  return { toasts, state, toast, dismiss, pause, resume, confirm, dispose }
}

export type EditorUi = ReturnType<typeof createEditorUi>

export const EDITOR_UI: InjectionKey<EditorUi> = Symbol('cms-editor-ui')

export function useEditorUi(): EditorUi {
  return injectRequired(EDITOR_UI, 'useEditorUi')
}
