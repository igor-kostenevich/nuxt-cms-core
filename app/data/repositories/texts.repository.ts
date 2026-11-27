import type { H3Event } from 'h3'
import type { CmsPageContent } from '../../types/pages'
import { toCmsDataError } from '../supabase'

/** A translatable field of a page as Edit Mode registered it (C-84). */
export interface RegisteredField {
  address: string
  kind: string
  label: string | null
  defaultText: string | null
  /** Block of the page (its heading), for grouping. */
  section: string | null
  /** Order on the page. */
  position: number | null
  /** Element of the field, e.g. `h2`. */
  tag: string | null
  /** Number of the collection item the field is in (1-based). */
  item: number | null
}

export interface RegisteredPage {
  key: string
  /** Site path the page was opened at in Edit Mode, for links back to it. */
  editPath: string | null
  fields: RegisteredField[]
}

/** Stored content of a page in one locale: draft and published, either may be missing. */
export interface PageContents {
  key: string
  locale: string
  draft: CmsPageContent | null
  /**
   * When the draft was saved, exactly as the database returned it: the
   * version marker for publishing (a Date would drop the microseconds).
   */
  draftUpdatedAt: string | null
  published: CmsPageContent | null
}

interface PageRow {
  key: string
  edit_path: string | null
  /** Fields belong to the document (014): page → document → fields. */
  document: { fields: {
    address: string
    kind: string
    label: string | null
    default_text: string | null
    section: string | null
    position: number | null
    tag: string | null
    item: number | null
  }[] | null } | null
}

interface ContentRow {
  locale: string
  content: CmsPageContent
  /** The document's page; null for a document of another kind (an entry, 014). */
  document: { page: { key: string } | null } | null
}

interface DraftRow extends ContentRow {
  updated_at: string
}

async function getAuthClient(request?: H3Event) {
  const { getSupabaseAuthClient } = await import('../supabase-auth')
  return getSupabaseAuthClient(request)
}

/**
 * Reads for the Texts screen (C-86): the field registry and the stored
 * content of pages in the languages shown. Writes go through
 * PagesRepository.setTexts and the site texts repository.
 */
export function createTextsRepository(request?: H3Event) {
  /** Pages Edit Mode has registered, with their translatable fields. */
  async function listPages(): Promise<RegisteredPage[]> {
    const { data, error } = await (await getAuthClient(request))
      .from('cms_pages')
      .select('key, edit_path, document:cms_documents!inner(fields:cms_page_fields(address, kind, label, default_text, section, position, tag, item))')
      .order('key')
      .returns<PageRow[]>()

    if (error) {
      throw toCmsDataError(error, 'Failed to load the texts of pages')
    }

    return data
      .filter(row => (row.document?.fields?.length ?? 0) > 0)
      .map(row => ({
        key: row.key,
        editPath: row.edit_path,
        fields: (row.document?.fields ?? [])
          .map(field => ({
            address: field.address,
            kind: field.kind,
            label: field.label,
            defaultText: field.default_text,
            section: field.section,
            position: field.position,
            tag: field.tag,
            item: field.item,
          }))
          // As on the page; fields registered before positions existed go last.
          .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER)
            || (a.address < b.address ? -1 : a.address > b.address ? 1 : 0)),
      }))
  }

  /** Draft and published content of every page in the given locales. */
  async function listContents(locales: string[]): Promise<PageContents[]> {
    const client = await getAuthClient(request)
    const columns = 'locale, content, document:cms_documents!inner(page:cms_pages!inner(key))'
    const [drafts, published] = await Promise.all([
      client.from('cms_page_draft').select(`${columns}, updated_at`).in('locale', locales).returns<DraftRow[]>(),
      client.from('cms_page_published').select(columns).in('locale', locales).returns<ContentRow[]>(),
    ])

    for (const result of [drafts, published]) {
      if (result.error) {
        throw toCmsDataError(result.error, 'Failed to load the texts of pages')
      }
    }

    const byKey = new Map<string, PageContents>()
    const entry = (key: string, locale: string) => {
      const id = `${key}\u0000${locale}`
      let found = byKey.get(id)

      if (!found) {
        found = { key, locale, draft: null, draftUpdatedAt: null, published: null }
        byKey.set(id, found)
      }

      return found
    }

    for (const row of drafts.data ?? []) {
      const page = row.document?.page

      if (page) {
        const found = entry(page.key, row.locale)
        found.draft = row.content
        found.draftUpdatedAt = row.updated_at
      }
    }

    for (const row of published.data ?? []) {
      const page = row.document?.page

      if (page) {
        entry(page.key, row.locale).published = row.content
      }
    }

    return [...byKey.values()]
  }

  return { listPages, listContents }
}
