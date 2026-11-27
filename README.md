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
app/data/supabase-auth.ts            Session client. These two files are the only Supabase SDK imports in app/
app/data/errors.ts                   CmsDataError, the only error type the Data Layer exposes
app/data/repositories/               Core repositories
app/auth/                            Permission map and post-login redirect check
app/composables/useCms.ts            Config entry point, auto-imported in consumer projects
app/composables/useSiteSettings.ts   Reactive site settings
app/composables/useCmsAuth.ts        CMS session: identity plus active cms_users row
app/middleware/cms-auth.ts           Named gate for /admin pages
app/pages/admin/                     Login and a proof page. Not the admin shell
server/api/cms/forms/[key].post.ts   Form submit route (the only server route so far)
server/cms/supabase.ts               Server-only client with the secret key. Never imported by app/
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

### Local development (Docker)

The local Supabase stack runs in Docker, so Docker is required for this path. It is the
default for working on Core and for integration tests against a real database. Deploying a
Client Project never needs Docker.

```bash
supabase start        # prints the URL and keys, also available via `supabase status`
supabase db reset     # applies the Core migrations
```

The playground reads `playground/.env`, so copy the values there when working in this repository.

### Hosted project (no Docker)

A hosted Supabase project works the same way, for production and as a development backend
when Docker is not available. Use a separate project for development, never the production
one. Integration tests still need the local stack.

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

### Secret key (forms)

Form submissions are written by a server route of Core with the backend's secret key. Set it **at
runtime, on the server only**:

```bash
NUXT_CMS_SUPABASE_SECRET=   # or SUPABASE_SECRET
```

Locally it is the `SECRET_KEY` from `supabase status`; in a hosted project, Project Settings → API keys.
It is never read at build time and never reaches the browser. Without it, forms answer "unavailable".

### Visitor address (form limits)

Each form has a ceiling for all visitors together (50 attempts per 10 minutes) and, when the server
knows the visitor address, limits per visitor (5 per form, 10 across forms). A client can write any
header, so Core trusts none by default. Set the source at runtime with `NUXT_CMS_CLIENT_ADDRESS`:

| Value | When |
|---|---|
| `auto` (default) | `vercel` on Vercel, `socket` in `nuxi dev`, otherwise `none` |
| `none` | No trusted address: only the ceiling of the form counts |
| `socket` | The Node server takes connections from visitors directly, with no proxy in front |
| `vercel` | Vercel: it overwrites `X-Forwarded-For` with the visitor address |
| `cloudflare` | `CF-Connecting-IP`, **only** when the origin accepts nothing but Cloudflare (firewall or Authenticated Origin Pulls) |
| `proxy` / `proxy:N` | N reverse proxies you run (nginx with `$proxy_add_x_forwarded_for`): the N-th `X-Forwarded-For` entry from the right, believed only when the connection comes from a loopback or private address |

Behind a proxy, do not use `socket`: every visitor would have the proxy's address and share one limit.
With `proxy`, the app port must be reachable only by the proxy (bind to 127.0.0.1 or an internal network;
do not publish it with `docker -p` or a Kubernetes NodePort): a request that skips the proxy from a private
address would be believed. With `vercel`, do not put another proxy in front (Cloudflare with proxied DNS):
visitors would share the address of that proxy.

**The ceiling can be used up on purpose.** With `none` (the default outside Vercel) one sender can make 50
attempts in 10 minutes and the form refuses everyone until the window ends; with a trusted source, a sender
who controls many addresses (an IPv6 prefix larger than /64) can do the same. The server logs a warning the
first time a form reaches its ceiling in a window. Set a trusted source, and put bot protection at the edge
(the platform's firewall or WAF) for a site that draws spam. The limits are fixed in this version.
IPv6 addresses count by their /64 network. A request without a trusted address never shares a
visitor bucket with others; it counts only against the ceiling of the form. The server logs a warning
once when no source is set. Other platforms (Netlify and the like): use `none` until their header is
confirmed.

Submissions are personal data and Core keeps them until someone deletes them: there is no automatic
retention. Decide how long the site keeps them (archive and spam included) and delete them by hand or
with a scheduled job. The address is never stored; rate-limit buckets hold only an HMAC pseudonym, not linked
to a submission, and are removed by later submissions once older than a day.

### Form events (notifications)

Core stores submissions and shows them in the admin inbox; it sends no notifications. A site sends its own
(email, Telegram, a CRM…) from a Nitro server plugin on `cms:forms:submitted`:

```ts
// server/plugins/form-notifications.ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('cms:forms:submitted', async ({ form, submissionId, values, locale, pagePath }) => {
    const { leadsApiKey } = useRuntimeConfig() // server-only, from the site's env
    await $fetch('https://api.example-mail.com/send', { method: 'POST', headers: { authorization: `Bearer ${leadsApiKey}` }, body: { … } })
  })
})
```

- **When.** Once per new submission, after it is stored. Not for a retry of the same sending, the honeypot,
  limits, a disabled form or values that were refused.
- **At most once, best effort.** The answer to the visitor waits for the handlers **at most 3 seconds** and
  is `ok` whatever they do. After that a handler is not cancelled: on a Node server it finishes in the
  background, on serverless hosting (Vercel) it may be stopped. There is no retry; the inbox is the source of
  truth. Keep handlers short (one API call); a slow handler delays the form's answer up to the limit.
- **Not for guaranteed delivery.** When a lead must reach a system for sure (a CRM, billing), this hook is
  not enough: use a durable mechanism with retries on the site's side, such as a transactional outbox and
  a worker. The hook only gives a best-effort signal.
- **Failures.** A handler that throws does not stop the others; Core logs the form key and the error kind,
  never the values or the message.
- **Personal data.** `values` are what the visitor sent: do not log them. Sending them to a provider makes it
  a processor of personal data (a DPA for sites in the EU / UK). Credentials belong in the site's server-only
  runtime config, never in `public` or `cms.config.ts`.
- **Read-only.** Do not change `form` (shared by all requests) or `values`.

## Reading content

> How pages and content are built on a Client Project (static pages, entries with a route, Content types, selection,
> translations, with examples): [docs/guides/pages-and-content.md](docs/guides/pages-and-content.md).

Data access always goes through a repository, so components never talk to the backend directly:

```vue
<script setup lang="ts">
const { settings, pending, error, refresh } = useSiteSettings()
</script>
```

Pages are code-defined: the route and the structure live in the Client Project, and the CMS
stores only the published content values, addressed by a page `key`. `page` is empty (`undefined`
while loading, `null` when the page has no published content yet), so the template renders its own
defaults:

```vue
<script setup lang="ts">
const { page } = useCmsPage('home')
const hero = computed(() => (page.value?.content.hero ?? {}) as { title?: string })
</script>

<template>
  <h1>{{ hero.title ?? 'Default title' }}</h1>
</template>
```

The content locale is `defaultLocale` in `cms.config.ts` (`'en'` by default) until localization
arrives. It must be a canonical BCP 47 tag (`uk`, `en-GB`); an invalid value falls back to the
default with a build warning.

Errors are `CmsDataError` with a `code` of `not_found`, `permission_denied` or `unknown`.
Backend-specific errors never reach the UI. An error that passed through `useAsyncData` (SSR, or
revived from the payload) is a `NuxtError` instead; its code is kept in `error.data.cmsCode`.

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
npm install         # links the layer into playground and prepares types
npm run dev         # http://localhost:3000
npm run build
npm run preview
npm test            # Vitest
npm run test:db     # pgTAP smoke test of the migrations (local Supabase, Docker)
npm run gen:types   # regenerate app/data/database.types.ts from the local schema
npm run typecheck   # vue-tsc over the playground (includes the layer) and tsc over src/
npm run lint        # ESLint
```

## Admin translations

The admin UI is translated with `useAdminI18n()` over `app/admin/locales/*.json` (keys under `cms.*`),
not with `@nuxtjs/i18n`. Core therefore adds no locales, routes or vue-i18n to the Client
Project, which is free to use its own i18n setup. The admin language is stored in the
`cms_locale` cookie.
