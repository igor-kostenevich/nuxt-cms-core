<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { adminErrorKey } from '../../admin/error-key'
import { formatBytes, MEDIA_ACCEPT, MediaFileError, mediaTypeLabel } from '../../admin/media/files'
import { usageLabels } from '../../admin/media/usage'
import type { AdminMedia } from '../../admin/useAdminMedia'
import { useAdminI18n } from '../../admin/useAdminI18n'
import type { CmsFocalPoint, CmsMedia } from '../../types/media'

// One file of the library: preview, name, defaults every usage starts from
// (alt, focal point), where it is used, Replace and Delete. Replace uploads a
// new file under the same id; choosing another image for one place is done in
// that place, not here (MASTER_PLAN §8).
const props = defineProps<{
  library: AdminMedia
  media: CmsMedia | null
}>()

const open = defineModel<boolean>('open', { required: true })

const { t, locale } = useAdminI18n()
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

const name = ref('')
const defaultAlt = ref('')
const defaultFocal = ref<CmsFocalPoint | null>(null)
const busy = ref<'save' | 'replace' | 'delete' | null>(null)
const failure = ref('')
const notice = ref('')
const confirmingDelete = ref(false)

const current = computed(() => props.media)
const usage = computed(() => (current.value ? props.library.usageOf(current.value.id) : []))
const labels = computed(() => usageLabels(usage.value, t))
const canEdit = computed(() => props.library.canEdit())
const canDelete = computed(() => props.library.canDelete())
const isSvg = computed(() => current.value?.mime === 'image/svg+xml')
const dirty = computed(() => {
  const media = current.value

  return Boolean(media) && (
    name.value.trim() !== media!.name
    || defaultAlt.value !== media!.defaultAlt
    || JSON.stringify(defaultFocal.value) !== JSON.stringify(media!.defaultFocal)
  )
})
const nameError = computed(() => (name.value.trim() ? '' : t('cms.validation.required')))

watch([open, () => props.media?.id], () => {
  const media = props.media

  if (!open.value || !media) {
    return
  }

  name.value = media.name
  defaultAlt.value = media.defaultAlt
  defaultFocal.value = media.defaultFocal
  failure.value = ''
  notice.value = ''
  confirmingDelete.value = false
}, { immediate: true })

async function run(action: NonNullable<typeof busy.value>, task: () => Promise<void>) {
  busy.value = action
  failure.value = ''
  notice.value = ''

  try {
    await task()
  } catch (cause) {
    failure.value = cause instanceof MediaFileError
      ? t(`cms.media.problem.${cause.problem}`)
      : t(adminErrorKey(cause))
  } finally {
    busy.value = null
  }
}

function save() {
  const media = current.value

  if (!media || nameError.value) {
    return
  }

  void run('save', async () => {
    const next = await props.library.update(media.id, {
      name: name.value.trim(),
      defaultAlt: defaultAlt.value.trim(),
      defaultFocal: defaultFocal.value,
    })
    name.value = next.name
    defaultAlt.value = next.defaultAlt
    notice.value = t('cms.media.saved')
  })
}

function onReplaceFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const media = current.value
  input.value = ''

  if (!file || !media) {
    return
  }

  void run('replace', async () => {
    await props.library.replace(media.id, file)
    notice.value = t('cms.media.replaced')
  })
}

function remove() {
  const media = current.value

  if (!media) {
    return
  }

  void run('delete', async () => {
    await props.library.remove(media.id)
    open.value = false
  })
}
</script>

<template>
  <AdminDialog
    v-model:open="open"
    :title="current?.name ?? t('cms.media.title')"
    size="lg"
  >
    <div
      v-if="current"
      class="media-dialog"
    >
      <div class="media-dialog__preview">
        <AdminFocalPicker
          v-if="!isSvg"
          v-model="defaultFocal"
          :src="current.url"
          :label="t('cms.media.defaultFocal')"
          :disabled="!canEdit || busy !== null"
        />
        <img
          v-else
          class="media-dialog__svg"
          :src="current.url"
          alt=""
        >
        <dl class="media-dialog__facts">
          <div>
            <dt>{{ t('cms.media.type') }}</dt>
            <dd>{{ mediaTypeLabel(current.mime) }}</dd>
          </div>
          <div>
            <dt>{{ t('cms.media.size') }}</dt>
            <dd>{{ formatBytes(current.size, locale) }}</dd>
          </div>
          <div v-if="current.width && current.height">
            <dt>{{ t('cms.media.dimensions') }}</dt>
            <dd>{{ current.width }} × {{ current.height }}</dd>
          </div>
        </dl>
      </div>

      <div class="media-dialog__form">
        <AdminAlert
          v-if="failure"
          tone="danger"
          :title="failure"
        />
        <AdminAlert
          v-if="notice"
          tone="success"
          :title="notice"
          dismissible
          @dismiss="notice = ''"
        />

        <AdminInput
          v-model="name"
          :label="t('cms.media.name')"
          :error="nameError"
          :disabled="!canEdit || busy !== null"
          name="cms-media-name"
          required
        />
        <AdminInput
          v-model="defaultAlt"
          :label="t('cms.media.defaultAlt')"
          :hint="t('cms.media.defaultAltHint')"
          :disabled="!canEdit || busy !== null"
          name="cms-media-alt"
          multiline
        />

        <section class="media-dialog__usage">
          <h3>{{ t('cms.media.usedIn') }}</h3>
          <ul v-if="labels.length">
            <li
              v-for="label in labels"
              :key="label"
            >
              {{ label }}
            </li>
          </ul>
          <p
            v-else
            class="media-dialog__unused"
          >
            {{ t('cms.media.unusedLong') }}
          </p>
        </section>

        <AdminAlert
          v-if="confirmingDelete"
          tone="warning"
          :title="labels.length ? t('cms.media.deleteUsed', { count: labels.length }) : t('cms.media.deleteUnused')"
        >
          <template #action>
            <div class="media-dialog__confirm">
              <AdminButton
                variant="secondary"
                size="sm"
                data-cancel
                @click="confirmingDelete = false"
              >
                {{ t('cms.media.cancel') }}
              </AdminButton>
              <AdminButton
                variant="destructive"
                size="sm"
                :loading="busy === 'delete'"
                @click="remove"
              >
                {{ t('cms.media.deleteConfirm') }}
              </AdminButton>
            </div>
          </template>
        </AdminAlert>
      </div>
    </div>

    <template #footer>
      <AdminButton
        v-if="canDelete && !confirmingDelete"
        variant="ghost"
        size="sm"
        class="media-dialog__delete"
        :disabled="busy !== null"
        @click="confirmingDelete = true"
      >
        <template #leading>
          <Icon
            name="lucide:trash-2"
            aria-hidden="true"
          />
        </template>
        {{ t('cms.media.delete') }}
      </AdminButton>
      <span class="media-dialog__spacer" />
      <template v-if="canEdit">
        <AdminButton
          variant="secondary"
          size="sm"
          :loading="busy === 'replace'"
          :disabled="busy !== null && busy !== 'replace'"
          @click="fileInput?.click()"
        >
          <template #leading>
            <Icon
              name="lucide:replace"
              aria-hidden="true"
            />
          </template>
          {{ t('cms.media.replace') }}
        </AdminButton>
        <input
          ref="fileInput"
          type="file"
          :accept="MEDIA_ACCEPT"
          hidden
          @change="onReplaceFile"
        >
        <AdminButton
          variant="primary"
          size="sm"
          :loading="busy === 'save'"
          :disabled="!dirty || Boolean(nameError) || (busy !== null && busy !== 'save')"
          @click="save"
        >
          {{ t('cms.media.save') }}
        </AdminButton>
      </template>
    </template>
  </AdminDialog>
</template>

<style scoped>
.media-dialog {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--cms-space-6);
}

@media (width < 48rem) {
  .media-dialog {
    grid-template-columns: minmax(0, 1fr);
  }
}

.media-dialog__preview,
.media-dialog__form {
  display: flex;
  flex-direction: column;
  gap: var(--cms-space-4);
  min-width: 0;
}

.media-dialog__svg {
  display: block;
  max-width: 100%;
  max-height: 14rem;
  margin-inline: auto;
  padding: var(--cms-space-4);
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-md);
  background: var(--cms-surface-secondary);
}

.media-dialog__facts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cms-space-2) var(--cms-space-6);
  margin: 0;
}

.media-dialog__facts dt {
  color: var(--cms-text-tertiary);
  font-size: var(--cms-type-caption-size);
}

.media-dialog__facts dd {
  margin: 0;
  font-size: var(--cms-type-body-small-size);
}

.media-dialog__usage h3 {
  margin: 0 0 var(--cms-space-1);
  font-size: var(--cms-type-label-size);
  font-weight: var(--cms-type-label-weight);
}

.media-dialog__usage ul {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cms-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.media-dialog__usage li {
  padding: 0 var(--cms-space-2);
  border-radius: var(--cms-radius-sm);
  background: var(--cms-info-subtle);
  color: var(--cms-info-text);
  font-size: var(--cms-type-caption-size);
  line-height: var(--cms-type-caption-line);
}

.media-dialog__unused {
  margin: 0;
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
}

.media-dialog__confirm {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cms-space-2);
}

.media-dialog__spacer {
  flex: 1;
}

.media-dialog__delete {
  color: var(--cms-destructive-text);
}
</style>
