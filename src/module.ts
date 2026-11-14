import { readFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { addTemplate, addTypeTemplate, createResolver, defineNuxtModule, useLogger } from '@nuxt/kit'
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

    const { config: cmsConfig, ignored } = resolveCmsConfig(config)

    if (ignored.length > 0) {
      const logger = useLogger('nuxt-cms-core')

      for (const { key, reason } of ignored) {
        logger.warn(reason === 'unknown'
          ? `cms.config: unknown key "${key}" is ignored and not shipped to the client.`
          : `cms.config: "${key}" has the wrong type and falls back to its default.`)
      }
    }

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

    // Vite emits <link rel="prefetch"> for every dynamic import of the app
    // entry, so a public page would download admin pages, the auth chunk and
    // admin CSS. Prefetch stays only for the Client Project's own modules
    // outside pages/admin. Core files, shared chunks and node_modules are
    // dropped: a shared chunk has no source path, so it cannot be told apart
    // from one that carries admin code.
    nuxt.hook('build:manifest', (manifest) => {
      const srcDir = resolve(nuxt.options.srcDir)
      const adminPages = join(srcDir, 'pages', 'admin') + sep

      const isClientPublicModule = (key: string) => {
        const source = manifest[key]?.src

        if (!source) {
          return false
        }

        const path = resolve(srcDir, source)

        return path.startsWith(srcDir + sep)
          && !path.startsWith(adminPages)
          && !path.includes(`${sep}node_modules${sep}`)
      }

      for (const entry of Object.values(manifest)) {
        entry.dynamicImports = entry.dynamicImports?.filter(isClientPublicModule)
      }
    })
  },
})
