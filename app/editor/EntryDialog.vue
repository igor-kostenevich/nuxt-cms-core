<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import type { CmsContentField } from '../../src/content-fields'
import EntryDialogBody from './EntryDialogBody.vue'

// The dialog of the Content section (014 stage 5). The body, with the Engine
// and the lock, exists only while the dialog is open: closing releases the
// lock; closing a new entry before its first save leaves nothing behind.
const props = defineProps<{
  title: string
  type: string
  entryId: string | null
  /** The form Core renders from the type's fields (cms.content.ts). */
  fields: Record<string, CmsContentField>
  /** Opened by Publish in a list: tries to publish as soon as the entry is loaded. */
  publishOnOpen?: boolean
}>()

const emit = defineEmits<{
  created: [id: string]
  changed: []
  title: [value: string]
}>()

const open = defineModel<boolean>('open', { required: true })

// Publish asked in a list: the dialog stays out of sight while the entry is
// loaded and published; it appears only when the person is needed (a question,
// a field to fix, a lock held by someone else), or when it takes too long.
const revealed = ref(!props.publishOnOpen)
const body = useTemplateRef<InstanceType<typeof EntryDialogBody>>('body')

/** Esc, the backdrop and × ask about unsaved changes first. */
async function onOpen(next: boolean) {
  if (next || !body.value || await body.value.confirmLeave()) {
    open.value = next
  }
}
</script>

<template>
  <AdminDialog
    :open="open"
    :title="title"
    size="lg"
    :silent="!revealed"
    @update:open="onOpen"
  >
    <EntryDialogBody
      ref="body"
      :type="type"
      :entry-id="entryId"
      :fields="fields"
      :publish-on-open="publishOnOpen"
      @created="emit('created', $event)"
      @changed="emit('changed')"
      @title="emit('title', $event)"
      @reveal="revealed = true"
      @done="open = false"
    />
  </AdminDialog>
</template>
