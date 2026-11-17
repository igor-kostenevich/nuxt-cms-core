<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import { useImageCrop } from '../../admin/media/crop'
import { MEDIA_ACCEPT } from '../../admin/media/files'
import { useAdminMedia } from '../../admin/useAdminMedia'
import { useAdminI18n } from '../../admin/useAdminI18n'
import { resolveImage, toImageValue } from '../../primitives/media'
import type { CmsFocalPoint, CmsImageValue, CmsMedia } from '../../types/media'
import { useEditor } from '../inject'
import type { FieldRegistration } from '../kinds'
import ResetButton from './ResetButton.vue'

// Image and background editor. The field stores { mediaId, alt?, decorative?,
// focal? } (C-74): choosing an image writes the id, the overrides below apply
// to this usage only. The media's own defaults are edited in the library.
const props = defineProps<{
  field: Extract<FieldRegistration, { kind: 'image' | 'background' }>
}>()

const { t } = useAdminI18n()
const { engine, view } = useEditor()
const library = useAdminMedia()
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

const pickerOpen = ref(false)
const uploading = ref(false)
const uploadError = ref('')

const value = computed(() => toImageValue(engine.get(props.field.key)))
const resolved = computed(() => resolveImage(value.value, engine.media.value, {
  src: props.field.api.defaultSrc(),
  alt: props.field.api.defaultAlt(),
  decorative: props.field.api.decorative(),
}))
const media = computed(() => resolved.value.media)
const decorativeByCode = computed(() => props.field.api.decorative())
const decorative = computed(() => decorativeByCode.value || value.value?.decorative === true)
const altPlaceholder = computed(() => media.value?.defaultAlt || props.field.api.defaultAlt())
// The <img> on the page: the field itself, or the image behind a background.
// Re-found after a new choice renders, since a background may get its <img> only then.
const frame = useImageCrop(
  () => {
    const el = props.field.el
    return el instanceof HTMLImageElement ? el : el.querySelector<HTMLImageElement>('.cms-background__image')
  },
  () => [props.field.el, value.value?.mediaId],
)

const focal = computed<CmsFocalPoint | null>({
  get: () => value.value?.focal ?? media.value?.defaultFocal ?? null,
  set: next => patch({ focal: next ?? undefined }),
})

/** Overrides of this usage; undefined removes one. Needs a chosen image. */
function patch(change: Partial<Omit<CmsImageValue, 'mediaId'>>) {
  const current = value.value

  if (!current) {
    return
  }

  const merged = { ...current, ...change }
  // Only what is set is stored: an empty alt or `decorative: false` is no override.
  const next: CmsImageValue = { mediaId: current.mediaId }

  if (merged.alt) {
    next.alt = merged.alt
  }

  if (merged.decorative) {
    next.decorative = true
  }

  if (merged.focal) {
    next.focal = merged.focal
  }

  engine.set(props.field.key, next)
}

/** A new image starts clean: alt and focal of the previous one do not fit it. */
function choose(item: CmsMedia) {
  engine.addMedia([item])
  engine.set(props.field.key, { mediaId: item.id })
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''

  if (!file) {
    return
  }

  uploading.value = true
  uploadError.value = ''

  const { added, errors } = await library.upload([file])
  uploading.value = false

  if (added[0]) {
    choose(added[0])
  } else {
    uploadError.value = errors[0] ?? ''
  }
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
        aria-haspopup="dialog"
        @click="pickerOpen = true"
      >
        <template #leading>
          <Icon
            name="lucide:folder-open"
            aria-hidden="true"
          />
        </template>
        {{ t('cms.editor.image.library') }}
      </AdminButton>
      <AdminButton
        v-if="library.canUpload()"
        variant="secondary"
        size="sm"
        class="ed-block"
        :loading="uploading"
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
        :accept="MEDIA_ACCEPT"
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

    <template v-if="media">
      <template v-if="!decorativeByCode">
        <AdminInput
          :model-value="decorative ? '' : value?.alt ?? ''"
          :label="t('cms.editor.image.alt')"
          :hint="t('cms.editor.image.altHint')"
          :placeholder="altPlaceholder"
          :disabled="decorative"
          size="sm"
          multiline
          name="cms-image-alt"
          @focus="engine.beginEdit(field.key)"
          @blur="engine.endEdit()"
          @update:model-value="patch({ alt: $event || undefined })"
        />
        <label class="ed-check">
          <input
            type="checkbox"
            :checked="decorative"
            @change="patch({ decorative: ($event.target as HTMLInputElement).checked })"
          >
          {{ t('cms.editor.image.decorative') }}
        </label>
      </template>

      <!-- Only where the page crops the image: elsewhere the point changes nothing. -->
      <AdminFocalPicker
        v-if="frame"
        v-model="focal"
        :src="media.url"
        :label="t('cms.editor.image.focal')"
        :frame="frame"
        @start="engine.beginEdit(field.key)"
        @end="engine.endEdit()"
      />
      <p
        v-else
        class="ed-hint"
      >
        {{ t('cms.editor.image.notCropped') }}
      </p>
    </template>
    <p
      v-else
      class="ed-note"
    >
      <Icon
        name="lucide:info"
        aria-hidden="true"
      />
      {{ t('cms.editor.image.chooseFirst') }}
    </p>

    <div class="ed-actions">
      <ResetButton :field="field" />
      <span class="ed-actions__spacer" />
      <AdminButton
        variant="primary"
        size="xs"
        @click="view.select(null); field.el.focus({ preventScroll: true })"
      >
        {{ t('cms.editor.field.done') }}
      </AdminButton>
    </div>

    <AdminMediaPicker
      v-model:open="pickerOpen"
      :selected-id="value?.mediaId ?? null"
      @pick="choose"
    />
  </div>
</template>
