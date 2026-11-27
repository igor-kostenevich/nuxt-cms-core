import type { CmsMediaMap } from './media'
import type { CmsPageContent } from './pages'

/**
 * Standalone entries (014): records of types the Client Project declares in
 * cms.content.ts. Their content, drafts, revisions and lock are those of any
 * document (types/pages.ts); these are the entry-only shapes.
 */

/** Admin status: never published, published, published with pending changes, archived. */
export type CmsEntryStatus = 'draft' | 'published' | 'changed' | 'archived'

/** Sort of the admin list. `manual` is the order Content keeps by drag and drop. */
export type CmsEntrySort = 'manual' | 'newest' | 'title' | 'updated'

/** One row of the admin list of a type. Title and slug: the draft of the original, else its publication. */
export interface CmsEntryListItem {
  id: string
  title: string | null
  slug: string | null
  status: CmsEntryStatus
  updatedAt: string | null
  publishedAt: string | null
  firstPublishedAt: string | null
  archivedAt: string | null
  sortOrder: number
}

export interface CmsEntryList {
  items: CmsEntryListItem[]
  /** Every match, not only this page. */
  total: number
  /** Version of the manual order, for the next reorder (014 §8.1). */
  orderVersion: string | null
}

export interface CmsEntryListQuery {
  search?: string
  /** True lists the archive only; false (default) leaves it out; null lists both. */
  archived?: boolean | null
  /** Only entries with one of these statuses; none or empty: every status. */
  statuses?: readonly CmsEntryStatus[]
  sort?: CmsEntrySort
  limit?: number
  offset?: number
}

/** What a create returns. `lockToken` only when the lock was asked for (Content). */
export interface CmsEntryCreated {
  id: string
  draftUpdatedAt: string | null
  lockToken: string | null
}

/** State of a chosen entry, for explanations in Edit Mode (014 §7). */
export interface CmsEntryState {
  id: string
  type: string
  title: string | null
  archived: boolean
  publishedLocales: string[]
}

/** Whether an address is free (014 §6). `taken` names the holder. */
export type CmsEntrySlugCheck =
  | { status: 'ok' }
  | { status: 'invalid' }
  | { status: 'taken', holderTitle: string | null, holderArchived: boolean }

/**
 * A published entry as the site shows it (014 stage 3): the original with the
 * translation of `locale` applied (C-78) and the media it references (C-76).
 */
export interface CmsEntry {
  id: string
  type: string
  locale: string
  defaultLocale: string
  content: CmsPageContent
  /** Publication of the shown language (the translation, else the original). */
  publishedAt: string
  /** First publication in the original: the date of a post. */
  firstPublishedAt: string | null
  media: CmsMediaMap
  /** The content is in `locale`: the original, or a published translation. */
  translated: boolean
  /** Effective address in `locale`. */
  slug: string | null
  /** Effective address per active language (language links, hreflang); only on a single entry read. */
  slugs: Record<string, string>
}

/**
 * What a list of entries reads: a page of the type (Automatic), or chosen ids
 * in their order (Manual).
 */
export type CmsEntriesQuery =
  | { ids: string[] }
  | { ids?: undefined, limit?: number, offset?: number, sort?: 'newest' | 'manual' | 'title' }

/** Stored value of a section of entries (014 §7). No value: the default from code. */
export type CmsEntrySelectionValue =
  | { mode: 'automatic', limit?: number }
  | { mode: 'manual', ids: string[] }
