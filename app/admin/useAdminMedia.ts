import { reactive, ref, shallowRef, watch } from 'vue'
import { usePermissions } from '../composables/usePermissions'
import { createMediaRepository, type CmsMediaPatch } from '../data/repositories/media.repository'
import type { CmsMedia, CmsMediaQuery, CmsMediaUsage } from '../types/media'
import { adminErrorKey } from './error-key'
import { MediaFileError, prepareMediaUpload } from './media/files'
import { useAdminI18n } from './useAdminI18n'

/** Search waits for a pause in typing. */
const SEARCH_DELAY = 250

/** A file on its way into the library, shown as a card until it lands. */
export interface PendingUpload {
  key: string
  name: string
  /** Translated reason when it failed; the card then offers to dismiss it. */
  error: string | null
}

/**
 * The media library for the admin page and the Media Picker: the list with
 * its filters, usage, uploads and edits. Loads in the browser only (`load`),
 * so the admin page renders its shell at once.
 *
 * Imported explicitly, not an auto-import (MASTER_PLAN C-40).
 */
export function useAdminMedia() {
  const repository = createMediaRepository()
  const { t } = useAdminI18n()
  const { can } = usePermissions()

  const query = reactive<Required<CmsMediaQuery>>({ search: '', type: 'all', sort: 'newest' })
  const items = shallowRef<CmsMedia[]>([])
  const usage = shallowRef(new Map<string, CmsMediaUsage[]>())
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const error = shallowRef<unknown>(null)
  const uploads = ref<PendingUpload[]>([])
  let request = 0
  let nextUpload = 1

  async function load() {
    const current = ++request
    status.value = status.value === 'ready' ? 'ready' : 'loading'
    error.value = null

    try {
      const [list, used] = await Promise.all([repository.list({ ...query }), repository.getUsage()])

      // A newer filter started meanwhile: its result wins.
      if (current !== request) {
        return
      }

      items.value = list
      usage.value = used
      status.value = 'ready'
    } catch (cause) {
      if (current === request) {
        error.value = cause
        status.value = 'error'
      }
    }
  }

  let searchTimer: ReturnType<typeof setTimeout> | undefined

  watch(() => query.search, () => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(load, SEARCH_DELAY)
  })
  watch(() => [query.type, query.sort], () => load())

  function usageOf(id: string): CmsMediaUsage[] {
    return usage.value.get(id) ?? []
  }

  function put(media: CmsMedia) {
    const index = items.value.findIndex(item => item.id === media.id)
    items.value = index === -1
      ? [media, ...items.value]
      : items.value.map(item => (item.id === media.id ? media : item))
  }

  /**
   * Uploads files one by one; each shows as a pending card until it lands.
   * Resolves with the media that were added and the translated reasons of
   * the files that were not.
   */
  async function upload(files: File[]): Promise<{ added: CmsMedia[], errors: string[] }> {
    const added: CmsMedia[] = []
    const errors: string[] = []

    for (const file of files) {
      const pending: PendingUpload = { key: `upload-${nextUpload++}`, name: file.name, error: null }
      uploads.value = [...uploads.value, pending]

      try {
        const prepared = await prepareMediaUpload(file)

        if (typeof prepared === 'string') {
          errors.push(t(`cms.media.problem.${prepared}`))
          setUploadError(pending.key, errors.at(-1)!)
          continue
        }

        const media = await repository.upload(prepared)
        added.push(media)
        put(media)
        dismissUpload(pending.key)
      } catch (cause) {
        errors.push(t(adminErrorKey(cause)))
        setUploadError(pending.key, errors.at(-1)!)
      }
    }

    return { added, errors }
  }

  function setUploadError(key: string, message: string) {
    uploads.value = uploads.value.map(item => (item.key === key ? { ...item, error: message } : item))
  }

  function dismissUpload(key: string) {
    uploads.value = uploads.value.filter(item => item.key !== key)
  }

  async function update(id: string, patch: CmsMediaPatch): Promise<CmsMedia> {
    const media = await repository.update(id, patch)
    put(media)
    return media
  }

  /** New file under the same id. Throws MediaFileError for a file the library refuses. */
  async function replace(id: string, file: File): Promise<CmsMedia> {
    const prepared = await prepareMediaUpload(file)

    if (typeof prepared === 'string') {
      throw new MediaFileError(prepared)
    }

    const media = await repository.replace(id, prepared)
    put(media)
    return media
  }

  async function remove(id: string): Promise<void> {
    await repository.remove(id)
    items.value = items.value.filter(item => item.id !== id)
  }

  return {
    query,
    items,
    status,
    error,
    uploads,
    canUpload: () => can('media.upload'),
    canEdit: () => can('media.edit'),
    canDelete: () => can('media.delete'),
    load,
    usageOf,
    upload,
    dismissUpload,
    update,
    replace,
    remove,
  }
}

export type AdminMedia = ReturnType<typeof useAdminMedia>
