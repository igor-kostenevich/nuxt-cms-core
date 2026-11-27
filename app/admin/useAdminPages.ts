import { shallowRef } from 'vue'
import { cmsConfig } from '#cms/config'
import { cmsContent } from '#cms/content'
import { createEntriesRepository } from '../data/repositories/entries.repository'
import { createPagesRepository } from '../data/repositories/pages.repository'
import type { CmsContentLabel } from '../../src/content'

/** Status of a page or entry in the Pages screens. `none`: never edited (no row, C-42). */
export type AdminDocumentStatus = 'none' | 'draft' | 'published' | 'changed'

export interface AdminPageRow {
  key: string
  /** The declared name (shown in the admin's language); null: a page only the database knows. */
  label: CmsContentLabel | null
  /** Site path without a language prefix; null for a page never opened in Edit Mode. */
  path: string | null
  status: AdminDocumentStatus
  updatedAt: string | null
  /** Declared in cms.content.ts (else only known from the database). */
  declared: boolean
}

export interface AdminTypeRow {
  key: string
  /** The declared type: its names are shown in the admin's language at render. */
  type: (typeof cmsContent.types)[number]
  total: number
  updatedAt: string | null
}

type RoutedType = (typeof cmsContent.types)[number] & { route: string }

/** Types of the Pages section: the ones with a route. */
export function pageTypes(): RoutedType[] {
  return cmsContent.types.filter((type): type is RoutedType => type.section === 'pages' && type.route !== null)
}

/**
 * The types of a section as their screens list them: name, create button,
 * how many entries and when one last changed (one list call per type).
 */
export async function typeSummaries(section: 'pages' | 'content'): Promise<AdminTypeRow[]> {
  const repository = createEntriesRepository(undefined, { bootstrapLocale: cmsConfig.defaultLocale })
  const types = cmsContent.types.filter(type => type.section === section)

  return Promise.all(types.map(async (type) => {
    // Every entry, taken off the site too: the count is the length of the list it opens.
    const list = await repository.list(type.key, { sort: 'updated', limit: 1, archived: null })
    return {
      key: type.key,
      type,
      total: list.total,
      updatedAt: list.items[0]?.updatedAt ?? null,
    }
  }))
}

export function pageStatus(row: { published: boolean, hasDraft: boolean } | undefined): AdminDocumentStatus {
  if (!row || (!row.published && !row.hasDraft)) {
    return 'none'
  }

  return row.published ? (row.hasDraft ? 'changed' : 'published') : 'draft'
}

/**
 * The Pages screen (014 §8): static pages (declared in cms.content.ts and the
 * ones the database knows) and the types with a route. Browser only.
 */
export function useAdminPages() {
  const pagesRepository = createPagesRepository(undefined, { bootstrapLocale: cmsConfig.defaultLocale })
  const pages = shallowRef<AdminPageRow[]>([])
  const types = shallowRef<AdminTypeRow[]>([])
  const loading = shallowRef(true)
  const error = shallowRef<unknown>(null)

  async function load() {
    loading.value = true
    error.value = null

    try {
      const [known, summaries] = await Promise.all([
        pagesRepository.listForAdmin(),
        typeSummaries('pages'),
      ])

      const byKey = new Map(known.map(row => [row.key, row]))
      const declared: AdminPageRow[] = cmsContent.pages.map((page) => {
        const row = byKey.get(page.key)
        return {
          key: page.key,
          label: page.label,
          path: page.path,
          status: pageStatus(row),
          updatedAt: row?.updatedAt ?? null,
          declared: true,
        }
      })
      // Pages the database knows but cms.content.ts does not declare: shown by
      // where they were opened (backward compatible, 014 §3).
      const extra: AdminPageRow[] = known
        .filter(row => !cmsContent.pages.some(page => page.key === row.key))
        .map(row => ({
          key: row.key,
          label: null,
          path: row.editPath,
          status: pageStatus(row),
          updatedAt: row.updatedAt,
          declared: false,
        }))

      pages.value = [...declared, ...extra]
      types.value = summaries
    } catch (cause) {
      error.value = cause
    } finally {
      loading.value = false
    }
  }

  return { pages, types, loading, error, load }
}
