/**
 * Public shape of `cms.config.ts` in a client project.
 * Every field is optional: a project without `cms.config.ts` must still work.
 */
export interface CmsConfig {
  debug?: boolean
}

/**
 * Config after merging with defaults. This is what CMS Core code works with.
 */
export interface ResolvedCmsConfig {
  debug: boolean
}

export const defaultCmsConfig: ResolvedCmsConfig = {
  debug: false,
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
  ignored: { key: string, reason: 'unknown' | 'type' }[]
}

/**
 * Merges `cms.config.ts` with defaults.
 *
 * The result is embedded in `#cms/config` and ships in the client bundle, and
 * c12 loads the file without typechecking it. So only keys Core knows are
 * kept, and only when the value has the default's type: a stray private value
 * stays out of the bundle, and a function does not silently vanish in
 * JSON.stringify. Every current field is a primitive, so `typeof` is enough.
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

    target[key] = value
  }

  return { config: resolved, ignored }
}
