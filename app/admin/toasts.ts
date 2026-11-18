import { reactive } from 'vue'

export interface CmsToast {
  id: number
  message: string
  tone: 'neutral' | 'success' | 'error'
  action?: { label: string, run: () => void }
}

/** Plain messages go away on their own; one with an action (Undo) or an error stays longer. */
const TOAST_DURATION_MS = 5000
const LONG_TOAST_DURATION_MS = 10_000

interface ToastTimer {
  handle: ReturnType<typeof setTimeout> | null
  remaining: number
  startedAt: number
}

/**
 * Toasts of the admin and of Edit Mode: short outcome messages that do not
 * move the page. Hover or focus pauses a toast (WCAG 2.2.1).
 */
export function createToasts() {
  const toasts = reactive<CmsToast[]>([])
  const timers = new Map<number, ToastTimer>()
  let nextId = 1

  function toast(message: string, options: Partial<Omit<CmsToast, 'id' | 'message'>> = {}) {
    const id = nextId++
    const tone = options.tone ?? 'neutral'
    toasts.push({ id, message, tone, action: options.action })
    timers.set(id, {
      handle: null,
      remaining: options.action || tone === 'error' ? LONG_TOAST_DURATION_MS : TOAST_DURATION_MS,
      startedAt: 0,
    })
    resume(id)
    return id
  }

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

  /** Clears every pending timer. */
  function dispose() {
    for (const id of [...timers.keys()]) {
      dismiss(id)
    }
  }

  return { toasts, toast, pause, resume, dismiss, dispose }
}

export type CmsToasts = ReturnType<typeof createToasts>
