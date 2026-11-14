import { useAsyncData } from '#imports'
import { createSettingsRepository } from '../data/repositories/settings.repository'

/**
 * Reactive access to the global site settings.
 *
 * The composable owns Vue state only; loading the data is the repository's job.
 * Caching is left to Nuxt's useAsyncData instead of a CMS-specific cache layer.
 * Await `ready` when the page needs the value before it renders.
 */
export function useSiteSettings() {
  const repository = createSettingsRepository()
  const query = useAsyncData('cms:site-settings', () => repository.get())
  const { data: settings, pending, error, refresh } = query
  const ready: Promise<void> = Promise.resolve(query).then(() => undefined)

  return { settings, pending, error, refresh, ready }
}
