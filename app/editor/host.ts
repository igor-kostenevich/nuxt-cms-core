import { onBeforeUnmount, provide, type InjectionKey } from 'vue'
import { useEventListener, useIntervalFn } from '@vueuse/core'
import { cmsConfig } from '#cms/config'
import type { CmsEditorContext, CmsEditorEntryBinding, CmsEditorPageBinding } from './context'
import { CMS_EDITOR_UI } from './context'
import { createEditorEngine, type EditorRepository } from './engine'
import { createEditorView } from './view'
import { createEditorUi, EDITOR_UI } from './ui'
import { createEditorSession, EDITOR_SESSION } from './session'
import { useConfirmPublish } from '../admin/useConfirmPublish'
import { displayName } from '../admin/languages'
import { useAdminI18n } from '../admin/useAdminI18n'
import { useEditorLanguages } from './languages'

const HEARTBEAT_MS = 30_000

type Translate = (key: string, params?: Record<string, string | number>) => string

/**
 * Where the editor's layers (Overlay, History, toasts) are teleported. Edit
 * Mode uses <body>; a modal host gives its own <dialog>, because a modal
 * dialog sits in the top layer and makes everything outside it inert.
 */
export const EDITOR_LAYER: InjectionKey<string | HTMLElement> = Symbol('cms-editor-layer')

/**
 * The editor's own keys, the same in Edit Mode and in the dialog: Save, Undo,
 * Redo. By `event.code`, so they work in any keyboard layout. Each host decides
 * where the keys count (its inputs, an open dialog, Preview).
 */
export function editorShortcut(event: KeyboardEvent): 'save' | 'undo' | 'redo' | null {
  if (!event.metaKey && !event.ctrlKey) {
    return null
  }

  if (event.code === 'KeyS') {
    return 'save'
  }

  if (event.code === 'KeyZ') {
    return event.shiftKey ? 'redo' : 'undo'
  }

  return null
}

export interface EditorHostOptions {
  repository: EditorRepository
  locale: string | null
  t: Translate
  navigate: (to: string) => Promise<unknown> | unknown
  /** Where Exit leads (session); the dashboard by default. */
  exitTo?: () => string | null
  /** Binding for useCmsPage / useCmsEntry inside a rendered Client page; none in a form host. */
  bindPage?: (host: EditorHostCore, key: string) => CmsEditorPageBinding | null
  /** Binding for useCmsEntry inside a rendered Client page (014). */
  bindEntry?: (host: EditorHostCore, type: string) => CmsEditorEntryBinding | null
}

export interface EditorHostCore {
  engine: ReturnType<typeof createEditorEngine>
  view: ReturnType<typeof createEditorView>
  ui: ReturnType<typeof createEditorUi>
  session: ReturnType<typeof createEditorSession>
}

/**
 * One editor session, whatever shows it: Edit Mode over a Client page or a
 * form in a dialog (014). Creates the Engine, view, UI and session, provides
 * them to the editor components and keeps the Content Lock alive (heartbeat,
 * release on tab close, release on unmount). Must run in a component setup.
 */
export function useEditorHost(options: EditorHostOptions): EditorHostCore {
  const engine = createEditorEngine({
    repository: options.repository,
    locale: options.locale,
    historyLimit: cmsConfig.editor.historyLimit,
  })
  const view = createEditorView(engine)
  const ui = createEditorUi()
  // Whether Publish asks first: a preference of this browser (Settings → Editing).
  const { askBeforePublish } = useConfirmPublish()
  const { languages } = useEditorLanguages()
  const { locale: adminLocale } = useAdminI18n()

  /** «Ukrainian (3 fields)» for each shown language that lacks translated texts, and how many languages the site shows (the original too). */
  async function translationGaps() {
    const shown = languages.value.filter(language => language.active && !language.isDefault).map(language => language.code)
    const plural = new Intl.PluralRules(adminLocale.value)

    const gaps = await engine.translationGaps(shown)

    return {
      total: shown.length + 1,
      items: gaps.map((gap) => {
        const name = displayName(gap.locale, adminLocale.value) ?? languages.value.find(language => language.code === gap.locale)?.nativeName ?? gap.locale
        return `${name} (${options.t(`cms.editor.publish.fields.${plural.select(gap.missing)}`, { count: gap.missing })})`
      }),
    }
  }

  const session = createEditorSession({ engine, view, ui, t: options.t, navigate: options.navigate, exitTo: options.exitTo, askBeforePublish, translationGaps })
  const core: EditorHostCore = { engine, view, ui, session }

  const context: CmsEditorContext = {
    engine,
    view,
    bindPage: key => options.bindPage?.(core, key) ?? null,
    bindEntry: type => options.bindEntry?.(core, type) ?? null,
  }

  provide(CMS_EDITOR_UI, context)
  provide(EDITOR_UI, ui)
  provide(EDITOR_SESSION, session)

  // ── Lock lifetime ──────────────────────────────────────────────────────

  // Reads the runtime config now, in setup, for the release on tab close.
  void engine.prepareUnloadRelease().catch(() => undefined)

  useIntervalFn(() => {
    void engine.heartbeat()
    void engine.refreshLockStatus()
    void engine.prepareUnloadRelease().catch(() => undefined)
  }, HEARTBEAT_MS)

  useEventListener(window, 'pagehide', () => {
    engine.releaseOnUnload()
  })

  // Back from the back/forward cache: the lock was released on pagehide.
  useEventListener(window, 'pageshow', (event: PageTransitionEvent) => {
    if (event.persisted && engine.status.value === 'ready' && engine.lock.value === 'held') {
      void engine.takeOver()
    }
  })

  useEventListener(window, 'beforeunload', (event: BeforeUnloadEvent) => {
    // A lost lock included: the changes are still only in this tab.
    if (engine.dirty.value) {
      event.preventDefault()
    }
  })

  onBeforeUnmount(() => {
    ui.dispose()
    void engine.dispose()
  })

  return core
}
