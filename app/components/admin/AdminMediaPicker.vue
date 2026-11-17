<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAdminMedia } from '../../admin/useAdminMedia'
import { useAdminI18n } from '../../admin/useAdminI18n'
import type { CmsMedia } from '../../types/media'

// Media Picker (architecture Б7 §22): one component for Edit Mode and admin
// forms. Choose an existing file or upload a new one; resolves with a media
// item, never a URL. A single uploaded file is chosen at once.
const props = defineProps<{
  /** Id of the current choice, highlighted in the grid. */
  selectedId?: string | null
  title?: string
}>()

const emit = defineEmits<{ pick: [media: CmsMedia] }>()
const open = defineModel<boolean>('open', { required: true })

const { t } = useAdminI18n()
const library = useAdminMedia()
const choice = ref<CmsMedia | null>(null)

watch(open, (next) => {
  if (next) {
    choice.value = null
  }
})

function confirm(media: CmsMedia | null = choice.value) {
  if (!media) {
    return
  }

  emit('pick', media)
  open.value = false
}

function onUploaded(added: CmsMedia[]) {
  if (added.length === 1) {
    confirm(added[0])
  }
}
</script>

<template>
  <AdminDialog
    v-model:open="open"
    :title="props.title ?? t('cms.media.pickerTitle')"
    size="lg"
  >
    <AdminMediaLibrary
      v-if="open"
      :library="library"
      :selected-id="choice?.id ?? selectedId ?? null"
      @activate="choice = $event"
      @uploaded="onUploaded"
    />
    <template #footer>
      <AdminButton
        variant="secondary"
        size="sm"
        @click="open = false"
      >
        {{ t('cms.media.cancel') }}
      </AdminButton>
      <AdminButton
        variant="primary"
        size="sm"
        :disabled="!choice"
        @click="confirm()"
      >
        {{ t('cms.media.choose') }}
      </AdminButton>
    </template>
  </AdminDialog>
</template>
