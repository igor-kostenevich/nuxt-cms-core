import { cmsConfig } from '#cms/config'
import { cmsTexts } from '#cms/texts'
import { computed, type Ref } from 'vue'
import { useAsyncData, useRequestEvent } from '#imports'
import { createPagesRepository } from '../data/repositories/pages.repository'
import { createSiteTextsRepository } from '../data/repositories/site-texts.repository'
import { createTextsRepository } from '../data/repositories/texts.repository'
import { buildTextGroups, draftSummary, type DraftSummary, type PageTextRow } from './texts'
import { createWriteQueue } from './write-queue'

/** A page with a draft in the shown language, as the publish dialog lists it. */
export interface DraftPage {
  key: string
  editPath: string | null
  /** The draft version the dialog shows; publishing checks it did not change. */
  draftUpdatedAt: string
  summary: DraftSummary
}

/**
 * Data and actions of the Texts screen (C-86, C-89) for the language `locale`:
 * every registered page text and every site text, with the default language
 * as the original. Page texts — the original and translations alike — go
 * into the same draft Edit Mode saves; site texts are live at once.
 *
 * Writes run through a queue per text: a later change waits for the earlier
 * one, and publishing waits for all of them (`settle`).
 */
export function useAdminTexts(options: {
  locale: Ref<string>
  defaultLocale: Ref<string>
  textsTitle: (group: string) => string
}) {
  const { locale, defaultLocale } = options
  const request = import.meta.server ? useRequestEvent() : undefined
  const texts = createTextsRepository(request)
  const pages = createPagesRepository(request, { bootstrapLocale: cmsConfig.defaultLocale })
  const siteTexts = createSiteTextsRepository(request)
  const queue = createWriteQueue()

  const pagesQuery = useAsyncData('cms:admin-texts:pages', () => texts.listPages())
  const contentsQuery = useAsyncData(
    () => `cms:admin-texts:contents:${defaultLocale.value}:${locale.value}`,
    () => texts.listContents([...new Set([defaultLocale.value, locale.value])]),
  )
  const siteQuery = useAsyncData('cms:admin-texts:site', () => siteTexts.listAll())

  const groups = computed(() => buildTextGroups({
    pages: pagesQuery.data.value ?? [],
    contents: contentsQuery.data.value ?? [],
    siteTexts: siteQuery.data.value ?? [],
    codeTexts: cmsTexts,
    defaultLocale: defaultLocale.value,
    locale: locale.value,
    textsTitle: options.textsTitle,
  }))

  /** Pages with a draft in the shown language: what "Publish" can publish. */
  const draftPages = computed<DraftPage[]>(() => {
    const registered = pagesQuery.data.value ?? []

    return (contentsQuery.data.value ?? [])
      .filter(entry => entry.locale === locale.value && entry.draft !== null && entry.draftUpdatedAt !== null)
      .map((entry) => {
        const page = registered.find(item => item.key === entry.key)

        return {
          key: entry.key,
          editPath: page?.editPath ?? null,
          draftUpdatedAt: entry.draftUpdatedAt!,
          summary: draftSummary(entry.published, entry.draft, page?.fields ?? [], locale.value === defaultLocale.value),
        }
      })
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  })

  const error = computed(() => pagesQuery.error.value ?? contentsQuery.error.value ?? siteQuery.error.value)
  const ready: Promise<void> = Promise.all([pagesQuery, contentsQuery, siteQuery]).then(() => undefined)

  /**
   * Saves a page text into the draft of the shown language. Null: back to
   * the text from code (the original) or no translation (another language).
   */
  function savePageText(row: PageTextRow, value: string | null): Promise<void> {
    const targetLocale = locale.value

    return queue.run(row.id, async () => {
      await pages.setTexts(row.pageKey, targetLocale, { [row.leaf]: value })
      await contentsQuery.refresh()
    })
  }

  /** Saves a site text in the shown language, live at once; empty goes back to the fallback. */
  function saveSiteText(id: string, key: string, value: string): Promise<void> {
    const targetLocale = locale.value

    return queue.run(id, async () => {
      await siteTexts.set(key, targetLocale, value)
      await siteQuery.refresh()
    })
  }

  /**
   * Waits for every write in flight and reloads the drafts, so the publish
   * dialog lists what is really saved. False when a write failed.
   */
  async function settle(): Promise<boolean> {
    const ok = await queue.settle()
    await contentsQuery.refresh()
    return ok
  }

  /** Publishes the chosen pages; a page whose draft changed since is skipped. */
  async function publishPages(chosen: DraftPage[]) {
    const result = await pages.publishLanguage(
      locale.value,
      chosen.map(page => ({ key: page.key, draftUpdatedAt: page.draftUpdatedAt })),
    )
    await contentsQuery.refresh()
    return result
  }

  /** Whether a page is open in Edit Mode now: the dialog cannot publish it. */
  async function openInEditor(key: string): Promise<boolean> {
    const status = await pages.getLockStatus(key)
    return status !== null && !status.stale
  }

  return {
    groups,
    draftPages,
    error,
    ready,
    pending: queue.pending,
    savePageText,
    saveSiteText,
    settle,
    publishPages,
    openInEditor,
  }
}
