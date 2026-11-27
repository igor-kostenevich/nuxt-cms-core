import { ref, type InjectionKey, type Ref } from 'vue'
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
  /** Where Exit leads: the admin screen Edit Mode was opened from; the dashboard by default. */
  exitTo?: () => string | null
  /**
   * Whether Publish asks first (a personal preference, off by «Don't ask
   * again»). Not given: Publish does not ask.
   */
  askBeforePublish?: Ref<boolean>
  /**
   * The languages left without a translation of some texts: each as a line
   * («Ukrainian (3 fields)»), and how many languages the site shows, the
   * original included. A
   * hint for the question before Publish and the toast after it: it may fail
   * or be missing, and Publish is never blocked by it.
   */
  translationGaps?: () => Promise<{ total: number, items: string[] }>
}) {
  const { engine, view, ui, t, navigate } = options
  const historyOpen = ref(false)

  /** The entry's name in toasts and questions: its title, or «Untitled». */
  function entryName(): string {
    const title = engine.get('title')
    return typeof title === 'string' && title.trim() ? title.trim() : t('cms.pages.type.untitled')
  }

  /** Takes the entry off the site from its editor. Resolves true when done; a failure is said here. */
  async function takeOff(): Promise<boolean> {
    if (!engine.canTakeOff.value) {
      return false
    }

    blurActiveField()

    if (await engine.takeOff()) {
      return true
    }

    if (engine.lock.value !== 'lost') {
      ui.toast(`${t('cms.editor.takeOff.failed')}: ${t(adminErrorKey(engine.takeOffError.value))}`, { tone: 'error' })
    }

    return false
  }

  /**
   * Deletes the entry for good, after asking. Resolves true when it is gone;
   * the host then closes or leaves. A failure is said here.
   */
  async function remove(title: string): Promise<boolean> {
    if (!engine.removable.value) {
      return false
    }

    blurActiveField()
    const choice = await ui.confirm({
      title: t('cms.editor.remove.title', { title }),
      body: t('cms.editor.remove.body'),
      confirm: t('cms.editor.remove.confirm'),
      cancel: t('cms.editor.remove.cancel'),
      destructive: true,
    })

    if (choice !== 'confirm') {
      return false
    }

    if (await engine.remove()) {
      return true
    }

    if (engine.lock.value !== 'lost') {
      ui.toast(`${t('cms.editor.remove.failed')}: ${t(adminErrorKey(engine.removeError.value))}`, { tone: 'error' })
    }

    return false
  }

  /** Up to this many languages are named in a line; more are counted and listed on request. */
  const NAMED_LANGUAGES = 3

  const noGaps = { total: 0, items: [] as string[] }

  /** The warning about untranslated languages, short however many there are. */
  function gapsMessage(gaps: { total: number, items: string[] }, key: 'publish.untranslated' | 'toasts.publishedUntranslated') {
    return gaps.items.length <= NAMED_LANGUAGES
      ? t(`cms.editor.${key}`, { languages: gaps.items.join(', ') })
      // The original counts too: it is whole by definition.
      : t(`cms.editor.${key}Many`, { done: gaps.total - gaps.items.length, total: gaps.total })
  }

  /** What the last successful Publish said, for a host whose own toasts go away with it. */
  const publishedText = ref('')
  /** A publication to show in History: from `?history=` (a link from Activity). */
  const historyTarget = ref<string | null>(null)

  /** Commits a field being typed in, for actions that re-render it (Undo, leave). */
  function blurActiveField() {
    if (typeof document === 'undefined') {
      return
    }

    const active = document.activeElement

    if (active instanceof HTMLElement && active.closest('[data-cms-field]')) {
      active.blur()
    }
  }

  /**
   * Saves without moving focus: the editor keeps typing where they were.
   * A read-only page or one with nothing to save stays quiet. `quiet`: no
   * toast on success (a save the editor did not ask for, e.g. before switching
   * the language); a failure is always said.
   */
  async function save(options: { quiet?: boolean } = {}) {
    if (engine.readOnly.value || engine.status.value !== 'ready') {
      return false
    }

    if (!engine.dirty.value) {
      return true
    }

    // A draft may be unfinished (an empty required field), but not wrong: a
    // value over the limit or in a bad format is not stored. It would only
    // come back to block Publish.
    const wrong = engine.issues.value.filter(issue => issue.kind !== 'required')

    if (wrong.length > 0) {
      focusIssue(wrong[0]!.fieldId)
      ui.toast(t('cms.editor.status.saveIssues', { count: wrong.length }), { tone: 'error' })
      return false
    }

    engine.endEdit()

    if (await engine.save()) {
      if (!options.quiet) {
        ui.toast(t('cms.editor.toasts.saved'), { tone: 'success' })
      }

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

    // What goes public goes at once: ask first, once the form is valid.
    const ask = options.askBeforePublish
    const asked = ask?.value === true

    if (asked) {
      const gaps = await options.translationGaps?.().catch(() => noGaps) ?? noGaps
      const choice = await ui.confirm({
        title: t('cms.editor.publish.title'),
        body: t('cms.editor.publish.body'),
        notice: gaps.items.length > 0 ? gapsMessage(gaps, 'publish.untranslated') : undefined,
        noticeItems: gaps.items.length > NAMED_LANGUAGES ? gaps.items : undefined,
        noticeToggle: t('cms.editor.publish.showLanguages'),
        confirm: t('cms.editor.publish.confirm'),
        cancel: t('cms.editor.publish.cancel'),
        focusCancel: true,
        checkbox: t('cms.editor.publish.dontAsk'),
        remember: (checked) => {
          if (checked) {
            ask.value = false
          }
        },
      })

      if (choice !== 'confirm') {
        return false
      }

      // The form may have changed while the dialog was open.
      if (engine.readOnly.value) {
        return false
      }
    }

    engine.endEdit()

    if (await engine.publish()) {
      // Not asked (the question is off): the untranslated languages are said
      // here instead, so that a publish is never silent about them.
      const gaps = ask && !asked ? await options.translationGaps?.().catch(() => noGaps) ?? noGaps : noGaps
      publishedText.value = gaps.items.length > 0
        ? gapsMessage(gaps, 'toasts.publishedUntranslated')
        : t('cms.editor.toasts.published')
      ui.toast(publishedText.value, { tone: gaps.items.length > 0 ? 'neutral' : 'success', long: gaps.items.length > 0 })
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
    if (isAdminPath(url.pathname)) {
      await navigate(url.pathname + url.search)
      return
    }

    // The next page opens in the language being edited.
    if (engine.translating.value && engine.locale.value && !url.searchParams.has('locale')) {
      url.searchParams.set('locale', engine.locale.value)
    }

    await navigate(toEditPath(url.pathname) + url.search + url.hash)
  }

  async function exit() {
    if (await confirmLeave()) {
      await navigate(options.exitTo?.() ?? ADMIN_PATH)
    }
  }

  return { save, publish, takeOff, remove, entryName, publishedText, focusIssue, confirmLeave, goTo, exit, historyOpen, historyTarget, blurActiveField }
}

export type EditorSession = ReturnType<typeof createEditorSession>

export const EDITOR_SESSION: InjectionKey<EditorSession> = Symbol('cms-editor-session')

/** Switching the edited locale goes through the URL (`?locale=`), owned by EditorRoot. */
export interface EditorLocale {
  switchLocale: (code: string) => Promise<unknown>
}

export const EDITOR_LOCALE: InjectionKey<EditorLocale> = Symbol('cms-editor-locale')

export function useEditorLocale(): EditorLocale {
  return injectRequired(EDITOR_LOCALE, 'useEditorLocale')
}

export function useEditorSession(): EditorSession {
  return injectRequired(EDITOR_SESSION, 'useEditorSession')
}
