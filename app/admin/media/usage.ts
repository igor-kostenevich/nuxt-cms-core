import type { CmsMediaUsage } from '../../types/media'

type Translate = (key: string, params?: Record<string, string | number>) => string

/**
 * One label per place, for the "Used in" badges: a page key (marked when
 * only its draft uses the media), or a Brand slot. Field-level labels live in
 * the Client's code, so the page is as precise as the library gets.
 */
export function usageLabels(usage: CmsMediaUsage[], t: Translate): string[] {
  const pages = new Map<string, boolean>()
  const brand: string[] = []

  for (const item of usage) {
    if (item.kind === 'brand') {
      brand.push(t(`cms.media.usage.${item.slot}`))
      continue
    }

    // Published wins: a page that is live with the image is not "draft only".
    pages.set(item.pageKey, (pages.get(item.pageKey) ?? true) && item.draft)
  }

  const labels = [...pages].map(([page, draftOnly]) => (draftOnly
    ? t('cms.media.usage.draft', { page })
    : page))

  return [...labels, ...brand]
}
