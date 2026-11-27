import { computed, shallowRef, watch } from 'vue'
import { fieldValueIssue, isEmptyFieldValue, TRANSLATED_FIELD_TYPES, type CmsContentField } from '../../../src/content-fields'
import { useEditorField } from '../field'
import { useEditor } from '../inject'
import { useShownIssue } from './shown-issue'

/** No value is stored for an empty control: an empty text, no choice. */
function stored(value: unknown): unknown {
  return isEmptyFieldValue(value) ? undefined : value
}

/**
 * One field of Core's entry form (014, C-103) on the Editor Engine: the same
 * document, Undo, translation and lock as Edit Mode. The value is judged by
 * the schema's own rules (`fieldValueIssue`), the same the build applied to
 * `default`. Texts are translated; every other value is structure, read-only
 * in a translation (C-78).
 *
 * `type()` is for typing (one Undo step until blur), `choose()` for a
 * discrete change (a click is one step).
 */
export function useFormField(address: string, field: CmsContentField, label: () => string) {
  const { engine } = useEditor()
  const el = shallowRef<HTMLElement | null>(null)
  const translatable = TRANSLATED_FIELD_TYPES.includes(field.type)

  const { view, id, key } = useEditorField({
    kind: translatable ? 'input' : 'value',
    fieldKey: () => address,
    el,
    label,
    required: () => ('required' in field ? field.required : false),
    maxLength: () => ('maxLength' in field ? field.maxLength : undefined),
    form: true,
    validate: value => fieldValueIssue(field, value),
    value: () => engine.get(address),
    api: undefined,
  })

  /** No input: no lock, Preview, an item a translation cannot hold, or structure in a translation. */
  const readonly = computed(() => !view.editable.value
    || !engine.canTranslate(key.value)
    || (!translatable && engine.translating.value))

  const value = computed(() => engine.get(key.value))

  function type(next: unknown) {
    if (!readonly.value) {
      engine.beginEdit(key.value)
      engine.set(key.value, stored(next))
    }
  }

  function choose(next: unknown) {
    if (!readonly.value) {
      engine.endEdit()
      engine.set(key.value, stored(next))
    }
  }

  const current = computed(() => engine.issues.value.find(item => item.fieldId === id)?.kind ?? null)
  /** Shown after the field was left, or after a publish attempt; leaving ends the edit (one Undo step). */
  const issue = useShownIssue(el, current, () => engine.endEdit())

  /** The original's text, for a hint in a translation. */
  const original = computed(() => {
    const base = engine.baseValue(key.value)
    return translatable && engine.translating.value && typeof base === 'string' ? base : null
  })

  watch([el, issue], ([node, kind]) => {
    if (node) {
      if (kind) {
        node.setAttribute('aria-invalid', 'true')
      } else {
        node.removeAttribute('aria-invalid')
      }
    }
  })

  return {
    value,
    readonly,
    issue,
    original,
    translatable,
    /** The element validation focuses (`ref` of the control). */
    el,
    type,
    choose,
  }
}
