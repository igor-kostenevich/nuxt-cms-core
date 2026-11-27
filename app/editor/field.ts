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
import { KIND_TRAITS, type FieldApis, type FieldIssueKind, type FieldKind, type FieldRegistration } from './kinds'
import { joinPath } from '../primitives/paths'

export interface EditorFieldOptions<K extends FieldKind> {
  kind: K
  fieldKey: () => string
  el: Ref<HTMLElement | null | undefined>
  label?: () => string | undefined
  required?: () => boolean | undefined
  maxLength?: () => number | undefined
  /** Bounds of a number (form fields). */
  min?: () => number | undefined
  max?: () => number | undefined
  /** A form field: no value means empty, not a default from code. */
  form?: boolean
  /** Judges the value itself (fields of Core's entry form); see FieldRegistration.validate. */
  validate?: (value: unknown) => FieldIssueKind | null
  /** Text from the page code (slot, default label or alt), for the field registry (C-84). */
  defaultText?: () => string
  /** Kind-specific handle the Overlay and panels use (see kinds.ts). */
  api: FieldApis[K]
  /** `fieldKey` is already a full address (collection items build their own). */
  absolute?: boolean
  /**
   * The value the primitive got (`:value`). Compared with the edited document:
   * a value from elsewhere (another entry outside <CmsEntries>) makes the field
   * read-only (014 §7). Left out by fields that carry no value of their own.
   */
  value?: () => unknown
}

/** Fields the browser does not focus by itself get tabindex, a role and a name. */
const NEEDS_FOCUS: readonly FieldKind[] = ['image', 'background', 'collection', 'item', 'optional', 'entries']

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
  const foreign = computed(() => options.value !== undefined && engine.isForeign(key.value, options.value()))

  if (import.meta.dev) {
    watch(foreign, (now) => {
      if (now) {
        console.error(`[cms] Field "${key.value}" shows a value that is not this page's (data of another entry?). `
          + 'It is read-only in Edit Mode: render entries inside <CmsEntries>.')
      }
    }, { immediate: true })
  }
  const name = computed(() => options.label?.() ?? t(`cms.editor.kinds.${options.kind}`))

  let unregister: (() => void) | null = null

  function meta() {
    return {
      key: key.value,
      label: options.label?.(),
      required: options.required?.(),
      maxLength: options.maxLength?.(),
      min: options.min?.(),
      max: options.max?.(),
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

    // A field of a form is a group of controls, not a button: focusable only
    // for "go to the issue".
    if (options.form && NEEDS_FOCUS.includes(options.kind)) {
      toggleAttr(el, 'tabindex', editing ? '-1' : null)
    } else if (NEEDS_FOCUS.includes(options.kind)) {
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
      defaultText: options.defaultText,
      foreign: () => foreign.value,
      form: options.form,
      validate: options.validate,
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

  return { engine, view, id, key, foreign }
}

function toggleAttr(el: HTMLElement, name: string, value: string | null) {
  if (value === null) {
    el.removeAttribute(name)
  } else if (el.getAttribute(name) !== value) {
    el.setAttribute(name, value)
  }
}
