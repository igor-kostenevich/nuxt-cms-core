import { useRequestEvent } from '#imports'
import { useSiteSettings } from '../composables/useSiteSettings'
import { createSettingsRepository } from '../data/repositories/settings.repository'
import type { SiteBrandForm, SiteSettings, SiteSettingsForm } from '../types/settings'

/**
 * Settings for the admin form: the public settings state plus `save`.
 *
 * Reading reuses useSiteSettings(), so both share one `cms:site-settings`
 * entry. Saving uses the signed-in client inside the repository, and only when
 * `save` runs.
 */
export function useAdminSettings() {
  const request = import.meta.server ? useRequestEvent() : undefined
  const repository = createSettingsRepository(request)
  const { settings, error, ready } = useSiteSettings()

  async function save(next: SiteSettingsForm): Promise<SiteSettings> {
    const saved = await repository.update(next)
    settings.value = saved
    return saved
  }

  async function saveBrand(next: SiteBrandForm): Promise<SiteSettings> {
    const saved = await repository.updateBrand(next)
    settings.value = saved
    return saved
  }

  return { settings, error, ready, save, saveBrand }
}
