import type { CmsMediaMap } from './media'

/**
 * Content values of one page in one locale.
 *
 * The page structure lives in the Client Project's Vue code, so Core does not
 * parse the document. It is nested, and a field is addressed by its dotted
 * path, e.g. `hero.title` (MASTER_PLAN C-48). For a locale other than the
 * default, the stored document is a translation (`CmsTranslation`); a read
 * returns it already applied to the default locale (C-78).
 */
export type CmsPageContent = Record<string, unknown>

/** Published content of a code-defined page, as the public site reads it. */
export interface CmsPage {
  /** Stable identifier of the page in code, e.g. `home`. Not a URL. */
  key: string
  /** The locale that was requested. */
  locale: string
  /** Content of `locale`; untranslated fields show the default locale (C-78). */
  content: CmsPageContent
  /** ISO timestamp of the publication: of the translation when there is one. */
  publishedAt: string
  /** Media the content references by id (MASTER_PLAN C-76). Deleted media is absent. */
  media: CmsMediaMap
  /** Default locale of the site. */
  defaultLocale: string
  /**
   * `locale` is the default locale or has a published translation. False: the
   * content is the default locale's; whether to show it, redirect or return
   * 404 is up to the Client Project.
   */
  translated: boolean
  /** Active locales the page is published in, for hreflang / language switchers. */
  locales: string[]
}

/**
 * What Edit Mode loads for one locale. `base` is set for a translation: the
 * content of the default locale (Draft ?? Published) it applies to.
 */
export interface CmsPageEditable {
  key: string
  locale: string
  defaultLocale: string
  base: CmsPageContent | null
  draft: CmsPageContent | null
  draftUpdatedAt: string | null
  published: CmsPageContent | null
  publishedAt: string | null
  media: CmsMediaMap
  /** An entry taken off the site: shown as a draft; Publish puts it back, with or without a pending draft. */
  offSite?: boolean
  /** An entry: its original is published (in a translation the editor cannot tell it from `publishedAt`). */
  basePublished?: boolean
}

/** State of a page in one locale, derived from the stored rows. */
export interface CmsPageLocaleState {
  locale: string
  hasDraft: boolean
  /** ISO timestamp, or null when the locale is not published. */
  publishedAt: string | null
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
