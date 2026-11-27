import { cmsConfig } from '#cms/config'
import { CmsDataError } from '../data/errors'
import { createEntriesRepository } from '../data/repositories/entries.repository'
import type { CmsEntryListQuery } from '../types/entries'
import type { CmsPageEditable } from '../types/pages'

/**
 * What Edit Mode reads about entries (014), besides the document it edits:
 * opening an entry of a type with a route (§5), whether an address is free
 * (§6), and the entries a section can choose (§7).
 */
export function useEditorEntries() {
  const repository = createEntriesRepository(undefined, { bootstrapLocale: cmsConfig.defaultLocale })

  return {
    /** A link of the site: published addresses only (drafts are not unique yet). */
    findBySlug: (type: string, locale: string | null, slug: string) => repository.findBySlug(type, locale, slug),

    /** The editable state; null when not found or not allowed (nothing to edit). Other failures throw. */
    async editable(type: string, id: string, locale: string | null): Promise<CmsPageEditable | null> {
      try {
        return await repository.getEditable(type, id, locale)
      } catch (error) {
        if (error instanceof CmsDataError && (error.code === 'not_found' || error.code === 'permission_denied')) {
          return null
        }

        throw error
      }
    },

    /** Whether an address is free in a language for this entry. */
    checkSlug: (type: string, id: string, locale: string, slug: string) => repository.checkSlug(type, id, locale, slug),

    /** State of chosen entries (archived, published languages); missing ids are left out. */
    status: (ids: string[]) => repository.status(ids),

    /** Entries of a type for a picker (the admin list: drafts too, no archive). */
    list: (type: string, query: CmsEntryListQuery) => repository.list(type, query),
  }
}
