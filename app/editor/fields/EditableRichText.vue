<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { Editor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import type { CmsRichTextValue } from '../../types/primitives'
import { isRichTextDoc } from '../../primitives/rich-text'
import { toSafeHref } from '../../primitives/link'
import { useEditorField } from '../field'
import { normalizeRichText } from '../rich-text'
import { stableStringify } from '../paths'

// Editable branch of CmsRichText. Tiptap mounts into the same tag the public
// render uses, so the text keeps the page's own styles. Only the formatting
// the stored format allows is enabled (MASTER_PLAN C-49). ProseMirror owns the
// element's class attribute, so markers are data attributes.
const props = defineProps<{
  value?: CmsRichTextValue | null
  fieldKey: string
  tag: string
  inline?: boolean
  fieldLabel?: string
  required?: boolean
  maxLength?: number
}>()

const el = ref<HTMLElement | null>(null)
const editor = shallowRef<Editor | null>(null)
// The slot renders once so its HTML can seed the editor, then Tiptap owns the element.
const seeded = ref(false)

const { engine, view, key, id } = useEditorField({
  kind: 'richText',
  fieldKey: () => props.fieldKey,
  el,
  label: () => props.fieldLabel,
  required: () => props.required,
  maxLength: () => props.maxLength,
  api: {
    get editor() {
      return editor.value
    },
  },
})

let defaultHtml = ''
let lastWritten = ''

function contentFor(value: unknown) {
  return isRichTextDoc(value) ? value : defaultHtml
}

onMounted(async () => {
  defaultHtml = el.value?.innerHTML ?? ''
  seeded.value = true
  await nextTick()

  if (!el.value) {
    return
  }

  editor.value = new Editor({
    element: { mount: el.value },
    content: contentFor(props.value),
    editable: view.editable.value,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        dropcursor: false,
        gapcursor: false,
        heading: false,
        horizontalRule: false,
        listItem: false,
        listKeymap: false,
        orderedList: false,
        strike: false,
        trailingNode: false,
        underline: false,
        // Undo is the Engine's (MASTER_PLAN C-12), one step per editing session.
        undoRedo: false,
        link: {
          openOnClick: false,
          autolink: false,
          HTMLAttributes: { rel: null, target: null, class: null },
          isAllowedUri: url => toSafeHref(url) !== null,
        },
      }),
    ],
    editorProps: {
      attributes: { spellcheck: 'true' },
      handleKeyDown: (view, event) => {
        // Headings and other inline tags take line breaks, not paragraphs.
        if (props.inline && event.key === 'Enter' && !event.shiftKey) {
          editor.value?.commands.setHardBreak()
          return true
        }

        if (event.key === 'Escape') {
          view.dom.blur()
          return true
        }

        return false
      },
    },
    onFocus: () => {
      view.select(id)
      engine.beginEdit(key.value)
    },
    onBlur: () => {
      engine.endEdit()
    },
    onUpdate: ({ editor: instance }) => {
      const value = normalizeRichText(instance.getJSON())
      lastWritten = stableStringify(value)
      // Reopens the Undo step after a Save closed it while typing.
      engine.beginEdit(key.value)
      engine.set(key.value, value)
    },
  })
})

// Undo, Redo, Reset and Restore change the value from outside.
watch(() => props.value, (value) => {
  const instance = editor.value

  if (!instance || stableStringify(value) === lastWritten) {
    return
  }

  lastWritten = stableStringify(value)
  instance.commands.setContent(contentFor(value), { emitUpdate: false })
}, { deep: true })

// Read-only page (lock) or Preview: the text shows, but takes no input.
watch(() => view.editable.value, (editable) => {
  editor.value?.setEditable(editable)
})

onBeforeUnmount(() => {
  editor.value?.destroy()
})
</script>

<template>
  <component
    :is="tag"
    ref="el"
    data-cms-rich-text
    :data-cms-inline="inline || undefined"
  >
    <slot v-if="!seeded" />
  </component>
</template>
