import { inject, type InjectionKey } from 'vue'
import { CMS_EDITOR_UI, type CmsEditorContext } from './context'

/** inject() for editor-only state: missing means a component left Edit Mode. */
export function injectRequired<T>(key: InjectionKey<T>, name: string): T {
  const value = inject(key, null)

  if (value == null) {
    throw new Error(`${name}() must run inside Edit Mode.`)
  }

  return value
}

/** Engine and view for the editor's own UI and the editable fields. */
export function useEditor(): CmsEditorContext {
  return injectRequired(CMS_EDITOR_UI, 'useEditor')
}
