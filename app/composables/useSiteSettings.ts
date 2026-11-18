import { useAsyncData } from '#imports'
import { createSettingsRepository } from '../data/repositories/settings.repository'
import { useCmsLocaleState } from '../primitives/locale'

/**
 * Reactive access to the global site settings, with the texts of the current
 * locale (`useCmsLocale()`). A text without a translation shows the default
 * locale.
 *
 * The composable owns Vue state only; loading the data is the repository's job.
 * Caching is left to Nuxt's useAsyncData instead of a CMS-specific cache layer.
 * Await `ready` when the page needs the value before it renders.
 */
export function useSiteSettings() {
  const repository = createSettingsRepository()
  const locale = useCmsLocaleState()
  const query = useAsyncData(
    () => `cms:site-settings:${locale.value ?? ''}`,
    // The default locale has no translation row: it reads the record as is.
    () => repository.get(locale.value),
  )
  const { data: settings, pending, error, refresh } = query
  const ready: Promise<void> = Promise.resolve(query).then(() => undefined)

  return { settings, pending, error, refresh, ready }
}
