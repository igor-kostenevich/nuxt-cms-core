<script setup lang="ts">
import { computed, onMounted, ref, useId, useTemplateRef } from 'vue'
import { adminErrorKey } from '../../admin/error-key'
import { MEDIA_ACCEPT } from '../../admin/media/files'
import type { AdminMedia } from '../../admin/useAdminMedia'
import { useAdminI18n } from '../../admin/useAdminI18n'
import type { CmsMedia } from '../../types/media'

// Toolbar, grid and uploads of the media library (design: Figma "Media",
// node 18:11399). Shared by /admin/media and the Media Picker; the parent
// decides what activating a card does. Documents / Videos filters wait for
// those file types (C-75).
const props = defineProps<{
  library: AdminMedia
  /** Picker: the id of the current choice, so its card shows as selected. */
  selectedId?: string | null
}>()

const emit = defineEmits<{
  activate: [media: CmsMedia]
  /** Files finished uploading; the Picker selects a single one. */
  uploaded: [media: CmsMedia[]]
}>()

const TYPES = ['all', 'image', 'svg'] as const
const SORTS = ['newest', 'oldest', 'name', 'size'] as const

const { t } = useAdminI18n()
const uid = useId()
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const dragging = ref(false)
let dragDepth = 0

// The filters are the library's own reactive state, not a prop value.
const query = props.library.query
const picking = computed(() => props.selectedId !== undefined)
const canUpload = computed(() => props.library.canUpload())
const count = computed(() => props.library.items.value.length)
const empty = computed(() => props.library.status.value === 'ready'
  && count.value === 0
  && props.library.uploads.value.length === 0)
const sortOptions = computed(() => SORTS.map(sort => ({ value: sort, label: t(`cms.media.sorts.${sort}`) })))
const filtered = computed(() => query.search.trim() !== '' || query.type !== 'all')

onMounted(() => {
  void props.library.load()
})

async function uploadFiles(files: File[]) {
  if (!canUpload.value || files.length === 0) {
    return
  }

  const { added } = await props.library.upload(files)

  if (added.length) {
    emit('uploaded', added)
  }
}

function onFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...input.files ?? []]
  input.value = ''
  void uploadFiles(files)
}

function hasFiles(event: DragEvent) {
  return event.dataTransfer?.types.includes('Files') ?? false
}

function onDragEnter(event: DragEvent) {
  if (!canUpload.value || !hasFiles(event)) {
    return
  }

  dragDepth += 1
  dragging.value = true
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  dragging.value = dragDepth > 0
}

function onDrop(event: DragEvent) {
  dragDepth = 0
  dragging.value = false

  if (canUpload.value) {
    void uploadFiles([...event.dataTransfer?.files ?? []])
  }
}
</script>

<template>
  <div
    class="media-library"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div class="media-library__toolbar">
      <label class="media-library__search">
        <span class="media-library__hidden">{{ t('cms.media.search') }}</span>
        <Icon
          name="lucide:search"
          aria-hidden="true"
        />
        <input
          v-model="query.search"
          type="search"
          :placeholder="t('cms.media.searchPlaceholder')"
          autocomplete="off"
        >
      </label>

      <div
        class="media-library__segments"
        role="group"
        :aria-label="t('cms.media.typeLabel')"
      >
        <button
          v-for="type in TYPES"
          :key="type"
          type="button"
          class="media-library__segment"
          :aria-pressed="query.type === type"
          @click="query.type = type"
        >
          {{ t(`cms.media.types.${type}`) }}
        </button>
      </div>

      <span class="media-library__spacer" />

      <AdminSelect
        v-model="query.sort"
        class="media-library__sort"
        :options="sortOptions"
        :label="t('cms.media.sortLabel')"
        label-placement="hidden"
        size="sm"
      />

      <AdminButton
        v-if="canUpload"
        variant="primary"
        size="sm"
        :aria-controls="`${uid}-file`"
        @click="fileInput?.click()"
      >
        <template #leading>
          <Icon
            name="lucide:upload"
            aria-hidden="true"
          />
        </template>
        {{ t('cms.media.upload') }}
      </AdminButton>
      <input
        :id="`${uid}-file`"
        ref="fileInput"
        type="file"
        :accept="MEDIA_ACCEPT"
        multiple
        hidden
        @change="onFiles"
      >
    </div>

    <p
      class="media-library__count"
      aria-live="polite"
    >
      {{ library.status.value === 'loading' ? t('cms.media.loading') : t('cms.media.count', { count }) }}
    </p>

    <AdminAlert
      v-if="library.status.value === 'error'"
      tone="danger"
      :title="t(adminErrorKey(library.error.value))"
    >
      <template #action>
        <AdminButton
          variant="secondary"
          size="sm"
          @click="library.load()"
        >
          {{ t('cms.media.retry') }}
        </AdminButton>
      </template>
    </AdminAlert>

    <div
      v-else-if="empty"
      class="media-library__empty"
    >
      <Icon
        name="lucide:image"
        aria-hidden="true"
      />
      <p>{{ filtered ? t('cms.media.emptyFiltered') : t('cms.media.empty') }}</p>
      <p
        v-if="!filtered && canUpload"
        class="media-library__hint"
      >
        {{ t('cms.media.dropHint') }}
      </p>
    </div>

    <ul
      v-else
      class="media-library__grid"
      :aria-label="picking ? t('cms.media.pickerGrid') : t('cms.media.title')"
    >
      <li
        v-for="pending in library.uploads.value"
        :key="pending.key"
        class="media-library__pending"
        :class="{ 'media-library__pending--error': pending.error }"
      >
        <span class="media-library__pending-name">{{ pending.name }}</span>
        <span
          v-if="pending.error"
          class="media-library__pending-error"
          role="alert"
        >{{ pending.error }}</span>
        <span
          v-else
          class="media-library__pending-state"
        >
          <Icon
            name="lucide:loader-circle"
            class="media-library__spinner"
            aria-hidden="true"
          />
          {{ t('cms.media.uploading') }}
        </span>
        <AdminButton
          v-if="pending.error"
          variant="ghost"
          size="xs"
          @click="library.dismissUpload(pending.key)"
        >
          {{ t('cms.media.dismiss') }}
        </AdminButton>
      </li>
      <li
        v-for="media in library.items.value"
        :key="media.id"
      >
        <AdminMediaCard
          :media="media"
          :usage="library.usageOf(media.id)"
          :selected="picking ? media.id === selectedId : undefined"
          @activate="emit('activate', $event)"
        />
      </li>
    </ul>

    <div
      v-if="dragging"
      class="media-library__drop"
      aria-hidden="true"
    >
      <Icon name="lucide:upload" />
      {{ t('cms.media.drop') }}
    </div>
  </div>
</template>

<style scoped>
.media-library {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--cms-space-3);
}

.media-library__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cms-space-3);
}

.media-library__spacer {
  flex: 1;
}

.media-library__hidden {
  position: absolute;
  /* At the top of its box: never stretches a scroll area below the content. */
  top: 0;
  left: 0;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.media-library__search {
  position: relative;
  display: flex;
  align-items: center;
}

.media-library__sort {
  width: 10.5rem;
}

.media-library__search :deep(svg) {
  position: absolute;
  inset-inline-start: var(--cms-space-3);
  width: 0.875rem;
  height: 0.875rem;
  color: var(--cms-text-tertiary);
  pointer-events: none;
}

.media-library__search input {
  height: var(--cms-control-sm);
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-md);
  background: var(--cms-card);
  color: var(--cms-foreground);
  font: inherit;
  font-size: var(--cms-type-body-small-size);
}

.media-library__search input {
  width: 17.5rem;
  max-width: 100%;
  padding: 0 var(--cms-space-3) 0 var(--cms-space-8);
}

.media-library__search input:focus-visible {
  border-color: var(--cms-ring);
  outline: none;
  box-shadow: var(--cms-focus-ring-field);
}

.media-library__segments {
  display: inline-flex;
  gap: var(--cms-space-1);
  padding: 0.1875rem;
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-md);
  background: var(--cms-card);
}

.media-library__segment {
  height: calc(var(--cms-control-sm) - 0.375rem);
  padding: 0 var(--cms-space-3);
  border: 0;
  border-radius: var(--cms-radius-sm);
  background: transparent;
  color: var(--cms-text-secondary);
  font: inherit;
  font-size: var(--cms-type-body-small-size);
  cursor: pointer;
}

.media-library__segment:hover {
  background: var(--cms-surface-hover);
}

.media-library__segment[aria-pressed='true'] {
  background: var(--cms-surface-selected);
  color: var(--cms-foreground);
  font-weight: var(--cms-type-label-weight);
}

.media-library__segment:focus-visible {
  outline: none;
  box-shadow: var(--cms-focus-ring);
}

.media-library__count {
  margin: 0;
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
}

.media-library__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  gap: var(--cms-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.media-library__grid > li {
  display: flex;
  min-width: 0;
}

.media-library__grid > li > :deep(.media-card) {
  flex: 1;
}

.media-library__pending {
  flex-direction: column;
  justify-content: center;
  gap: var(--cms-space-2);
  min-height: 12rem;
  padding: var(--cms-space-3);
  border: var(--cms-border-width) dashed var(--cms-border-strong);
  border-radius: var(--cms-radius-md);
  background: var(--cms-surface-secondary);
}

.media-library__pending--error {
  border-color: var(--cms-destructive-border);
  background: var(--cms-destructive-subtle);
}

.media-library__pending-name {
  overflow: hidden;
  font-size: var(--cms-type-body-small-size);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-library__pending-state,
.media-library__pending-error {
  display: inline-flex;
  align-items: center;
  gap: var(--cms-space-1);
  font-size: var(--cms-type-caption-size);
  line-height: var(--cms-type-caption-line);
}

.media-library__pending-state {
  color: var(--cms-text-secondary);
}

.media-library__pending-error {
  color: var(--cms-destructive-text);
}

.media-library__spinner {
  animation: media-library-spin 900ms linear infinite;
}

@keyframes media-library-spin {
  to {
    transform: rotate(1turn);
  }
}

@media (prefers-reduced-motion: reduce) {
  .media-library__spinner {
    animation: none;
  }
}

.media-library__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--cms-space-2);
  padding: var(--cms-space-12) var(--cms-space-4);
  border: var(--cms-border-width) dashed var(--cms-border);
  border-radius: var(--cms-radius-lg);
  color: var(--cms-text-secondary);
  text-align: center;
}

.media-library__empty p {
  margin: 0;
}

.media-library__empty :deep(svg) {
  width: 2rem;
  height: 2rem;
  color: var(--cms-text-tertiary);
}

.media-library__hint {
  font-size: var(--cms-type-body-small-size);
}

.media-library__drop {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--cms-space-2);
  border: 2px dashed var(--cms-primary);
  border-radius: var(--cms-radius-lg);
  background: color-mix(in srgb, var(--cms-primary-subtle) 85%, transparent);
  color: var(--cms-primary);
  font-weight: var(--cms-type-label-weight);
  pointer-events: none;
}
</style>
