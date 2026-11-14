import type { CmsPage, CmsPageContent } from '../../types/pages'
import type { Json } from '../database.types'
import { CmsDataError } from '../errors'
import { getSupabaseClient, toCmsDataError } from '../supabase'

const TABLE = 'cms_page_published'
// The inner join filters by page key in the same request: one round trip per page.
const COLUMNS = 'locale, content, published_at, page:cms_pages!inner(key)'

function selectPublished() {
  return getSupabaseClient().from(TABLE).select(COLUMNS)
}

/**
 * Row shape inferred from the generated Database types, so a renamed column
 * or a typo in COLUMNS fails typecheck. snake_case stays inside the data layer.
 */
type PublishedPageRow = NonNullable<Awaited<ReturnType<typeof selectPublished>>['data']>[number]

function isContent(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toCmsPage(row: PublishedPageRow): CmsPage {
  // The table has a check constraint for this. The guard keeps a schema drift
  // from reaching templates as an array or a string.
  if (!isContent(row.content)) {
    throw new CmsDataError('unknown', 'Published page content is not an object.')
  }

  return {
    key: row.page.key,
    locale: row.locale,
    content: row.content as CmsPageContent,
    publishedAt: row.published_at,
  }
}

export function createPagesRepository() {
  /**
   * Reads the published content of a page in one locale.
   * Returns null when the page has no published content yet: a code-defined
   * page then renders its defaults (MASTER_PLAN C-42).
   */
  async function getByKey(key: string, locale: string): Promise<CmsPage | null> {
    const { data, error } = await selectPublished()
      .eq('page.key', key)
      .eq('locale', locale)
      .maybeSingle()

    if (error) {
      throw toCmsDataError(error, `Failed to load page "${key}"`)
    }

    return data ? toCmsPage(data) : null
  }

  return { getByKey }
}
