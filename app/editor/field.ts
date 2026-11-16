import {
  computed,
  inject,
  onBeforeUnmount,
  onMounted,
  useId,
  watch,
  watchEffect,
  type Ref,
} from 'vue'
import { useAdminI18n } from '../admin/useAdminI18n'
import { CMS_FIELD_SCOPE } from './context'
import { useEditor } from './inject'
import { KIND_TRAITS, type FieldApis, type FieldKind, type FieldRegistration } from './kinds'
import { joinPath } from './paths'

export interface EditorFieldOptions<K extends FieldKind> {
  kind: K
  fieldKey: () => string
  el: Ref<HTMLElement | null | undefined>
  label?: () => string | undefined
  required?: () => boolean | undefined
  maxLength?: () => number | undefined
  /** Kind-specific handle the Overlay and panels use (see kinds.ts). */
  api: FieldApis[K]
  /** `fieldKey` is already a full address (collection items build their own). */
  absolute?: boolean
}

/** Fields the browser does not focus by itself get tabindex, a role and a name. */
const NEEDS_FOCUS: readonly FieldKind[] = ['image', 'background', 'collection', 'item', 'optional']

/**
 * Registers a mounted editable element with the Engine and marks it in the
 * DOM with `data-cms-field` / `data-cms-kind`, which is how the Overlay and
 * the click handler find fields. Also gives it an accessible name, and states
 * from validation (`aria-invalid`, `aria-required`). Shared by every editable
 * primitive.
 */
export function useEditorField<K extends FieldKind>(options: EditorFieldOptions<K>) {
  const { engine, view } = useEditor()
  const { t } = useAdminI18n()
  const scope = inject(CMS_FIELD_SCOPE, '')
  const id = `cms-${useId()}`
  const key = computed(() => (options.absolute ? options.fieldKey() : joinPath(scope, options.fieldKey())))

  const invalid = computed(() => engine.issues.value.some(issue => issue.fieldId === id))
  const name = computed(() => options.label?.() ?? t(`cms.editor.kinds.${options.kind}`))

  let unregister: (() => void) | null = null

  function meta() {
    return {
      key: key.value,
      label: options.label?.(),
      required: options.required?.(),
      maxLength: options.maxLength?.(),
    }
  }

  function mark(el: HTMLElement) {
    el.dataset.cmsField = id
    el.dataset.cmsKind = options.kind
  }

  // Editing semantics only while editing: Preview shows the page as visitors get it.
  watchEffect(() => {
    const el = options.el.value

    if (!el) {
      return
    }

    const editing = !view.preview.value

    if (NEEDS_FOCUS.includes(options.kind)) {
      toggleAttr(el, 'tabindex', editing ? '0' : null)
      toggleAttr(el, 'role', editing ? 'button' : null)
      toggleAttr(el, 'aria-roledescription', editing ? t(`cms.editor.kinds.${options.kind}`) : null)
      toggleAttr(el, 'aria-label', editing ? name.value : null)
    }

    if (KIND_TRAITS[options.kind].inline) {
      toggleAttr(el, 'role', editing ? 'textbox' : null)
      toggleAttr(el, 'aria-label', editing ? name.value : null)
      toggleAttr(el, 'aria-required', editing && options.required?.() ? 'true' : null)
      toggleAttr(el, 'aria-invalid', editing && invalid.value ? 'true' : null)
    }
  })

  onMounted(() => {
    const el = options.el.value

    if (!el) {
      return
    }

    mark(el)
    unregister = engine.registerField({
      id,
      el,
      kind: options.kind,
      api: options.api,
      ...meta(),
    } as FieldRegistration)
  })

  watch(meta, (next) => {
    if (unregister) {
      engine.updateField(id, next)
    }
  })

  // A re-rendered root element (e.g. a link that lost its href) must stay registered.
  watch(options.el, (el) => {
    if (el && unregister) {
      mark(el)
      engine.updateField(id, { el })
    }
  })

  onBeforeUnmount(() => {
    unregister?.()
    unregister = null
    view.forget(id)
  })

  return { engine, view, id, key }
}

function toggleAttr(el: HTMLElement, name: string, value: string | null) {
  if (value === null) {
    el.removeAttribute(name)
  } else if (el.getAttribute(name) !== value) {
    el.setAttribute(name, value)
  }
}
