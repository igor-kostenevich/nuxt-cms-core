import { readFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { addTemplate, addTypeTemplate, createResolver, defineNuxtModule, useLogger } from '@nuxt/kit'
import { loadConfig } from 'c12'
import { resolveCmsConfig, type CmsConfig, type CmsRuntimeConfig } from './config'
import { resolveCmsTexts } from './texts'

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
          : reason === 'type'
            ? `cms.config: "${key}" has the wrong type and falls back to its default.`
            : `cms.config: "${key}" has an invalid format and falls back to its default.`)
      }
    }

    // Site texts (C-85): cms.texts.ts next to cms.config.ts. Optional.
    const { config: textsInput, configFile: textsFile } = await loadConfig<Record<string, unknown>>({
      configFile: 'cms.texts',
      cwd: nuxt.options.rootDir,
      rcFile: false,
      globalRc: false,
      dotenv: false,
    })
    const { texts: cmsTexts, ignored: ignoredTexts } = resolveCmsTexts(textsInput)

    if (ignoredTexts.length > 0) {
      const logger = useLogger('nuxt-cms-core')

      for (const { key, reason } of ignoredTexts) {
        logger.warn(reason === 'key'
          ? `cms.texts: key "${key}" is not a dotted key of letters, digits, "_" or "-"; ignored.`
          : `cms.texts: "${key}" has no text (or one over 2000 characters); ignored.`)
      }
    }

    // Restart the dev server when the project changes its CMS config or texts.
    for (const file of [configFile, textsFile]) {
      if (file) {
        nuxt.options.watch.push(file)
      }
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

    const textsTemplate = addTemplate({
      filename: 'cms/texts.mjs',
      getContents: () => `export const cmsTexts = ${JSON.stringify(cmsTexts, null, 2)}`,
    })

    addTypeTemplate({
      filename: 'cms/texts.d.ts',
      getContents: () => [
        `declare module '#cms/texts' {`,
        `  export const cmsTexts: { key: string, text: string, context?: string }[]`,
        `}`,
      ].join('\n'),
    })

    nuxt.options.alias['#cms/texts'] = textsTemplate.dst

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
