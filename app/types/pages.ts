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
}
