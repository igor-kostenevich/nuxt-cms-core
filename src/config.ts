/**
 * Public shape of `cms.config.ts` in a client project.
 * Every field is optional: a project without `cms.config.ts` must still work.
 */
export interface CmsConfig {
  debug?: boolean
  /**
   * Bootstrap locale, e.g. `uk` or `en-GB`: the locale the site reads content
   * in while no language exists in Settings → Languages. Once a language is
   * added, the default language of the database decides (C-83).
   */
  defaultLocale?: string
  /** Edit Mode settings. */
  editor?: {
    /**
     * How many steps Undo keeps in one editing session (MASTER_PLAN C-12).
     * Undo is local to the editor tab; published versions are Revisions.
     * Whole number from 1 to 500.
     */
    historyLimit?: number
  }
}

/**
 * Config after merging with defaults. This is what CMS Core code works with.
 */
export interface ResolvedCmsConfig {
  debug: boolean
  defaultLocale: string
  editor: {
    historyLimit: number
  }
}

/**
 * Canonical BCP 47 subset: language, optional script, optional region
 * (`uk`, `en-GB`, `zh-Hant`, `es-419`). One spelling per language, so `en-gb`
 * is rejected. Keep identical to the `cms_locale` domain in SQL (migration cms_pages).
 */
export const CMS_LOCALE_PATTERN = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|\d{3}))?$/

/**
 * Value checks beyond the type. A rejected value falls back to its default
 * with a build-time warning instead of silently matching no content.
 */
const formatChecks: Record<string, (value: unknown) => boolean> = {
  'defaultLocale': value => CMS_LOCALE_PATTERN.test(value as string),
  'editor.historyLimit': value => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 500,
}

export const defaultCmsConfig: ResolvedCmsConfig = {
  debug: false,
  defaultLocale: 'en',
  editor: {
    historyLimit: 100,
  },
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
  ignored: { key: string, reason: 'unknown' | 'type' | 'format' }[]
}

/**
 * Merges `cms.config.ts` with defaults.
 *
 * The result is embedded in `#cms/config` and ships in the client bundle, and
 * c12 loads the file without typechecking it. So only keys Core knows are
 * kept, and only when the value has the default's type: a stray private value
 * stays out of the bundle, and a function does not silently vanish in
 * JSON.stringify. Groups such as `editor` are plain objects and merge key by
 * key; `formatChecks` covers values whose shape matters (dotted keys).
 */
export function resolveCmsConfig(config?: CmsConfig): CmsConfigResolution {
  const ignored: CmsConfigResolution['ignored'] = []
  const resolved = mergeLevel(defaultCmsConfig, config, '', ignored) as unknown as ResolvedCmsConfig

  return { config: resolved, ignored }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergeLevel(
  defaults: object,
  input: unknown,
  prefix: string,
  ignored: CmsConfigResolution['ignored'],
): Record<string, unknown> {
  const base = defaults as Record<string, unknown>
  const target: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(base)) {
    target[key] = isPlainObject(value) ? mergeLevel(value, undefined, `${prefix}${key}.`, ignored) : value
  }

  if (!isPlainObject(input)) {
    return target
  }

  for (const [key, value] of Object.entries(input)) {
    const path = `${prefix}${key}`

    if (!Object.hasOwn(base, key)) {
      ignored.push({ key: path, reason: 'unknown' })
      continue
    }

    if (value === undefined) {
      continue
    }

    const fallback = base[key]

    if (isPlainObject(fallback)) {
      if (!isPlainObject(value)) {
        ignored.push({ key: path, reason: 'type' })
        continue
      }

      target[key] = mergeLevel(fallback, value, `${path}.`, ignored)
      continue
    }

    if (typeof value !== typeof fallback) {
      ignored.push({ key: path, reason: 'type' })
      continue
    }

    if (formatChecks[path]?.(value) === false) {
      ignored.push({ key: path, reason: 'format' })
      continue
    }

    target[key] = value
  }

  return target
}

// Site texts (C-85) are declared next to the config, in cms.texts.ts.
export { defineCmsTexts, type CmsTextDefinition, type CmsTextsInput } from './texts'
// Forms (011) are declared next to the config, in cms.forms.ts.
export {
  defineCmsForms,
  type CmsFormDefinition,
  type CmsFormFieldDefinition,
  type CmsFormFieldRole,
  type CmsFormFieldType,
  type CmsFormsInput,
} from './forms'
