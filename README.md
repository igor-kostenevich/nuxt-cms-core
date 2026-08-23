# nuxt-cms-core

Reusable CMS Core for Nuxt 4, distributed as a Nuxt Layer that registers an internal Nuxt Module.

At this stage the package contains only the foundation: layer + module wiring, a minimal
`cms.config.ts` contract and a playground that verifies the package from a consumer point of view.

## Package structure

```
nuxt.config.ts            Layer entry point, registers ./src/module
src/config.ts             cms.config contract (types, defaults, defineCmsConfig)
src/module.ts             Nuxt Module: loads cms.config.ts and exposes it via #cms/config
app/composables/useCms.ts Runtime entry point, auto-imported in consumer projects
playground/               Consumer Nuxt app used for verification
```

## Usage in a client project

Install the package and extend the layer:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  extends: ['nuxt-cms-core'],
})
```

Optionally add `cms.config.ts` in the project root:

```ts
// cms.config.ts
import { defineCmsConfig } from 'nuxt-cms-core/config'

export default defineCmsConfig({
  debug: true,
})
```

The file is optional. Without it CMS Core falls back to defaults.

Read the resolved config anywhere in the app:

```vue
<script setup lang="ts">
const { version, config } = useCms()
</script>
```

## Development

All commands run the playground app:

```bash
npm install       # links the layer into playground and prepares types
npm run dev       # http://localhost:3000
npm run build
npm run preview
```
