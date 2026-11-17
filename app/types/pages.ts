import type { CmsMediaMap } from './media'

/**
 * Content values of one page in one locale.
 *
 * The page structure lives in the Client Project's Vue code, so Core does not
 * parse the document. It is nested, and a field is addressed by its dotted
 * path, e.g. `hero.title` (MASTER_PLAN C-48).
 */
export type CmsPageContent = Record<string, unknown>

/** Published content of a code-defined page, as the public site reads it. */
export interface CmsPage {
  /** Stable identifier of the page in code, e.g. `home`. Not a URL. */
  key: string
  locale: string
  content: CmsPageContent
  /** ISO timestamp of the publication. */
  publishedAt: string
  /** Media the content references by id (MASTER_PLAN C-76). Deleted media is absent. */
  media: CmsMediaMap
}

/**
 * Unpublished changes of a page in one locale. Exists only while there is
 * something to publish: Publish removes it, and so does saving content equal
 * to the published version.
 */
export interface CmsPageDraft {
  key: string
  locale: string
  content: CmsPageContent
  /** ISO timestamp of the last Save Draft. */
  updatedAt: string
  /** Media the content references by id. */
  media: CmsMediaMap
}

/** One publication of a page: the content that went live at `createdAt`. */
export interface CmsPageRevision {
  id: string
  locale: string
  /** ISO timestamp of the publication. */
  createdAt: string
}

/** Who holds the Content Lock of a page. The token itself never leaves the server. */
export interface CmsPageLockStatus {
  holderEmail: string | null
  acquiredAt: string
  heartbeatAt: string
  /** The lock belongs to the current user (this or another tab). */
  mine: boolean
  /** Past its TTL without a heartbeat: another session may take it. */
  stale: boolean
}
