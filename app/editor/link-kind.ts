import { toSafeHref } from '../primitives/link'

export type LinkKind = 'none' | 'internal' | 'section' | 'external' | 'email' | 'phone' | 'invalid'

/**
 * Kind of a link, derived from its href (it is not stored: MASTER_PLAN 006).
 * `invalid` means the public render would not make it clickable.
 */
export function linkKind(raw: string | null | undefined): LinkKind {
  if (raw == null || raw.trim() === '') {
    return 'none'
  }

  const href = toSafeHref(raw)

  if (!href) {
    return 'invalid'
  }

  if (href.startsWith('#')) {
    return 'section'
  }

  if (href.startsWith('mailto:')) {
    return 'email'
  }

  if (href.startsWith('tel:')) {
    return 'phone'
  }

  if (href.startsWith('/') && !href.startsWith('//')) {
    return 'internal'
  }

  return 'external'
}
