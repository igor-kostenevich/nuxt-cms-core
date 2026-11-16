<script setup lang="ts">
import { computed } from 'vue'
import { useAdminI18n } from '../../admin/useAdminI18n'
import { useEditor } from '../inject'
import type { FieldRegistration } from '../kinds'
import { useEditorSession } from '../session'
import { useEditorUi } from '../ui'

// Back to the published value of one field, after a confirmation.
const props = defineProps<{
  field: FieldRegistration
  /** Image fields reset their session-only preview, not the document. */
  media?: boolean
}>()

const { t } = useAdminI18n()
const { engine, view } = useEditor()
const ui = useEditorUi()
const session = useEditorSession()

const changed = computed(() => props.media
  ? view.media.has(props.field.key)
  : engine.changed(props.field.key))

async function reset() {
  session.blurActiveField()

  const choice = await ui.confirm({
    title: t('cms.editor.field.resetTitle'),
    confirm: t('cms.editor.field.resetConfirm'),
    cancel: t('cms.editor.leave.cancel'),
    destructive: true,
  })

  if (choice !== 'confirm') {
    return
  }

  if (props.media) {
    view.media.delete(props.field.key)
  } else {
    engine.reset(props.field.key)
  }

  props.field.el.focus({ preventScroll: true })
}
</script>

<template>
  <AdminButton
    variant="ghost"
    size="xs"
    :disabled="!changed"
    @mousedown.prevent
    @click="reset"
  >
    <template #leading>
      <Icon
        name="lucide:rotate-ccw"
        aria-hidden="true"
      />
    </template>
    {{ t('cms.editor.field.reset') }}
  </AdminButton>
</template>
