<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useAdminI18n } from '../../admin/useAdminI18n'
import { useEditorField } from '../field'
import { plainTextOf } from '../plain-text'

// Editable branch of CmsText. Same root tag as the public render, so the page
// looks identical; the element itself is the input (WYSIWYG).
//
// After mount the text is owned imperatively, not by Vue's vnode: while the
// browser edits a contenteditable it replaces and removes text nodes, so a
// Vue-rendered text node may already be detached when Undo or Reset patch it.
// Vue renders the slot once, to learn the code default, and then nothing.
const props = defineProps<{
  value?: string | null
  fieldKey: string
  tag: string
  fieldLabel?: string
  required?: boolean
  maxLength?: number
}>()

const { t } = useAdminI18n()
const el = ref<HTMLElement | null>(null)
const { engine, view, key, id } = useEditorField({
  kind: 'text',
  fieldKey: () => props.fieldKey,
  el,
  label: () => props.fieldLabel,
  required: () => props.required,
  maxLength: () => props.maxLength,
  api: undefined,
})

const seeded = ref(false)
const editing = ref(false)
// The slot is always rendered first, whatever the stored value: it is the
// default Reset returns to when the published version has no value.
let defaultText = ''

const shown = computed(() => props.value ?? defaultText)
const empty = computed(() => seeded.value && shown.value === '')

function paint() {
  if (el.value && !editing.value && el.value.textContent !== shown.value) {
    el.value.textContent = shown.value
  }
}

onMounted(async () => {
  defaultText = el.value ? plainTextOf(el.value) : ''
  seeded.value = true
  await nextTick()
  paint()
})

// Undo, Redo, Reset and Restore change the value from outside.
watch(() => props.value, () => {
  if (seeded.value) {
    paint()
  }
})

function onFocus() {
  if (!view.editable.value) {
    return
  }

  editing.value = true
  view.select(id)
  engine.beginEdit(key.value)
}

function onInput() {
  // A Save (Cmd+S) closes the Undo step without leaving the field: typing
  // after it starts the next step.
  engine.beginEdit(key.value)
  engine.set(key.value, el.value ? plainTextOf(el.value) : '')
}

function onBlur() {
  engine.endEdit()
  editing.value = false
  paint()
}

function onKeydown(event: KeyboardEvent) {
  if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Escape') {
    event.preventDefault()
    el.value?.blur()
  }
}
</script>

<template>
  <component
    :is="tag"
    ref="el"
    :contenteditable="view.editable.value ? 'plaintext-only' : 'false'"
    :data-cms-empty="empty || undefined"
    :data-cms-placeholder="t('cms.editor.field.placeholder')"
    spellcheck="true"
    @focus="onFocus"
    @input="onInput"
    @blur="onBlur"
    @keydown="onKeydown"
  >
    <slot v-if="!seeded" />
  </component>
</template>
