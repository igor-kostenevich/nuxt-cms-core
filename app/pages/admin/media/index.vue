<script setup lang="ts">
import { useAdminMedia } from '../../../admin/useAdminMedia'
import { useAdminI18n } from '../../../admin/useAdminI18n'
import type { CmsMedia } from '../../../types/media'

definePageMeta({
  // The Client Project's layouts frame the site, not the admin.
  layout: false,
  middleware: ['cms-auth'],
})

const { t } = useAdminI18n()
const library = useAdminMedia()
const openId = ref<string | null>(null)
const dialogOpen = ref(false)

// The dialog shows the item from the list, so a save or replace there updates both.
const opened = computed<CmsMedia | null>(() => library.items.value.find(item => item.id === openId.value) ?? null)

function openMedia(media: CmsMedia) {
  openId.value = media.id
  dialogOpen.value = true
}
</script>

<template>
  <AdminShell :title="t('cms.media.title')">
    <AdminMediaLibrary
      :library="library"
      @activate="openMedia"
    />
    <AdminMediaDialog
      v-model:open="dialogOpen"
      :library="library"
      :media="opened"
    />
  </AdminShell>
</template>
