import type { SiteSettings } from '../types/settings'
import { createSettingsRepository } from '../data/repositories/settings.repository'

/**
 * Settings for the admin form.
 *
 * Reading still goes through the anonymous client. Saving uses the signed-in
 * client inside the repository, and only when `save` runs.
 */
export function useAdminSettings() {
  const request = import.meta.server ? useRequestEvent() : undefined
  const repository = createSettingsRepository(request)
  const query = useAsyncData('cms:site-settings', () => repository.get())

  async function save(next: SiteSettings): Promise<SiteSettings> {
    const saved = await repository.update(next)
    query.data.value = saved
    return saved
  }

  return {
    settings: query.data,
    error: query.error,
    save,
    ready: query,
  }
}
