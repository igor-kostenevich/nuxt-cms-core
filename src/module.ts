import { readFileSync, realpathSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { addTemplate, addTypeTemplate, addVitePlugin, createResolver, defineNuxtModule, useLogger } from '@nuxt/kit'
import type { NuxtPage } from '@nuxt/schema'
import { loadConfig } from 'c12'
import { adminCssPlugin } from './admin-css'
import { ADMIN_GATE, findAdminRouteViolations, formatAdminRouteViolations } from './admin-routes'
import { resolveCmsConfig, type CmsConfig, type CmsRuntimeConfig } from './config'
import { MAX_FIELDS, MAX_FORMS, MAX_TEXT_LENGTH, resolveCmsForms, type CmsFormsIgnoredReason } from './forms'
import { resolveCmsTexts } from './texts'
import { resolveCmsContent, type CmsContentIgnoredReason } from './content'
import { fieldValueType, type CmsContentFieldProblem } from './content-fields'
import { findTypeRoutes, reservedSlugs, routePattern } from './content-route'

const CONTENT_WARNINGS: Record<CmsContentIgnoredReason, string> = {
  'type-key': 'the type key must match ^[a-z][a-z0-9-]{0,39}$ (it is stored with every entry)',
  'type-shape': 'a type is `{ label, route }` (Pages) or `{ label, fields }` (Content)',
  'type-label': 'the label must be a non-empty string or `{ en, uk, … }`',
  'type-text': '`text` takes only newButton, newTitle, editTitle, each a non-empty string or `{ en, uk, … }`',
  'no-route-or-fields': 'a type needs `route` (Pages) or `fields` (Content)',
  'editor-removed': '`editor` is no longer supported: describe the form of a Content type with `fields`',
  'route-and-fields': 'a type with a route is edited on its page in Edit Mode: `fields` is for Content types',
  'route-format': 'the route must be static segments and `[slug]` last, e.g. `/blog/[slug]`',
  'order': 'order is one of newest, manual, title',
  'route-manual': 'a type with a route cannot have `order: \'manual\'` (Pages has no manual ordering); use newest or title',
  'unknown-key': 'unknown key (a type has label, route or fields, order, text; a page has label, path; the file has pages, types)',
  'page-key': 'the page key is the one useCmsPage takes: ^[a-z][a-z0-9_-]{0,79}$',
  'page-shape': 'a page is `{ label, path }`',
  'page-path': 'the path is a site path without a language prefix, e.g. `/careers`',
  'page-duplicate-path': 'another page has the same path',
}

const FIELD_WARNINGS: Record<CmsContentFieldProblem, string> = {
  'fields-shape': '`fields` is an object of fields, e.g. `{ title: { type: \'text\', label: \'Title\' } }`',
  'fields-title': 'every entry needs `title: { type: \'text\', label }` (lists, search and Activity show it)',
  'fields-count': 'a type has at most 40 fields',
  'field-key': 'the field key is its address in the entry: ^[a-z][a-zA-Z0-9_]{0,39}$',
  'field-type': 'type is one of text, textarea, richText, number, select, radio, multiselect, boolean, date, datetime, dateRange, email, url, phone, image, link',
  'field-label': 'label, hint and placeholder must be a non-empty string or `{ en, uk, … }`',
  'field-unknown-key': 'unknown key for this field type (all: type, label, hint, required, width; plus maxLength, rows, min, max, options, appearance, default, placeholder where the type has them)',
  'field-length': 'maxLength is a positive integer',
  'field-rows': 'rows is an integer from 2 to 20',
  'field-range': 'min and max are of the field\'s kind (number; count for multiselect; YYYY-MM-DD for dates; UTC ISO for datetime), min ≤ max',
  'field-options': 'options are `[{ value, label }]`: at least one, values unique, letters, digits, "_" or "-"',
  'field-width': 'width is full, half or quarter',
  'field-appearance': 'appearance of a boolean is switch or checkbox',
  'field-required': 'required is true / false, and a boolean cannot be required (false is an answer)',
  'field-default': 'default must be a value the field accepts (an option, within min / max, YYYY-MM-DD or UTC ISO)',
}

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
    // Library stylesheets of the admin stay inside `.cms-admin` (src/admin-css.ts).
    addVitePlugin(adminCssPlugin())
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

    // Content (014): cms.content.ts next to cms.config.ts. Optional.
    const { config: contentInput, configFile: contentFile } = await loadConfig<Record<string, unknown>>({
      configFile: 'cms.content',
      cwd: nuxt.options.rootDir,
      rcFile: false,
      globalRc: false,
      dotenv: false,
    })
    const { content: cmsContent, ignored: ignoredContent } = resolveCmsContent(contentInput)

    // An invalid declaration drops a whole section of the site: reported with
    // the route checks below, so a production build fails (author, 2d).
    const declarationProblems = ignoredContent.map(({ kind, key, reason }) => `${kind} "${key}": ${
      kind === 'field' ? FIELD_WARNINGS[reason as CmsContentFieldProblem] : CONTENT_WARNINGS[reason as CmsContentIgnoredReason]}`)

    // Restart the dev server when the project changes its CMS config, texts, forms or content.
    for (const file of [configFile, textsFile, formsFile, contentFile]) {
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

    // /admin/* is reserved for Core (C-98). In a layer the project's page with
    // the same path and the project's middleware with the same name silently
    // win, so both are checked after Nuxt has resolved them. Build time only:
    // nothing here reaches any runtime.
    const coreAppDir = realPath(resolver.resolve('../app'))
    const isCoreFile = (file: string) => realPath(file).startsWith(coreAppDir + sep)

    // The route check reads middleware, path and alias that Nuxt extracts from
    // definePageMeta. Without extraction it would pass every route unread.
    if (nuxt.options.experimental.scanPageMeta === false && !nuxt.options.experimental.typedPages) {
      throw new Error('nuxt-cms-core: experimental.scanPageMeta must stay enabled; the admin route check reads page meta.')
    }

    // A build fails. The dev server only reports: a throw from these hooks during
    // a page rebuild is an unhandled rejection that leaves the dev server
    // answering nothing until restart. The error repeats on every rebuild.
    const reportAdminViolation = (message: string) => {
      if (!nuxt.options.dev) {
        throw new Error(message)
      }

      useLogger('nuxt-cms-core').error(`${message}\nA production build fails with this error.`)
    }

    nuxt.hook('pages:resolved', (pages) => {
      const violations = findAdminRouteViolations(pages, isCoreFile)

      if (violations.length > 0) {
        reportAdminViolation(formatAdminRouteViolations(violations, nuxt.options.rootDir))
      }
    })

    nuxt.hook('app:resolve', (app) => {
      const gate = app.middleware.find(middleware => middleware.name === ADMIN_GATE)

      if (!gate || !isCoreFile(gate.path)) {
        reportAdminViolation(
          `nuxt-cms-core: the route middleware "${ADMIN_GATE}" is reserved for CMS Core`
          + (gate ? ` and is overridden by ${gate.path}` : ' and is missing')
          + '. Rename the project middleware.',
        )
      }
    })

    // ── Content (014) ─────────────────────────────────────────────────────

    const contentProblems: string[] = [...declarationProblems]

    /** What only the routes can tell, filled when Nuxt has resolved the pages. */
    const contentRoutes: Record<string, { reserved: string[] }> = {}

    const contentTemplate = addTemplate({
      filename: 'cms/content.mjs',
      getContents: () => `export const cmsContent = ${JSON.stringify({
        pages: cmsContent.pages,
        types: cmsContent.types.map(type => ({ ...type, reserved: contentRoutes[type.key]?.reserved ?? [] })),
      }, null, 2)}`,
    })

    nuxt.options.alias['#cms/content'] = contentTemplate.dst

    // The declared order of each type, for public reads (useCmsEntries): only
    // keys and orders, so the site does not carry the labels of the admin.
    const orderTemplate = addTemplate({
      filename: 'cms/content-order.mjs',
      getContents: () => `export const cmsContentOrder = ${JSON.stringify(Object.fromEntries(cmsContent.types.map(type => [type.key, type.order])))}`,
    })

    nuxt.options.alias['#cms/content-order'] = orderTemplate.dst

    const typeKeys = cmsContent.types.map(type => JSON.stringify(type.key)).join(' | ') || 'never'

    addTypeTemplate({
      filename: 'cms/content.d.ts',
      getContents: () => [
        `declare module '#cms/content' {`,
        `  import type { ResolvedCmsContent } from 'nuxt-cms-core/config'`,
        `  /** Keys of the entry types this project declares in cms.content.ts. */`,
        `  export type CmsEntryTypeKey = ${typeKeys}`,
        `  /**`,
        `   * The stored content of each entry type with \`fields\` (014, C-103), for the`,
        `   * site's own components: \`entry.content as CmsEntryContent['vacancy']\`.`,
        `   * Every field but the title may be missing (a draft, a field added later).`,
        `   */`,
        `  export interface CmsEntryContent {`,
        ...cmsContent.types.flatMap(type => (type.fields
          ? [`    ${JSON.stringify(type.key)}: { ${Object.entries(type.fields)
              .map(([key, field]) => `${key}${key === 'title' ? '' : '?'}: ${fieldValueType(field)}`).join('; ')} }`]
          : [])),
        `  }`,
        `  export const cmsContent: { pages: ResolvedCmsContent['pages'], types: (ResolvedCmsContent['types'][number] & { reserved: string[] })[] }`,
        `}`,
        `declare module '#cms/content-order' {`,
        `  import type { CmsContentOrder } from 'nuxt-cms-core/config'`,
        `  /** Declared order of each entry type: the default of useCmsEntries. */`,
        `  export const cmsContentOrder: Record<string, CmsContentOrder>`,
        `}`,
      ].join('\n'),
    })

    nuxt.hook('pages:resolved', (pages) => {
      const routes = flattenPages(pages)
      const problems = [...contentProblems]
      const owners = new Map<string, string>()

      for (const type of cmsContent.types) {
        if (!type.route) {
          continue
        }

        // A catch-all of the site (a 404 page) does not cover the route: the
        // router ranks it below any route with a param, so it is no conflict.
        const matches = findTypeRoutes(routes, type.route)

        if (owners.has(type.route)) {
          problems.push(`type "${type.key}": route ${type.route} is already the route of type "${owners.get(type.route)}"`)
        }

        owners.set(type.route, type.key)

        if (matches.length === 0) {
          problems.push(`type "${type.key}": no page for route ${type.route} (expected e.g. pages/blog/[slug].vue or pages/[[locale]]/blog/[slug].vue)`)
        } else if (matches.length > 1) {
          problems.push(`type "${type.key}": route ${type.route} matches ${matches.length} pages: ${matches.map(route => route.path).join(', ')}`)
        }

        contentRoutes[type.key] = { reserved: reservedSlugs(routes, type.route) }
      }

      for (const page of cmsContent.pages) {
        if (!routes.some(route => routePattern(route.path) === page.path)) {
          problems.push(`page "${page.key}": no page for path ${page.path}`)
        }
      }

      if (problems.length > 0) {
        reportAdminViolation(`nuxt-cms-core: cms.content.ts does not match the pages of the site:\n${problems.map(problem => `  - ${problem}`).join('\n')}`)
      }
    })

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

/** Full paths of all routes, children included (their paths are relative). */
function flattenPages(pages: NuxtPage[], parent = ''): { path: string, name?: string }[] {
  return pages.flatMap((page) => {
    const path = page.path.startsWith('/') ? page.path : `${parent.replace(/\/$/, '')}/${page.path}`
    return [{ path, name: page.name }, ...flattenPages(page.children ?? [], path)]
  })
}

/** Symlinks resolved (the playground links Core); a virtual file stays as given. */
function realPath(file: string): string {
  try {
    return realpathSync(file)
  } catch {
    return resolve(file)
  }
}
