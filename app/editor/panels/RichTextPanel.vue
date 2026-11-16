<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useAdminI18n } from '../../admin/useAdminI18n'
import { toSafeHref } from '../../primitives/link'
import { useEditor } from '../inject'
import type { FieldRegistration } from '../kinds'
import FieldCounter from './FieldCounter.vue'
import ResetButton from './ResetButton.vue'

// Formatting toolbar above a rich text field: only what the stored format
// supports (bold, italic, link; MASTER_PLAN C-49). Format buttons keep the
// text selection: mousedown is prevented so the editor does not lose focus.
const props = defineProps<{
  field: Extract<FieldRegistration, { kind: 'richText' }>
}>()

const { t } = useAdminI18n()
const { engine } = useEditor()
const editor = computed(() => props.field.api.editor)
const tick = ref(0)

let detach: (() => void) | null = null

watch(editor, (instance) => {
  detach?.()

  if (!instance) {
    return
  }

  const bump = () => {
    tick.value++
  }

  instance.on('transaction', bump)
  detach = () => instance.off('transaction', bump)
}, { immediate: true })

onBeforeUnmount(() => detach?.())

function active(name: string) {
  void tick.value
  return editor.value?.isActive(name) ?? false
}

const length = computed(() => {
  void tick.value
  return editor.value?.state.doc.textContent.length ?? 0
})
const issue = computed(() => engine.issues.value.find(item => item.fieldId === props.field.id))

const linkOpen = ref(false)
const href = ref('')
const hrefError = computed(() => href.value.trim() === '' || toSafeHref(href.value.trim()) !== null
  ? undefined
  : t('cms.editor.link.types.invalid'))
const form = ref<HTMLFormElement | null>(null)

async function openLink() {
  href.value = (editor.value?.getAttributes('link').href as string | undefined) ?? ''
  linkOpen.value = true
  await nextTick()
  form.value?.querySelector('input')?.focus()
}

function closeLink() {
  linkOpen.value = false
  editor.value?.commands.focus()
}

function applyLink() {
  const instance = editor.value

  if (!instance || hrefError.value) {
    return
  }

  const chain = instance.chain().focus().extendMarkRange('link')

  if (href.value.trim() === '') {
    chain.unsetLink().run()
  } else {
    chain.setLink({ href: href.value.trim() }).run()
  }

  linkOpen.value = false
}
</script>

<template>
  <div class="ed-mini">
    <template v-if="!linkOpen">
      <AdminButton
        variant="ghost"
        size="xs"
        icon-only
        :aria-pressed="active('bold')"
        :title="t('cms.editor.richText.bold')"
        :aria-label="t('cms.editor.richText.bold')"
        @mousedown.prevent
        @click="editor?.chain().focus().toggleBold().run()"
      >
        <Icon
          name="lucide:bold"
          aria-hidden="true"
        />
      </AdminButton>
      <AdminButton
        variant="ghost"
        size="xs"
        icon-only
        :aria-pressed="active('italic')"
        :title="t('cms.editor.richText.italic')"
        :aria-label="t('cms.editor.richText.italic')"
        @mousedown.prevent
        @click="editor?.chain().focus().toggleItalic().run()"
      >
        <Icon
          name="lucide:italic"
          aria-hidden="true"
        />
      </AdminButton>
      <span
        class="ed-mini__divider"
        aria-hidden="true"
      />
      <AdminButton
        variant="ghost"
        size="xs"
        icon-only
        :aria-pressed="active('link')"
        :title="t('cms.editor.richText.link')"
        :aria-label="t('cms.editor.richText.link')"
        @mousedown.prevent
        @click="openLink"
      >
        <Icon
          name="lucide:link"
          aria-hidden="true"
        />
      </AdminButton>
      <AdminButton
        v-if="active('link')"
        variant="ghost"
        size="xs"
        icon-only
        :title="t('cms.editor.richText.unlink')"
        :aria-label="t('cms.editor.richText.unlink')"
        @mousedown.prevent
        @click="editor?.chain().focus().extendMarkRange('link').unsetLink().run()"
      >
        <Icon
          name="lucide:unlink"
          aria-hidden="true"
        />
      </AdminButton>
      <span
        class="ed-mini__divider"
        aria-hidden="true"
      />
      <FieldCounter
        v-if="field.maxLength"
        :length="length"
        :max="field.maxLength"
      />
      <span
        v-if="issue?.kind === 'required'"
        class="ed-mini__issue"
      >
        {{ t('cms.editor.field.required') }}
      </span>
      <ResetButton :field="field" />
    </template>

    <form
      v-else
      ref="form"
      class="ed-mini__link"
      @submit.prevent="applyLink"
      @keydown.esc.stop.prevent="closeLink"
    >
      <AdminInput
        v-model="href"
        :label="t('cms.editor.richText.linkPrompt')"
        :hint="t('cms.editor.link.destinationHint')"
        :error="hrefError"
        size="sm"
        name="cms-link-href"
        inputmode="url"
        autocomplete="off"
        spellcheck="false"
      />
      <div class="ed-actions">
        <AdminButton
          variant="secondary"
          size="xs"
          @click="closeLink"
        >
          {{ t('cms.editor.leave.cancel') }}
        </AdminButton>
        <AdminButton
          variant="primary"
          size="xs"
          type="submit"
        >
          {{ t('cms.editor.field.done') }}
        </AdminButton>
      </div>
    </form>
  </div>
</template>
