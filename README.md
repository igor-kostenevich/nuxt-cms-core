# nuxt-cms-core

Reusable CMS Core for Nuxt 4, distributed as a Nuxt Layer that registers an internal Nuxt Module.

At this stage the package contains the foundation (layer + module wiring, the `cms.config.ts`
contract) and one vertical slice of the Data Layer: reading global site settings from Supabase
through a repository.

## Package structure

```
nuxt.config.ts                       Layer entry point, registers ./src/module
src/config.ts                        cms.config contract + runtime config contract
src/module.ts                        Nuxt Module: loads cms.config.ts, exposes #cms/config, reads env
app/types/settings.ts                SiteSettings domain type
app/data/supabase.ts                 Backend adapter, the only file that knows about Supabase
app/data/errors.ts                   CmsDataError, the only error type the Data Layer exposes
app/data/repositories/               Core repositories
app/composables/useCms.ts            Config entry point, auto-imported in consumer projects
app/composables/useSiteSettings.ts   Reactive site settings
supabase/migrations/                 Core migrations, shipped with the package
playground/                          Consumer Nuxt app used for verification
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

## Backend connection

CMS Core reads its backend connection from the environment, never from `cms.config.ts`:
`cms.config.ts` describes what the project can do, the environment describes where it is deployed.

Copy `.env.example` and fill in two values:

```bash
SUPABASE_URL=
SUPABASE_KEY=
```

Only the publishable/anon key belongs here. It reaches the browser and is protected by Row Level
Security, so the secret/service_role key must never be used for it.

These two values are the only difference between a local Supabase CLI instance and a hosted
project, so the same code covers both.

### Local development

```bash
supabase start        # prints the URL and keys, also available via `supabase status`
supabase db reset     # applies the Core migrations
```

The playground reads `playground/.env`, so copy the values there when working in this repository.

### Hosted project

```bash
supabase link --project-ref <project-ref>
supabase db push      # applies the same migration files
```

### Build time vs runtime

`SUPABASE_URL` and `SUPABASE_KEY` become *build-time defaults* of `runtimeConfig.public.cms`.
When the build and the runtime are different environments, which is the normal case for a hosted
deployment, set the values at runtime using Nuxt's own override convention instead:

```bash
NUXT_PUBLIC_CMS_SUPABASE_URL=
NUXT_PUBLIC_CMS_SUPABASE_KEY=
```

Otherwise the deployed app keeps the connection of the machine that built it.

## Reading content

Data access always goes through a repository, so components never talk to the backend directly:

```vue
<script setup lang="ts">
const { settings, pending, error, refresh } = useSiteSettings()
</script>
```

Errors surface as `CmsDataError` with a `code` of `not_found`, `permission_denied` or `unknown`.
Backend-specific errors never reach the UI.

## Development

All commands run the playground app:

```bash
npm install       # links the layer into playground and prepares types
npm run dev       # http://localhost:3000
npm run build
npm run preview
```
