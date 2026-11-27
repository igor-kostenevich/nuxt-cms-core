import type { CmsMediaUsage } from '../../types/media'

type Translate = (key: string, params?: Record<string, string | number>) => string

/** A type of cms.content.ts as the library shows it: its name, and its route (Pages) or none (Content). */
export interface UsageEntryType {
  label: string
  route: string | null
}

export interface UsagePlace {
  label: string
  /** The editor of the entry (014); null for pages and Brand, and for a type no longer declared. */
  link: string | null
}

/**
 * One place per page, entry or Brand slot, for the "Used in" list: a page key,
 * an entry as "<type> · «title»" (014; marked when only a draft uses the
 * media), or a Brand slot. Field-level labels live in the Client's code, so the
 * page or entry is as precise as the library gets. An entry links to its
 * editor: Edit Mode for a type of Pages, its dialog for a type of Content.
 */
export function usagePlaces(usage: CmsMediaUsage[], t: Translate, typeOf: (type: string) => UsageEntryType | null = () => null): UsagePlace[] {
  const pages = new Map<string, boolean>()
  const entries = new Map<string, { label: string, link: string | null, draftOnly: boolean }>()
  const brand: string[] = []

  for (const item of usage) {
    if (item.kind === 'brand') {
      brand.push(t(`cms.media.usage.${item.slot}`))
      continue
    }

    if (item.kind === 'entry') {
      const type = typeOf(item.type)
      const label = `${type?.label || item.type} · «${item.title ?? t('cms.pages.type.untitled')}»`
      const known = entries.get(item.id)
      entries.set(item.id, { label, link: entryLink(item.type, item.id, type), draftOnly: (known?.draftOnly ?? true) && item.draft })
      continue
    }

    // Published wins: a page that is live with the image is not "draft only".
    pages.set(item.pageKey, (pages.get(item.pageKey) ?? true) && item.draft)
  }

  return [
    ...[...pages].map(([page, draftOnly]) => ({ label: draftOnly ? t('cms.media.usage.draft', { page }) : page, link: null })),
    ...[...entries.values()].map(({ label, link, draftOnly }) => ({
      label: draftOnly ? t('cms.media.usage.draft', { page: label }) : label,
      link,
    })),
    ...brand.map(label => ({ label, link: null })),
  ]
}

const TYPE_KEY = /^[a-z][a-z0-9-]{0,39}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function entryLink(type: string, id: string, declared: UsageEntryType | null): string | null {
  if (!declared || !TYPE_KEY.test(type) || !UUID.test(id)) {
    return null
  }

  // Edit Mode finds the entry by its id and puts its address in the path.
  return declared.route
    ? `/admin/edit${declared.route.slice(0, -'[slug]'.length)}${id}?entry=${id}`
    : `/admin/content/${type}?entry=${id}`
}

/** The places as labels only (the badges of a library card). */
export function usageLabels(usage: CmsMediaUsage[], t: Translate, typeLabel: (type: string) => string = type => type): string[] {
  return usagePlaces(usage, t, type => ({ label: typeLabel(type), route: null })).map(place => place.label)
}
