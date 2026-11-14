/**
 * Field address inside an entity: dotted path of `[A-Za-z0-9_-]` segments,
 * e.g. `hero.title` or `services.items.<id>.title` (MASTER_PLAN C-48).
 */
export const CMS_FIELD_KEY_PATTERN = /^[\w-]+(?:\.[\w-]+)*$/

export function isCmsFieldKey(value: string): boolean {
  return CMS_FIELD_KEY_PATTERN.test(value)
}

/** Dev-only hint: production builds drop the check. */
export function warnInvalidFieldKey(component: string, fieldKey: string): void {
  if (import.meta.dev && !isCmsFieldKey(fieldKey)) {
    console.warn(`[nuxt-cms-core] ${component}: invalid field-key "${fieldKey}". `
      + 'Use dotted segments of letters, digits, "_" or "-", e.g. "hero.title".')
  }
}
