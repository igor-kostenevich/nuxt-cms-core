import { readFileSync } from 'node:fs'
import { addTemplate, addTypeTemplate, createResolver, defineNuxtModule } from '@nuxt/kit'
import { loadConfig } from 'c12'
import { resolveCmsConfig, type CmsConfig } from './config'

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
