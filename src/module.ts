import { readFileSync } from 'node:fs'
import { addTemplate, addTypeTemplate, createResolver, defineNuxtModule } from '@nuxt/kit'
import { loadConfig } from 'c12'
import { resolveCmsConfig, type CmsConfig, type CmsRuntimeConfig } from './config'

export default defineNuxtModule({
  meta: {
    name: 'nuxt-cms-core',
  },
  async setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const { version } = JSON.parse(
      readFileSync(resolver.resolve('../package.json'), 'utf8'),
    ) as { version: string }

    const { config, configFile } = await loadConfig<CmsConfig>({
      name: 'cms',
      cwd: nuxt.options.rootDir,
    })

    const cmsConfig = resolveCmsConfig(config)

    // Restart the dev server when the project changes its CMS config.
    if (configFile) {
      nuxt.options.watch.push(configFile)
    }

    // Values from `.env` are only defaults baked in at build time. At runtime Nuxt
    // overrides them from NUXT_PUBLIC_CMS_SUPABASE_URL / NUXT_PUBLIC_CMS_SUPABASE_KEY,
    // which is what lets one build target a local or a hosted backend.
    const publicRuntimeConfig = nuxt.options.runtimeConfig.public as {
      cms?: Partial<CmsRuntimeConfig>
    }

    publicRuntimeConfig.cms = {
      supabaseUrl: process.env.SUPABASE_URL ?? '',
      supabaseKey: process.env.SUPABASE_KEY ?? '',
      ...publicRuntimeConfig.cms,
    }

    const template = addTemplate({
      filename: 'cms/config.mjs',
      getContents: () => [
        `export const cmsVersion = ${JSON.stringify(version)}`,
        `export const cmsConfig = ${JSON.stringify(cmsConfig, null, 2)}`,
      ].join('\n'),
    })

    addTypeTemplate({
      filename: 'cms/config.d.ts',
      getContents: () => [
        `declare module '#cms/config' {`,
        `  import type { ResolvedCmsConfig } from 'nuxt-cms-core/config'`,
        `  export const cmsVersion: string`,
        `  export const cmsConfig: ResolvedCmsConfig`,
        `}`,
      ].join('\n'),
    })

    nuxt.options.alias['#cms/config'] = template.dst
  },
})
