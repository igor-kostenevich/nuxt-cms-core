import { readFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { addTemplate, addTypeTemplate, createResolver, defineNuxtModule, useLogger } from '@nuxt/kit'
import { loadConfig } from 'c12'
import { resolveCmsConfig, type CmsConfig, type CmsRuntimeConfig } from './config'
import { MAX_FIELDS, MAX_FORMS, MAX_TEXT_LENGTH, resolveCmsForms, type CmsFormsIgnoredReason } from './forms'
import { resolveCmsTexts } from './texts'

const FORM_WARNINGS: Record<CmsFormsIgnoredReason, string> = {
  'form-key': 'the form key must start with a letter and use letters, digits, "_" or "-"',
  'form-shape': 'a form is `{ fields: [...] }`',
  'too-many-forms': `more than ${MAX_FORMS} forms`,
  'no-fields': 'the form has no valid fields',
  'field-key': 'the field key must start with a letter and use letters, digits, "_" or "-"',
  'field-duplicate': 'the field key is used twice',
  'field-type': 'unknown field type (text, email, tel, textarea, select, checkbox)',
  'field-length': `maxLength must be a whole number from 1 to ${MAX_TEXT_LENGTH}`,
  'field-options': 'a select needs unique options of letters, digits, "_" or "-"',
  'field-role': 'unknown role, or a role that does not fit the type (name: text, email: email, phone: tel, message: textarea / text)',
  'role-duplicate': 'the role is already taken by another field; the role is dropped',
  'too-many-fields': `more than ${MAX_FIELDS} fields`,
}

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

    // Forms (011): cms.forms.ts next to cms.config.ts. Optional.
    const { config: formsInput, configFile: formsFile } = await loadConfig<Record<string, unknown>>({
      configFile: 'cms.forms',
      cwd: nuxt.options.rootDir,
      rcFile: false,
      globalRc: false,
      dotenv: false,
    })
    const { forms: cmsForms, ignored: ignoredForms } = resolveCmsForms(formsInput)

    if (ignoredForms.length > 0) {
      const logger = useLogger('nuxt-cms-core')

      for (const { form, field, reason } of ignoredForms) {
        const where = field === undefined ? `form "${form}"` : `field "${form}.${field}"`
        logger.warn(`cms.forms: ${where}: ${FORM_WARNINGS[reason]}; ignored.`)
      }
    }

    // Restart the dev server when the project changes its CMS config, texts or forms.
    for (const file of [configFile, textsFile, formsFile]) {
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

    // The secret key of the backend (011: the form submit route). Server-only:
    // never in `public`, never read from the environment at build time. At
    // runtime Nuxt fills it from NUXT_CMS_SUPABASE_SECRET; the server falls
    // back to SUPABASE_SECRET itself (server/cms/supabase.ts).
    // `clientAddress` (NUXT_CMS_CLIENT_ADDRESS): where the visitor address for
    // the form limits comes from, `auto` by default (server/cms/client-address.ts).
    const privateRuntimeConfig = nuxt.options.runtimeConfig as { cms?: { supabaseSecret?: string, clientAddress?: string } }

    privateRuntimeConfig.cms = {
      supabaseSecret: '',
      clientAddress: 'auto',
      ...privateRuntimeConfig.cms,
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

    // Written to disk: the Nitro server (the submit route) imports it too.
    const formsTemplate = addTemplate({
      filename: 'cms/forms.mjs',
      write: true,
      getContents: () => `export const cmsForms = ${JSON.stringify(cmsForms, null, 2)}`,
    })

    addTypeTemplate({
      filename: 'cms/forms.d.ts',
      getContents: () => [
        `declare module '#cms/forms' {`,
        `  import type { CmsForm } from 'nuxt-cms-core/types'`,
        `  export const cmsForms: CmsForm[]`,
        `}`,
      ].join('\n'),
    }, { nuxt: true, nitro: true })

    nuxt.options.alias['#cms/forms'] = formsTemplate.dst

    // The runtime hooks of a site's server plugins: its own rules, and the
    // event of a new submission (C-97).
    addTypeTemplate({
      filename: 'cms/forms-hooks.d.ts',
      getContents: () => [
        `import type { CmsFormSubmittedContext, CmsFormValidateContext } from 'nuxt-cms-core/types'`,
        `declare module 'nitropack/types' {`,
        `  interface NitroRuntimeHooks {`,
        `    'cms:forms:validate': (context: CmsFormValidateContext) => void | Promise<void>`,
        `    'cms:forms:submitted': (context: CmsFormSubmittedContext) => void | Promise<void>`,
        `  }`,
        `}`,
        `export {}`,
      ].join('\n'),
    }, { nitro: true, nuxt: true })

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
