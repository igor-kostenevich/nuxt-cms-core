<script setup lang="ts">
import { computed, ref, useId, useTemplateRef } from 'vue'
import { useAdminI18n } from '../../admin/useAdminI18n'
import { useEditor } from '../inject'
import type { FieldRegistration, ImageApi } from '../kinds'
import ResetButton from './ResetButton.vue'

// Image and background editor. Media (009) does not exist yet, so the library
// is a stand-in: the images already on this page plus files picked from the
// device, kept as object URLs for this session only. Nothing here is saved.
const props = defineProps<{
  field: Extract<FieldRegistration, { kind: 'image' | 'background' }>
}>()

/** Arrow keys move the focal point this much; with Shift, more. */
const FOCAL_STEP = 2
const FOCAL_STEP_LARGE = 10
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']

const { t } = useAdminI18n()
const { engine, view } = useEditor()
const uid = useId()
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

const override = computed(() => view.media.get(props.field.key) ?? {})
const src = computed(() => override.value.src ?? props.field.api.defaultSrc())
const decorativeByCode = computed(() => props.field.api.decorative())
const decorative = computed(() => decorativeByCode.value || override.value.decorative === true)
const alt = computed(() => override.value.alt ?? props.field.api.defaultAlt())
const focal = computed(() => override.value.focal ?? { x: 50, y: 50 })

const libraryOpen = ref(false)
const uploads = ref<string[]>([])
const uploadError = ref('')

/** Every image source on the page, plus this session's uploads. */
const library = computed(() => {
  const sources = new Set<string>(uploads.value)

  for (const field of engine.fields.values()) {
    if (field.kind !== 'image' && field.kind !== 'background') {
      continue
    }

    const own = view.media.get(field.key)?.src ?? (field.api as ImageApi).defaultSrc()

    if (own) {
      sources.add(own)
    }
  }

  return [...sources]
})

function fileName(source: string) {
  return decodeURIComponent(source.split('/').pop() ?? source)
}

function choose(source: string) {
  view.setMedia(props.field.key, { src: source })
  libraryOpen.value = false
}

function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''

  if (!file) {
    return
  }

  if (!ACCEPTED_TYPES.includes(file.type)) {
    uploadError.value = t('cms.editor.image.wrongType')
    return
  }

  uploadError.value = ''
  const url = URL.createObjectURL(file)
  uploads.value = [url, ...uploads.value]
  choose(url)
}

function setFocal(event: MouseEvent) {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()

  // A keyboard "click" has no pointer position; arrows move the point instead.
  if (event.detail === 0) {
    return
  }

  const x = Math.round(((event.clientX - box.left) / box.width) * 100)
  const y = Math.round(((event.clientY - box.top) / box.height) * 100)
  view.setMedia(props.field.key, { focal: { x, y } })
}

function nudgeFocal(event: KeyboardEvent) {
  const step = event.shiftKey ? FOCAL_STEP_LARGE : FOCAL_STEP
  const delta: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  }
  const move = delta[event.key]

  if (!move) {
    return
  }

  event.preventDefault()
  const clamp = (value: number) => Math.max(0, Math.min(100, value))
  view.setMedia(props.field.key, {
    focal: { x: clamp(focal.value.x + move[0]), y: clamp(focal.value.y + move[1]) },
  })
}
</script>

<template>
  <div class="ed-card ed-card--image">
    <p class="ed-section-title">
      {{ t('cms.editor.image.replace') }}
    </p>
    <div class="ed-stack">
      <AdminButton
        variant="secondary"
        size="sm"
        class="ed-block"
        :aria-expanded="libraryOpen"
        :aria-controls="`${uid}-library`"
        @click="libraryOpen = !libraryOpen"
      >
        <template #leading>
          <Icon
            name="lucide:folder-open"
            aria-hidden="true"
          />
        </template>
        {{ t('cms.editor.image.library') }}
      </AdminButton>
      <div
        v-if="libraryOpen"
        :id="`${uid}-library`"
        class="ed-library"
        role="group"
        :aria-label="t('cms.editor.image.libraryTitle')"
      >
        <button
          v-for="source in library"
          :key="source"
          type="button"
          class="ed-library__item"
          :aria-pressed="source === src"
          :aria-label="fileName(source)"
          @click="choose(source)"
        >
          <img
            :src="source"
            alt=""
          >
        </button>
      </div>
      <AdminButton
        variant="secondary"
        size="sm"
        class="ed-block"
        @click="fileInput?.click()"
      >
        <template #leading>
          <Icon
            name="lucide:upload"
            aria-hidden="true"
          />
        </template>
        {{ t('cms.editor.image.upload') }}
      </AdminButton>
      <input
        ref="fileInput"
        type="file"
        :accept="ACCEPTED_TYPES.join(',')"
        hidden
        @change="onFile"
      >
      <p
        v-if="uploadError"
        class="ed-hint ed-hint--error"
        role="alert"
      >
        {{ uploadError }}
      </p>
    </div>

    <template v-if="!decorativeByCode">
      <AdminInput
        :model-value="decorative ? '' : alt"
        :label="t('cms.editor.image.alt')"
        :hint="t('cms.editor.image.altHint')"
        :disabled="decorative"
        size="sm"
        multiline
        name="cms-image-alt"
        @update:model-value="view.setMedia(field.key, { alt: $event })"
      />
      <label class="ed-check">
        <input
          type="checkbox"
          :checked="decorative"
          @change="view.setMedia(field.key, { decorative: ($event.target as HTMLInputElement).checked })"
        >
        {{ t('cms.editor.image.decorative') }}
      </label>
    </template>

    <div
      v-if="src"
      class="ed-field"
    >
      <span
        :id="`${uid}-focal`"
        class="ed-section-title"
      >{{ t('cms.editor.image.focal') }}</span>
      <button
        type="button"
        class="ed-focal"
        :aria-labelledby="`${uid}-focal`"
        :aria-describedby="`${uid}-focal-hint`"
        @click="setFocal"
        @keydown="nudgeFocal"
      >
        <img
          :src="src"
          alt=""
        >
        <span
          class="ed-focal__dot"
          aria-hidden="true"
          :style="{ left: `${focal.x}%`, top: `${focal.y}%` }"
        />
      </button>
      <span
        :id="`${uid}-focal-hint`"
        class="ed-hint"
        aria-live="polite"
      >{{ t('cms.editor.image.focalHint', focal) }}</span>
    </div>

    <p class="ed-note">
      <Icon
        name="lucide:info"
        aria-hidden="true"
      />
      {{ t('cms.editor.image.notSaved') }}
    </p>

    <div class="ed-actions">
      <ResetButton
        :field="field"
        media
      />
      <span class="ed-actions__spacer" />
      <AdminButton
        variant="primary"
        size="xs"
        @click="view.select(null); field.el.focus({ preventScroll: true })"
      >
        {{ t('cms.editor.field.done') }}
      </AdminButton>
    </div>
  </div>
</template>
