import { reactive, type InjectionKey } from 'vue'
import { injectRequired } from './inject'

export interface EditorToast {
  id: number
  message: string
  tone: 'neutral' | 'success' | 'error'
  action?: { label: string, run: () => void }
}

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

/** Plain messages go away on their own; one with an action (Undo) stays longer. */
const TOAST_DURATION_MS = 5000
const ACTION_TOAST_DURATION_MS = 10_000

interface ToastTimer {
  handle: ReturnType<typeof setTimeout> | null
  remaining: number
  startedAt: number
}

/** Toasts and confirmation dialogs of Edit Mode. One instance per editor. */
export function createEditorUi() {
  const toasts = reactive<EditorToast[]>([])
  const state = reactive<{ dialog: OpenDialog | null }>({ dialog: null })
  const timers = new Map<number, ToastTimer>()
  let nextId = 1

  function toast(message: string, options: Partial<Omit<EditorToast, 'id' | 'message'>> = {}) {
    const id = nextId++
    toasts.push({ id, message, tone: options.tone ?? 'neutral', action: options.action })
    timers.set(id, { handle: null, remaining: options.action ? ACTION_TOAST_DURATION_MS : TOAST_DURATION_MS, startedAt: 0 })
    resume(id)
    return id
  }

  /** Hover or focus on a toast stops its clock (WCAG 2.2.1), leaving resumes it. */
  function pause(id: number) {
    const timer = timers.get(id)

    if (timer?.handle) {
      clearTimeout(timer.handle)
      timer.handle = null
      timer.remaining -= Date.now() - timer.startedAt
    }
  }

  function resume(id: number) {
    const timer = timers.get(id)

    if (timer && !timer.handle) {
      timer.startedAt = Date.now()
      timer.handle = setTimeout(() => dismiss(id), Math.max(timer.remaining, 1000))
    }
  }

  function dismiss(id: number) {
    const timer = timers.get(id)

    if (timer?.handle) {
      clearTimeout(timer.handle)
    }

    timers.delete(id)
    const index = toasts.findIndex(item => item.id === id)

    if (index >= 0) {
      toasts.splice(index, 1)
    }
  }

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

  /** Clears every pending timer when the editor closes. */
  function dispose() {
    for (const id of [...timers.keys()]) {
      dismiss(id)
    }
  }

  return { toasts, state, toast, dismiss, pause, resume, confirm, dispose }
}

export type EditorUi = ReturnType<typeof createEditorUi>

export const EDITOR_UI: InjectionKey<EditorUi> = Symbol('cms-editor-ui')

export function useEditorUi(): EditorUi {
  return injectRequired(EDITOR_UI, 'useEditorUi')
}
