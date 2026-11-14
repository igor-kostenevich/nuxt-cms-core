import { createResolver } from '@nuxt/kit'
import { defineNuxtConfig } from 'nuxt/config'

const { resolve } = createResolver(import.meta.url)

// Admin translations use useAdminI18n() over app/admin/locales/*.json, not @nuxtjs/i18n:
// a layer-level i18n module would merge its locales into the Client Project and
// put vue-i18n into the public entry (MASTER_PLAN C-36).
export default defineNuxtConfig({
  modules: ['@nuxt/icon', resolve('./src/module')],
  icon: {
    mode: 'svg',
    provider: 'server',
    fallbackToApi: false,
    serverBundle: {
      collections: ['lucide'],
    },
    clientBundle: {
      scan: false,
    },
  },
  // Auth responses set session cookies, so they must not be cached and replayed
  // for a different visitor.
  routeRules: {
    '/admin': { headers: { 'cache-control': 'no-store' } },
    '/admin/**': { headers: { 'cache-control': 'no-store' } },
  },
})
