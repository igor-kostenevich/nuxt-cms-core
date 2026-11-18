import { cmsConfig } from '#cms/config'
import { computed } from 'vue'
import { useAsyncData } from '#imports'
import { createLanguagesRepository } from '../data/repositories/languages.repository'
import type { CmsLanguage } from '../types/languages'

/**
 * Active languages of the site content, in switcher order, for the Client's
 * routing, language switcher and hreflang. Languages live in the database,
 * so adding one needs no deploy (MASTER_PLAN C-15).
 *
 * Until the first language is added, the site has one language: the
 * `defaultLocale` of cms.config.ts. `multilingual` is true with more than one
 * active language (C-81).
 */
export function useCmsLanguages() {
  const repository = createLanguagesRepository()
  const query = useAsyncData('cms:languages', () => repository.listActive())
  const { data, pending, error, refresh } = query

  const languages = computed<CmsLanguage[]>(() => {
    const list = data.value ?? []

    return list.length > 0
      ? list
      : [{ code: cmsConfig.defaultLocale, name: cmsConfig.defaultLocale, nativeName: cmsConfig.defaultLocale, active: true, isDefault: true }]
  })
  const defaultLocale = computed(() => languages.value.find(language => language.isDefault)?.code ?? cmsConfig.defaultLocale)
  const multilingual = computed(() => languages.value.length > 1)
  const ready: Promise<void> = Promise.resolve(query).then(() => undefined)

  return { languages, defaultLocale, multilingual, pending, error, refresh, ready }
}
