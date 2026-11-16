import { describe, expect, it } from 'vitest'
import { defaultCmsConfig, resolveCmsConfig, type CmsConfig } from '../src/config'

describe('resolveCmsConfig', () => {
  it('falls back to defaults without a config file', () => {
    expect(resolveCmsConfig()).toEqual({ config: defaultCmsConfig, ignored: [] })
  })

  it('keeps known keys with the right type', () => {
    expect(resolveCmsConfig({ debug: true, defaultLocale: 'uk' }).config).toEqual({
      debug: true,
      defaultLocale: 'uk',
      editor: { historyLimit: 100 },
    })
  })

  // A wrong locale would match no content and silently render defaults everywhere.
  it.each(['uk', 'en-GB', 'zh-Hant', 'es-419'])('accepts canonical locale %s', (locale) => {
    expect(resolveCmsConfig({ defaultLocale: locale })).toEqual({
      config: { ...defaultCmsConfig, defaultLocale: locale },
      ignored: [],
    })
  })

  it.each(['UK', 'en-gb', 'uk_UA', 'english', ''])('rejects locale %j with a format reason', (locale) => {
    expect(resolveCmsConfig({ defaultLocale: locale })).toEqual({
      config: defaultCmsConfig,
      ignored: [{ key: 'defaultLocale', reason: 'format' }],
    })
  })

  // The result ships in the client bundle, so nothing Core does not know may pass.
  it('drops unknown keys and values of the wrong type', () => {
    const config = {
      debug: () => true,
      secretToken: 'do-not-ship',
    } as unknown as CmsConfig

    expect(resolveCmsConfig(config)).toEqual({
      config: defaultCmsConfig,
      ignored: [
        { key: 'debug', reason: 'type' },
        { key: 'secretToken', reason: 'unknown' },
      ],
    })
  })

  it('merges the editor group key by key', () => {
    expect(resolveCmsConfig({ editor: { historyLimit: 30 } })).toEqual({
      config: { ...defaultCmsConfig, editor: { historyLimit: 30 } },
      ignored: [],
    })
    expect(resolveCmsConfig({ editor: {} }).config.editor).toEqual({ historyLimit: 100 })
  })

  it.each([0, 501, 2.5])('rejects historyLimit %j with a format reason', (historyLimit) => {
    expect(resolveCmsConfig({ editor: { historyLimit } })).toEqual({
      config: defaultCmsConfig,
      ignored: [{ key: 'editor.historyLimit', reason: 'format' }],
    })
  })

  it('reports unknown and mistyped nested keys with their dotted path', () => {
    const config = { editor: { historyLimit: '50', autosave: true } } as unknown as CmsConfig

    expect(resolveCmsConfig(config).ignored).toEqual([
      { key: 'editor.historyLimit', reason: 'type' },
      { key: 'editor.autosave', reason: 'unknown' },
    ])
    expect(resolveCmsConfig({ editor: 'big' } as unknown as CmsConfig).ignored).toEqual([
      { key: 'editor', reason: 'type' },
    ])
  })
})
