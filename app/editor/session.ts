import { ref, type InjectionKey } from 'vue'
import { adminErrorKey } from '../admin/error-key'
import { ADMIN_PATH, EDIT_PATH, isAdminPath, isEditPath } from '../auth/paths'
import type { EditorEngine } from './engine'
import { injectRequired } from './inject'
import { scrollBehavior } from './motion'
import type { EditorUi } from './ui'
import type { EditorView } from './view'

type Translate = (key: string, params?: Record<string, string | number>) => string

/** `/about` → `/admin/edit/about`; only paths of this site. */
export function toEditPath(path: string): string {
  return path === '/' ? `${EDIT_PATH}/` : `${EDIT_PATH}${path}`
}

/** The public path of the page being edited: `/admin/edit/about` → `/about`. */
export function editedPath(path: string): string {
  return isEditPath(path) ? path.slice(EDIT_PATH.length) || '/' : path
}

/**
 * User-level actions of Edit Mode on top of the Engine: they add feedback
 * (toasts, dialogs) and the unsaved-changes guard around navigation.
 */
export function createEditorSession(options: {
  engine: EditorEngine
  view: EditorView
  ui: EditorUi
  t: Translate
  navigate: (to: string) => Promise<unknown> | unknown
}) {
  const { engine, view, ui, t, navigate } = options
  const historyOpen = ref(false)

  /** Commits a field being typed in, for actions that re-render it (Undo, leave). */
  function blurActiveField() {
    const active = document.activeElement

    if (active instanceof HTMLElement && active.closest('[data-cms-field]')) {
      active.blur()
    }
  }

  /**
   * Saves without moving focus: the editor keeps typing where they were.
   * A read-only page or one with nothing to save stays quiet.
   */
  async function save() {
    if (engine.readOnly.value || engine.status.value !== 'ready') {
      return false
    }

    if (!engine.dirty.value) {
      return true
    }

    engine.endEdit()

    if (await engine.save()) {
      ui.toast(t('cms.editor.toasts.saved'), { tone: 'success' })
      return true
    }

    if (engine.lock.value !== 'lost') {
      ui.toast(`${t('cms.editor.toasts.saveFailed')}: ${t(adminErrorKey(engine.saveError.value))}`, {
        tone: 'error',
        action: { label: t('cms.editor.status.retry'), run: () => void save() },
      })
    }

    return false
  }

  /** Publishes; with blocking issues it goes to the first field to fix instead. */
  async function publish() {
    if (engine.readOnly.value) {
      return false
    }

    const issue = engine.issues.value[0]

    if (issue) {
      focusIssue(issue.fieldId)
      ui.toast(t('cms.editor.status.issues', { count: engine.issues.value.length }), { tone: 'error' })
      return false
    }

    engine.endEdit()

    if (await engine.publish()) {
      ui.toast(t('cms.editor.toasts.published'), { tone: 'success' })
      return true
    }

    const error = engine.publishError.value ?? engine.saveError.value

    if (error && engine.lock.value !== 'lost') {
      ui.toast(`${t('cms.editor.toasts.publishFailed')}: ${t(adminErrorKey(error))}`, { tone: 'error' })
    }

    return false
  }

  /** Scrolls to a field with a problem, selects it and puts the caret in it. */
  function focusIssue(fieldId: string) {
    const field = engine.fields.get(fieldId)

    if (!field) {
      return
    }

    view.select(field.id, 'keyboard')
    field.el.scrollIntoView({ block: 'center', behavior: scrollBehavior() })
    field.el.focus({ preventScroll: true })
  }

  /**
   * Asks before leaving with unsaved changes. Resolves true when it is fine to
   * leave. A lost lock still has the changes in this tab: saving them needs
   * the lock back first.
   */
  async function confirmLeave(): Promise<boolean> {
    blurActiveField()

    if (!engine.dirty.value) {
      return true
    }

    const lost = engine.lock.value !== 'held'
    const choice = await ui.confirm({
      title: t('cms.editor.leave.title'),
      body: t('cms.editor.leave.body'),
      confirm: t(lost ? 'cms.editor.leave.takeBackAndSave' : 'cms.editor.leave.save'),
      alternative: t('cms.editor.leave.discard'),
      cancel: t('cms.editor.leave.cancel'),
    })

    if (choice === 'cancel') {
      return false
    }

    if (choice === 'alternative') {
      engine.discard()
      return true
    }

    if (lost) {
      await engine.takeOver()

      if (engine.lock.value !== 'held') {
        ui.toast(t('cms.editor.lock.takeBackFailed'), { tone: 'error' })
        return false
      }
    }

    return save()
  }

  /** Opens another page of the site in Edit Mode, or an external address. */
  async function goTo(href: string, newTab = false) {
    // Relative to the edited page (`/about`), not to `/admin/edit/about`:
    // `#contact` and `team` must mean what they mean on the public site.
    const current = editedPath(window.location.pathname)
    const url = new URL(href, window.location.origin + current)
    const sameSite = url.origin === window.location.origin

    if (!sameSite || newTab) {
      window.open(url.href, '_blank', 'noopener,noreferrer')
      return
    }

    if (url.pathname === current && url.hash) {
      document.getElementById(decodeURIComponent(url.hash.slice(1)))
        ?.scrollIntoView({ behavior: scrollBehavior() })
      return
    }

    if (!await confirmLeave()) {
      return
    }

    // A link to the admin itself leaves Edit Mode instead of editing it.
    await navigate(isAdminPath(url.pathname)
      ? url.pathname + url.search
      : toEditPath(url.pathname) + url.search + url.hash)
  }

  async function exit() {
    if (await confirmLeave()) {
      await navigate(ADMIN_PATH)
    }
  }

  return { save, publish, focusIssue, confirmLeave, goTo, exit, historyOpen, blurActiveField }
}

export type EditorSession = ReturnType<typeof createEditorSession>

export const EDITOR_SESSION: InjectionKey<EditorSession> = Symbol('cms-editor-session')

export function useEditorSession(): EditorSession {
  return injectRequired(EDITOR_SESSION, 'useEditorSession')
}
