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

export function defineCmsConfig(config: CmsConfig): CmsConfig {
  return config
}

export function resolveCmsConfig(config?: CmsConfig): ResolvedCmsConfig {
  return {
    ...defaultCmsConfig,
    ...config,
  }
}
