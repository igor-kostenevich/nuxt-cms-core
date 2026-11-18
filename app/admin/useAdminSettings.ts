import { useAsyncData, useRequestEvent } from '#imports'
import { useSiteSettings } from '../composables/useSiteSettings'
import { createSettingsRepository } from '../data/repositories/settings.repository'
import type { SiteBrandForm, SiteSettings, SiteSettingsForm, SiteSettingsTranslation } from '../types/settings'

/**
 * Settings for the admin form: the public settings state plus `save`.
 *
 * Reading reuses useSiteSettings(), so both share one `cms:site-settings:<locale>`
 * entry (the admin reads the default locale). Saving uses the signed-in client
 * inside the repository, and only when `save` runs.
 */
export function useAdminSettings() {
  const request = import.meta.server ? useRequestEvent() : undefined
  const repository = createSettingsRepository(request)
  const { settings, error, ready } = useSiteSettings()
  // Texts in the other languages (C-82); loaded once, kept by the form.
  const translationsQuery = useAsyncData('cms:admin-settings-translations', () => repository.listTranslations())

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

  /** Writes the texts of the languages whose value changed. */
  async function saveTranslations(next: SiteSettingsTranslation[]): Promise<void> {
    const stored = translationsQuery.data.value ?? []
    const changed = next.filter(item =>
      (stored.find(entry => entry.locale === item.locale)?.siteName ?? '') !== item.siteName.trim())

    for (const item of changed) {
      await repository.updateTranslation(item)
    }

    if (changed.length > 0) {
      await translationsQuery.refresh()
    }
  }

  return {
    settings,
    error,
    ready: Promise.all([ready, translationsQuery]).then(() => undefined),
    translations: translationsQuery.data,
    save,
    saveBrand,
    saveTranslations,
  }
}
