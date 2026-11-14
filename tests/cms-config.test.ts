import { describe, expect, it } from 'vitest'
import { defaultCmsConfig, resolveCmsConfig, type CmsConfig } from '../src/config'

describe('resolveCmsConfig', () => {
  it('falls back to defaults without a config file', () => {
    expect(resolveCmsConfig()).toEqual({ config: defaultCmsConfig, ignored: [] })
  })

  it('keeps known keys with the right type', () => {
    expect(resolveCmsConfig({ debug: true }).config).toEqual({ debug: true })
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
})
