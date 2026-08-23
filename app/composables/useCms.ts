import { cmsConfig, cmsVersion } from '#cms/config'

/**
 * Minimal entry point into CMS Core runtime.
 * At this stage it only proves that the layer and the module are wired correctly.
 */
export function useCms() {
  return {
    version: cmsVersion,
    config: cmsConfig,
  }
}
