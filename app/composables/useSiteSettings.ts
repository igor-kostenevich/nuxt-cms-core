import { useAsyncData } from '#imports'
import { createSettingsRepository } from '../data/repositories/settings.repository'

/**
 * Reactive access to the global site settings.
 *
 * The composable owns Vue state only; loading the data is the repository's job.
 * Caching is left to Nuxt's useAsyncData instead of a CMS-specific cache layer.
 */
export function useSiteSettings() {
  const repository = createSettingsRepository()

  const { data: settings, pending, error, refresh } = useAsyncData(
    'cms:site-settings',
    () => repository.get(),
  )

  return { settings, pending, error, refresh }
}
