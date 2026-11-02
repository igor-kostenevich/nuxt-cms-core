# nuxt-cms-core

Reusable CMS Core for Nuxt 4, distributed as a Nuxt Layer that registers an internal Nuxt Module.

At this stage the package contains the foundation (layer + module wiring, the `cms.config.ts`
contract), a read path for site settings, and CMS login: a session, `cms_users`, and a static
permission map. `/admin`, including `/admin/edit`, requires an active CMS user.

## Package structure

```
nuxt.config.ts                       Layer entry point, registers ./src/module
src/config.ts                        cms.config contract + runtime config contract
src/module.ts                        Nuxt Module: loads cms.config.ts, exposes #cms/config, reads env
app/types/settings.ts                SiteSettings domain type
app/data/supabase.ts                 Anonymous backend client for public reads
app/data/supabase-auth.ts            Session client. These two files are the only Supabase SDK imports
app/data/errors.ts                   CmsDataError, the only error type the Data Layer exposes
app/data/repositories/               Core repositories
app/auth/                            Permission map and post-login redirect check
app/composables/useCms.ts            Config entry point, auto-imported in consumer projects
app/composables/useSiteSettings.ts   Reactive site settings
app/composables/useCmsAuth.ts        CMS session: identity plus active cms_users row
app/middleware/cms-auth.ts           Named gate for /admin pages
app/pages/admin/                     Login and a proof page. Not the admin shell
supabase/migrations/                 Core migrations, shipped with the package
supabase/seed.sql                    Local fixtures only. Not part of the published package
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

## CMS login

A row in Supabase Auth is not CMS access. `/admin` and any client page that opts in with
`definePageMeta({ middleware: ['cms-auth'] })` also require an active row in `cms_users`.

There is no public registration page. Local `supabase db reset` seeds four accounts, all with
the password `local-dev-password`:

| Email | CMS access |
| --- | --- |
| `owner@example.com` | owner |
| `editor@example.com` | editor, cannot publish |
| `customer@example.com` | auth user only, no CMS access |
| `disabled@example.com` | membership exists, status disabled |

Sign in at `/admin/login`. The secret/service role key is still unused: login uses the
publishable key, and the user's own JWT travels in a cookie. Invite and user management come
later and are the first place that key will be required, only on the server.

## Development

All commands run the playground app:

```bash
npm install       # links the layer into playground and prepares types
npm run dev       # http://localhost:3000
npm run build
npm run preview
```
