import { computed, ref } from 'vue'
import type { EditorEngine } from './engine'

/** How a field got selected: a keyboard selection moves focus into its panel. */
export type SelectionSource = 'pointer' | 'keyboard'

/**
 * What the editor shows, apart from the document: selection, hover, Preview
 * and the highlight toggle. The Engine owns the data; this owns
 * the view of it, so neither changes for the other's reasons.
 */
export function createEditorView(engine: EditorEngine) {
  const selection = ref<string | null>(null)
  const selectionSource = ref<SelectionSource>('pointer')
  const hover = ref<string | null>(null)
  const preview = ref(false)
  const highlight = ref(true)
  /** In a translation: dim everything but the fields still to translate. */
  const onlyUntranslated = ref(false)

  /** Fields take input: the lock is held and Preview is off. */
  const editable = computed(() => !engine.readOnly.value && !preview.value)

  const selectedField = computed(() => {
    const id = selection.value
    return id ? engine.fields.get(id) ?? null : null
  })

  function select(id: string | null, source: SelectionSource = 'pointer') {
    if (selection.value !== id) {
      engine.endEdit()
    }

    selection.value = id
    selectionSource.value = source
  }

  /** A field unmounted: drop it from the selection and hover. */
  function forget(id: string) {
    if (selection.value === id) {
      selection.value = null
    }

    if (hover.value === id) {
      hover.value = null
    }
  }

  function setPreview(on: boolean) {
    engine.endEdit()
    selection.value = null
    hover.value = null
    preview.value = on
  }

  return {
    selection,
    selectionSource,
    selectedField,
    hover,
    preview,
    highlight,
    onlyUntranslated,
    editable,
    select,
    forget,
    setPreview,
  }
}

export type EditorView = ReturnType<typeof createEditorView>
