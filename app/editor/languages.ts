import { computed } from 'vue'
import { useAsyncData } from '#imports'
import { createLanguagesRepository } from '../data/repositories/languages.repository'

/**
 * Languages the editor can switch to: the active ones and the hidden ones,
 * which are being translated and not shown on the site yet (C-83). Read with
 * the session client: RLS shows hidden languages to `pages.edit` only.
 */
export function useEditorLanguages() {
  const repository = createLanguagesRepository()
  const query = useAsyncData('cms:editor-languages', () => repository.listAll())
  const languages = computed(() => query.data.value ?? [])

  return {
    languages,
    /** More than one language, hidden ones included: there is something to switch to. */
    multilingual: computed(() => languages.value.length > 1),
    refresh: query.refresh,
  }
}
