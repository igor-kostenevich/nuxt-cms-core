import { cmsConfig } from '#cms/config'
import { computed } from 'vue'
import { useAsyncData, useRequestEvent } from '#imports'
import { useCmsLanguages } from '../composables/useCmsLanguages'
import { createLanguagesRepository } from '../data/repositories/languages.repository'
import type { CmsLanguage, CmsLanguageInput } from '../types/languages'
import { languageInput } from './languages'

/**
 * Settings → Languages: every language, disabled ones included, and the
 * actions on them. Each action is one database call and reloads the list;
 * the public `cms:languages` state is refreshed too, so the editor and the
 * site see the change without a reload.
 *
 * While no language is stored, the list shows the bootstrap language from
 * cms.config.ts. Adding the first other language stores it first, as the
 * default: it is the language the existing content is in.
 */
export function useAdminLanguages() {
  const request = import.meta.server ? useRequestEvent() : undefined
  const repository = createLanguagesRepository(request)
  const publicLanguages = useCmsLanguages()
  const query = useAsyncData('cms:admin-languages', () => repository.listAll())

  const stored = computed(() => query.data.value ?? [])
  const bootstrap = computed<CmsLanguage>(() => ({
    ...languageInput(cmsConfig.defaultLocale),
    active: true,
    isDefault: true,
  }))
  const languages = computed<CmsLanguage[]>(() => stored.value.length > 0 ? stored.value : [bootstrap.value])
  const active = computed(() => languages.value.filter(language => language.active))
  const defaultLanguage = computed(() => languages.value.find(language => language.isDefault) ?? bootstrap.value)
  const ready: Promise<void> = Promise.resolve(query).then(() => undefined)

  async function reload() {
    await Promise.all([query.refresh(), publicLanguages.refresh()])
  }

  async function add(language: CmsLanguageInput) {
    if (stored.value.length === 0) {
      await repository.add(bootstrap.value, { makeDefault: true })
    }

    try {
      await repository.add(language)
    } finally {
      await reload()
    }
  }

  async function setActive(code: string, value: boolean) {
    try {
      await repository.setActive(code, value)
    } finally {
      await reload()
    }
  }

  /** Moves a language to `index` in the switcher order (drag, or Up / Down in its menu). */
  async function moveTo(code: string, index: number) {
    const codes = languages.value.map(language => language.code)
    const from = codes.indexOf(code)
    const to = Math.max(0, Math.min(codes.length - 1, index))

    if (from < 0 || from === to) {
      return false
    }

    codes.splice(to, 0, codes.splice(from, 1)[0]!)

    try {
      await repository.reorder(codes)
    } finally {
      await reload()
    }

    return true
  }

  async function remove(code: string) {
    try {
      await repository.remove(code)
    } finally {
      await reload()
    }
  }

  return {
    languages,
    active,
    defaultLanguage,
    /** No language is stored yet: the list shows the one from cms.config.ts. */
    bootstrapping: computed(() => stored.value.length === 0),
    error: query.error,
    ready,
    add,
    setActive,
    moveTo,
    remove,
  }
}
