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

export function resolveCmsConfig(config?: CmsConfig): ResolvedCmsConfig {
  return {
    ...defaultCmsConfig,
    ...config,
  }
}
