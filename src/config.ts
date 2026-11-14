/**
 * Public shape of `cms.config.ts` in a client project.
 * Every field is optional: a project without `cms.config.ts` must still work.
 */
export interface CmsConfig {
  debug?: boolean
  /**
   * Locale the public site reads content in, e.g. `uk` or `en-GB`.
   * Until localization (010) there is one locale per site.
   */
  defaultLocale?: string
}

/**
 * Config after merging with defaults. This is what CMS Core code works with.
 */
export interface ResolvedCmsConfig {
  debug: boolean
  defaultLocale: string
}

/**
 * Canonical BCP 47 subset: language, optional script, optional region
 * (`uk`, `en-GB`, `zh-Hant`, `es-419`). One spelling per language, so `en-gb`
 * is rejected. Keep identical to `cms_page_published_locale_format` in SQL.
 */
export const CMS_LOCALE_PATTERN = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|\d{3}))?$/

/**
 * Value checks beyond the type. A rejected value falls back to its default
 * with a build-time warning instead of silently matching no content.
 */
const formatChecks: Partial<Record<keyof ResolvedCmsConfig, (value: unknown) => boolean>> = {
  defaultLocale: value => CMS_LOCALE_PATTERN.test(value as string),
}

export const defaultCmsConfig: ResolvedCmsConfig = {
  debug: false,
  defaultLocale: 'en',
}

/**
 * Infrastructure values that come from the environment, not from `cms.config.ts`.
 * Exposed through `runtimeConfig.public.cms` so a deployed build can be pointed
 * at another backend without rebuilding.
 */
export interface CmsRuntimeConfig {
  supabaseUrl: string
  supabaseKey: string
}

export function defineCmsConfig(config: CmsConfig): CmsConfig {
  return config
}

export interface CmsConfigResolution {
  config: ResolvedCmsConfig
  /** Keys left out of the result, with the reason, for a build-time warning. */
  ignored: { key: string, reason: 'unknown' | 'type' | 'format' }[]
}

/**
 * Merges `cms.config.ts` with defaults.
 *
 * The result is embedded in `#cms/config` and ships in the client bundle, and
 * c12 loads the file without typechecking it. So only keys Core knows are
 * kept, and only when the value has the default's type: a stray private value
 * stays out of the bundle, and a function does not silently vanish in
 * JSON.stringify. Every current field is a primitive, so `typeof` is enough
 * for the type; `formatChecks` covers values whose shape matters.
 */
export function resolveCmsConfig(config?: CmsConfig): CmsConfigResolution {
  const resolved: ResolvedCmsConfig = { ...defaultCmsConfig }
  const ignored: CmsConfigResolution['ignored'] = []
  const target = resolved as unknown as Record<string, unknown>

  for (const [key, value] of Object.entries(config ?? {})) {
    if (!Object.hasOwn(defaultCmsConfig, key)) {
      ignored.push({ key, reason: 'unknown' })
      continue
    }

    if (value === undefined) {
      continue
    }

    if (typeof value !== typeof target[key]) {
      ignored.push({ key, reason: 'type' })
      continue
    }

    if (formatChecks[key as keyof ResolvedCmsConfig]?.(value) === false) {
      ignored.push({ key, reason: 'format' })
      continue
    }

    target[key] = value
  }

  return { config: resolved, ignored }
}
