<script setup lang="ts">
// File drop zone of the admin UI kit (design: Figma "File upload", node
// 17:7810): drop files or browse; the zone shows the drag, the upload in
// progress (no percentage: the storage does not report one), the result and
// an error.
import { ref, useTemplateRef } from 'vue'

const props = withDefaults(defineProps<{
  /** What the zone says: "Drop a file or browse". */
  title: string
  /** Allowed files, e.g. "JPG, PNG, WebP or SVG up to 5 MB". */
  hint?: string
  accept?: string
  multiple?: boolean
  state?: 'idle' | 'uploading' | 'uploaded' | 'error'
  /** The line under the title in a state (the error, the file uploaded…). */
  message?: string
  disabled?: boolean
}>(), { hint: undefined, accept: undefined, multiple: false, state: 'idle', message: undefined })

const emit = defineEmits<{ files: [files: File[]] }>()

const input = useTemplateRef<HTMLInputElement>('input')
const dragging = ref(false)
let depth = 0

function take(list: FileList | null | undefined) {
  const files = [...(list ?? [])]

  if (files.length > 0 && !props.disabled && props.state !== 'uploading') {
    emit('files', props.multiple ? files : files.slice(0, 1))
  }
}

function onDrop(event: DragEvent) {
  depth = 0
  dragging.value = false
  take(event.dataTransfer?.files)
}

function onEnter() {
  depth++
  dragging.value = true
}

function onLeave() {
  depth = Math.max(0, depth - 1)
  dragging.value = depth > 0
}

function browse() {
  if (!props.disabled && props.state !== 'uploading') {
    input.value?.click()
  }
}

const ICONS = { idle: 'lucide:upload', uploading: 'lucide:loader-circle', uploaded: 'lucide:circle-check', error: 'lucide:circle-alert' }
</script>

<template>
  <div
    class="admin-dropzone"
    :class="[`admin-dropzone--${state}`, { 'admin-dropzone--drag': dragging, 'admin-dropzone--disabled': disabled }]"
    role="button"
    :tabindex="disabled ? -1 : 0"
    :aria-disabled="disabled ? 'true' : undefined"
    :aria-busy="state === 'uploading' ? 'true' : undefined"
    @click="browse"
    @keydown.enter.prevent="browse"
    @keydown.space.prevent="browse"
    @dragenter.prevent="onEnter"
    @dragover.prevent
    @dragleave.prevent="onLeave"
    @drop.prevent="onDrop"
  >
    <Icon
      :name="ICONS[state]"
      class="admin-dropzone__icon"
      :class="{ 'admin-dropzone__icon--spin': state === 'uploading' }"
      aria-hidden="true"
    />
    <span class="admin-dropzone__title">{{ title }}</span>
    <span
      v-if="message || hint"
      class="admin-dropzone__hint"
      :role="state === 'error' ? 'alert' : undefined"
    >{{ message ?? hint }}</span>
    <input
      ref="input"
      type="file"
      :accept="accept"
      :multiple="multiple"
      hidden
      @change="take(($event.target as HTMLInputElement).files); ($event.target as HTMLInputElement).value = ''"
    >
  </div>
</template>

<style scoped>
.admin-dropzone {
  display: grid;
  justify-items: center;
  gap: var(--cms-space-1);
  padding: var(--cms-space-6) var(--cms-space-4);
  border: 2px dashed var(--cms-border);
  border-radius: var(--cms-radius-md);
  background: var(--cms-surface-secondary);
  color: var(--cms-foreground);
  text-align: center;
  cursor: pointer;
}

.admin-dropzone:hover:not(.admin-dropzone--disabled) {
  border-color: var(--cms-border-strong);
  background: var(--cms-surface-hover);
}

.admin-dropzone:focus-visible {
  outline: none;
  box-shadow: var(--cms-focus-ring);
}

.admin-dropzone--drag {
  border-color: var(--cms-primary);
  background: var(--cms-primary-subtle);
}

.admin-dropzone--uploading {
  border-color: var(--cms-info-border);
  background: var(--cms-info-subtle);
  cursor: progress;
}

.admin-dropzone--uploaded {
  border-color: var(--cms-success-border);
  background: var(--cms-success-subtle);
}

.admin-dropzone--error {
  border-color: var(--cms-destructive-border);
  background: var(--cms-destructive-subtle);
}

.admin-dropzone--disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.admin-dropzone__icon {
  width: 20px;
  height: 20px;
  color: var(--cms-text-secondary);
}

.admin-dropzone--uploading .admin-dropzone__icon {
  color: var(--cms-primary);
}

.admin-dropzone--uploaded .admin-dropzone__icon {
  color: var(--cms-success-text);
}

.admin-dropzone--error .admin-dropzone__icon {
  color: var(--cms-destructive-text);
}

.admin-dropzone__icon--spin {
  animation: admin-dropzone-spin 0.8s linear infinite;
}

.admin-dropzone__title {
  font-size: var(--cms-type-body-small-size);
  font-weight: 600;
}

.admin-dropzone__hint {
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
}

@keyframes admin-dropzone-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .admin-dropzone__icon--spin {
    animation: none;
  }
}
</style>
