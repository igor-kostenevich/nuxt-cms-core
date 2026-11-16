import { computed, reactive, ref } from 'vue'
import type { CmsFocalPoint } from '../primitives/media'
import type { EditorEngine } from './engine'

/** Session-only image choice. Media and the image value format arrive in 009 (C-68, D-24). */
export interface ImageOverride {
  src?: string
  alt?: string
  decorative?: boolean
  focal?: CmsFocalPoint
}

/** How a field got selected: a keyboard selection moves focus into its panel. */
export type SelectionSource = 'pointer' | 'keyboard'

/**
 * What the editor shows, apart from the document: selection, hover, Preview,
 * the highlight toggle and image previews. The Engine owns the data; this owns
 * the view of it, so neither changes for the other's reasons.
 */
export function createEditorView(engine: EditorEngine) {
  const selection = ref<string | null>(null)
  const selectionSource = ref<SelectionSource>('pointer')
  const hover = ref<string | null>(null)
  const preview = ref(false)
  const highlight = ref(true)
  const media = reactive(new Map<string, ImageOverride>())

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

  function setMedia(key: string, override: ImageOverride) {
    media.set(key, { ...media.get(key), ...override })
  }

  return {
    selection,
    selectionSource,
    selectedField,
    hover,
    preview,
    highlight,
    media,
    editable,
    select,
    forget,
    setPreview,
    setMedia,
  }
}

export type EditorView = ReturnType<typeof createEditorView>
