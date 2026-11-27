<script setup lang="ts">
import { computed, ref } from 'vue'
import { MEDIA_ACCEPT } from '../../admin/media/files'
import { useAdminMedia } from '../../admin/useAdminMedia'
import { useAdminI18n } from '../../admin/useAdminI18n'
import type { CmsContentImageField } from '../../../src/content-fields'
import { resolveImage, toImageValue } from '../../primitives/media'
import type { CmsMedia } from '../../types/media'
import { useEditorField } from '../field'
import { useEditor } from '../inject'
import FormField from './FormField.vue'
import { issueMessage } from './messages'
import { useShownIssue } from './shown-issue'

// An image of Core's entry form (014, C-103): drop a file or choose one from
// the library; then the chosen file with Replace and Remove. The field stores
// `{ mediaId }`; the description (alt) comes from the file in the library.
// Structure: the same image in every language (C-78).
const props = defineProps<{
  address: string
  field: CmsContentImageField
  label: string
  hint?: string
}>()

const { t } = useAdminI18n()
const { engine } = useEditor()
const library = useAdminMedia()
const el = ref<HTMLElement | null>(null)
const pickerOpen = ref(false)
const state = ref<'idle' | 'uploading' | 'error'>('idle')
const uploadError = ref('')

const { view, key, id } = useEditorField({
  kind: 'image',
  fieldKey: () => props.address,
  el,
  label: () => props.label,
  required: () => props.field.required,
  form: true,
  value: () => engine.get(props.address),
  api: {
    defaultSrc: () => undefined,
    defaultAlt: () => '',
    decorative: () => false,
  },
})

const value = computed(() => toImageValue(engine.get(key.value)))
const image = computed(() => resolveImage(value.value, engine.media.value, { src: undefined, alt: '', decorative: false }))
const locked = computed(() => engine.translating.value || !view.editable.value)
const shown = useShownIssue(el, computed(() => engine.issues.value.find(issue => issue.fieldId === id)?.kind ?? null))
const error = computed(() => issueMessage(shown.value, t, props.field))

function choose(item: CmsMedia) {
  engine.addMedia([item])
  engine.endEdit()
  engine.set(key.value, { mediaId: item.id })
}

function remove() {
  engine.endEdit()
  engine.set(key.value, undefined)
}

async function upload(files: File[]) {
  state.value = 'uploading'
  uploadError.value = ''
  const { added, errors } = await library.upload(files.slice(0, 1))

  if (added[0]) {
    state.value = 'idle'
    choose(added[0])
  } else {
    state.value = 'error'
    uploadError.value = errors[0] ?? t('cms.editor.form.image.failed')
  }
}

const note = computed(() => (engine.translating.value
  ? t('cms.editor.form.structure', { code: engine.defaultLocaleLabel.value })
  : undefined))
</script>

<template>
  <FormField
    :label="label"
    :required="field.required"
    :hint="hint"
    :error="error"
    :note="note"
  >
    <div
      ref="el"
      class="entry-form-image"
      :aria-invalid="error ? 'true' : undefined"
    >
      <template v-if="value && image.src">
        <div class="entry-form-image__preview">
          <img
            :src="image.src"
            :alt="image.alt"
          >
        </div>
        <div
          v-if="!locked"
          class="entry-form-image__actions"
        >
          <AdminButton
            variant="secondary"
            size="sm"
            @click="pickerOpen = true"
          >
            <template #leading>
              <Icon
                name="lucide:images"
                aria-hidden="true"
              />
            </template>
            {{ t('cms.editor.form.image.replace') }}
          </AdminButton>
          <AdminButton
            variant="ghost"
            size="sm"
            @click="remove"
          >
            {{ t('cms.editor.form.image.remove') }}
          </AdminButton>
        </div>
      </template>
      <template v-else-if="!locked">
        <AdminDropzone
          :title="t('cms.editor.form.image.drop')"
          :hint="t('cms.editor.form.image.limits')"
          :accept="MEDIA_ACCEPT"
          :state="state"
          :message="state === 'uploading' ? t('cms.editor.form.image.uploading') : state === 'error' ? uploadError : undefined"
          class="entry-form-image__drop"
          @files="upload"
        />
        <AdminButton
          variant="link"
          size="sm"
          class="entry-form-image__library"
          @click="pickerOpen = true"
        >
          {{ t('cms.editor.form.image.choose') }}
        </AdminButton>
      </template>
      <p
        v-else
        class="entry-form-image__none"
      >
        {{ t('cms.editor.form.image.none') }}
      </p>
    </div>
    <AdminMediaPicker
      v-model:open="pickerOpen"
      :selected-id="value?.mediaId ?? null"
      @pick="choose"
    />
  </FormField>
</template>

<style scoped>
.entry-form-image {
  display: grid;
  gap: var(--cms-space-2);
  border-radius: var(--cms-radius-sm);
}

.entry-form-image:focus-visible {
  outline: none;
  box-shadow: var(--cms-focus-ring);
}

.entry-form-image__preview {
  display: grid;
  place-items: center;
  width: 12rem;
  max-width: 100%;
  aspect-ratio: 3 / 2;
  overflow: hidden;
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-sm);
  background: var(--cms-surface-secondary);
}

.entry-form-image__preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.entry-form-image__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cms-space-2);
}

.entry-form-image__library {
  justify-self: start;
}

.entry-form-image__none {
  margin: 0;
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
}
</style>
