import { fileURLToPath } from 'node:url'
import { defineVitestConfig } from '@nuxt/test-utils/config'

// defineVitestConfig splits tests into two projects: `nuxt` for `*.nuxt.test.ts` and
// `tests/nuxt/**` (needs happy-dom as a dev dependency), `node` for everything else.
// The layer has no app of its own, so the Nuxt environment boots the playground.
export default defineVitestConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    environmentOptions: {
      nuxt: {
        rootDir: fileURLToPath(new URL('./playground', import.meta.url)),
      },
    },
  },
})
