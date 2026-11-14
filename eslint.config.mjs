import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

// Standalone config: the @nuxt/eslint module is not registered, so linting adds
// nothing to the Core layer that Client Projects extend. Formatting rules stay off;
// lint is for correctness, not for restyling working code.
export default createConfigForNuxt({
  features: {
    stylistic: false,
  },
  dirs: {
    src: ['app', 'playground/app'],
  },
}).append({
  ignores: ['docs/**', 'supabase/.temp/**', '**/.nuxt/**', '**/.output/**', '**/node_modules/**'],
})
