import { createResolver } from '@nuxt/kit'
import { defineNuxtConfig } from 'nuxt/config'
import i18n from './i18n/i18n.options'

const { resolve } = createResolver(import.meta.url)

export default defineNuxtConfig({
  modules: ['@nuxtjs/i18n', resolve('./src/module')],
  i18n,
  // Auth responses set session cookies, so they must not be cached and replayed
  // for a different visitor.
  routeRules: {
    '/admin': { headers: { 'cache-control': 'no-store' } },
    '/admin/**': { headers: { 'cache-control': 'no-store' } },
  },
  hooks: {
    // Vite otherwise emits <link rel="prefetch"> for every async page from the
    // app entry, so a public page would download the auth chunk.
    'build:manifest': (manifest) => {
      for (const entry of Object.values(manifest)) {
        entry.dynamicImports = []
      }
    },
  },
})
