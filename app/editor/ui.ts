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
}

export type EditorDialogResult = 'confirm' | 'alternative' | 'cancel'

interface OpenDialog extends EditorDialogOptions {
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
        resolve: (result) => {
          state.dialog = null
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
