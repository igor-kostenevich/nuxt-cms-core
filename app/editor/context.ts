import { hasInjectionContext, inject, type InjectionKey } from 'vue'
import type { CmsPage } from '../types/pages'
import type { EditorEngine } from './engine'
import type { EditorView } from './view'

/**
 * The only editor module the Public Runtime imports. It holds injection keys
 * and types, nothing that runs: primitives check `inject(CMS_EDITOR, null)` and
 * load their editable branch through `import()` only when it is present
 * (MASTER_PLAN C-21, R-04).
 */

export interface CmsEditorPageBinding {
  page: Readonly<{ value: CmsPage | null }>
  pending: Readonly<{ value: boolean }>
  error: Readonly<{ value: Error | null | undefined }>
  refresh: () => Promise<void>
  ready: Promise<void>
}

export interface CmsEditorContext {
  engine: EditorEngine
  view: EditorView
  /**
   * Called by useCmsPage in Edit Mode: the page's content comes from the Engine.
   * Null for a second key on the page: it reads published content like the
   * public site, and its primitives stay public.
   */
  bindPage: (key: string) => CmsEditorPageBinding | null
}

/**
 * Edit Mode inside the edited page: primitives and useCmsPage switch to the
 * editor. Provided by EditedRoute only, so the Client's layout (header,
 * footer) stays plain code (MASTER_PLAN C-63).
 */
export const CMS_EDITOR: InjectionKey<CmsEditorContext | null> = Symbol('cms-editor')

/** The same context for the editor's own UI (toolbar, overlay, panels). */
export const CMS_EDITOR_UI: InjectionKey<CmsEditorContext> = Symbol('cms-editor-shell')

/** Address prefix of the enclosing collection item, e.g. `services.k3f9`. */
export const CMS_FIELD_SCOPE: InjectionKey<string> = Symbol('cms-field-scope')

/** The editor context when the component renders inside the edited page, else null. */
export function injectCmsEditor(): CmsEditorContext | null {
  return hasInjectionContext() ? inject(CMS_EDITOR, null) : null
}
