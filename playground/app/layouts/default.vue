<script setup lang="ts">
// Site frame of the playground: header and footer are plain code (global
// content is read-only in Edit Mode, MASTER_PLAN D-19). Its links navigate
// normally, inside Edit Mode too.
// Labels are site texts (cms.texts.ts): changed and translated in the admin.
const { t } = useCmsText()
const nav = [
  { label: 'nav.home', to: '/' },
  { label: 'nav.about', to: '/about' },
  { label: 'nav.services', to: '/#services' },
  { label: 'nav.work', to: '/#work' },
  { label: 'nav.contact', to: '/#contact' },
]

const year = new Date().getFullYear()

// Languages (010): the routing is this site's own (prefix except default).
const route = useRoute()
const locale = useCmsLocale()
const to = useLocalePath()
const { languages, defaultLocale, multilingual, ready } = useCmsLanguages()

await ready

// `/de/...` for a language the site does not serve, or `/uk/...` for the
// default one (it lives without a prefix): not a page of this site. Edit Mode
// renders the layout under /admin, where the route has no locale.
const prefix = route.params.locale

if (typeof prefix === 'string' && prefix
  && (prefix === defaultLocale.value || !languages.value.some(language => language.code === prefix))) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
}

/** The current page in another language. */
function switchTo(code: string) {
  const neutral = route.path.replace(/^\/[a-z]{2,3}(-[A-Za-z0-9]+)?(?=\/|$)/, (match) =>
    languages.value.some(language => `/${language.code}` === match) ? '' : match) || '/'
  return localePath(neutral, code === defaultLocale.value ? null : code)
}

const current = computed(() => locale.value ?? defaultLocale.value)

// Settings → Brand (009): the logo and favicon are media the CMS manages.
// Without them the site keeps its own wordmark and the default favicon.
const { settings } = useSiteSettings()
const logo = computed(() => settings.value?.logo ?? null)

useHead({
  link: computed(() => (settings.value?.favicon
    ? [{ rel: 'icon', href: settings.value.favicon.url, type: settings.value.favicon.mime }]
    : [])),
})
</script>

<template>
  <div class="site">
    <a
      href="#main"
      class="skip-link"
    >{{ t('header.skip') }}</a>
    <header class="site-header">
      <div class="container site-header__inner">
        <NuxtLink
          :to="to('/')"
          class="logo"
        >
          <img
            v-if="logo"
            :src="logo.url"
            :width="logo.width ?? undefined"
            :height="logo.height ?? undefined"
            alt="Luminary"
            class="logo__image"
          >
          <template v-else>Luminary</template>
        </NuxtLink>
        <nav
          class="site-nav"
          aria-label="Main"
        >
          <NuxtLink
            v-for="item in nav"
            :key="item.to"
            :to="to(item.to)"
          >
            {{ t(item.label) }}
          </NuxtLink>
        </nav>
        <nav
          v-if="multilingual"
          class="lang-switch"
          aria-label="Language"
        >
          <NuxtLink
            v-for="language in languages"
            :key="language.code"
            :to="switchTo(language.code)"
            :hreflang="language.code"
            :lang="language.code"
            :aria-current="language.code === current ? 'true' : undefined"
            :title="language.nativeName"
          >
            {{ language.code.toUpperCase() }}
          </NuxtLink>
        </nav>
        <NuxtLink
          :to="to('/#contact')"
          class="btn btn--dark"
        >
          {{ t('header.cta') }}
        </NuxtLink>
      </div>
    </header>

    <slot />

    <footer class="site-footer">
      <div class="container site-footer__inner">
        <span>{{ t('footer.copyright', { year }) }}</span>
        <nav aria-label="Footer">
          <NuxtLink :to="to('/about')">
            {{ t('footer.about') }}
          </NuxtLink>
          <NuxtLink to="/dev">
            Diagnostics
          </NuxtLink>
          <NuxtLink
            to="/admin"
            :prefetch="false"
          >
            Admin
          </NuxtLink>
        </nav>
      </div>
    </footer>
  </div>
</template>

<style>
.lang-switch {
  display: flex;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
}

.lang-switch a {
  padding: 4px 8px;
  border-radius: 999px;
  color: inherit;
  text-decoration: none;
  opacity: 0.6;
}

.lang-switch a[aria-current="true"] {
  background: rgb(0 0 0 / 8%);
  opacity: 1;
}

:root {
  --ink: #0c0c0f;
  --ink-soft: #4a4a55;
  --paper: #fafaf7;
  --sand: #f1ece4;
  --accent: #ff5a36;
  --radius: 18px;
  --font: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

html {
  /* Anchors land below the sticky header. */
  scroll-padding-top: 96px;
}

@media (prefers-reduced-motion: no-preference) {
  html {
    scroll-behavior: smooth;
  }
}

.skip-link {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 100;
  padding: 8px 16px;
  border-radius: 8px;
  background: var(--ink);
  color: #fff;
  transform: translateY(-200%);
}

.skip-link:focus {
  transform: none;
}

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font);
  font-size: 17px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

img {
  max-width: 100%;
}

a {
  color: inherit;
}

.container {
  width: min(1180px, 100% - 48px);
  margin-inline: auto;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
  padding: 0 24px;
  border: 1.5px solid transparent;
  border-radius: 999px;
  font: 600 16px/1 var(--font);
  text-decoration: none;
  cursor: pointer;
}

@media (prefers-reduced-motion: no-preference) {
  .btn {
    transition: transform 160ms ease, background-color 160ms ease;
  }

  .btn:hover {
    transform: translateY(-1px);
  }
}

.btn--dark {
  background: var(--ink);
  color: #fff;
}

.btn--accent {
  background: var(--accent);
  color: #fff;
}

.btn--ghost {
  border-color: currentColor;
  background: transparent;
}

.eyebrow {
  margin: 0 0 16px;
  color: var(--accent);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.section {
  padding: 112px 0;
  scroll-margin-top: 80px;
}

.section-title {
  max-width: 720px;
  margin: 0 0 48px;
  font-size: clamp(32px, 4vw, 48px);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.site-header {
  position: sticky;
  top: 0;
  z-index: 10;
  border-bottom: 1px solid rgb(12 12 15 / 8%);
  background: rgb(250 250 247 / 85%);
  backdrop-filter: blur(12px);
}

.site-header__inner {
  display: flex;
  align-items: center;
  gap: 40px;
  height: 80px;
}

.logo {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.03em;
  text-decoration: none;
}

.logo__image {
  display: block;
  width: auto;
  max-width: 180px;
  height: 36px;
  object-fit: contain;
}

.site-nav {
  display: flex;
  gap: 32px;
  margin-right: auto;
}

.site-nav a {
  color: var(--ink-soft);
  font-weight: 500;
  text-decoration: none;
}

.site-nav a:hover,
.site-nav a.router-link-exact-active {
  color: var(--ink);
}

.site-footer {
  padding: 40px 0;
  border-top: 1px solid rgb(12 12 15 / 8%);
  color: var(--ink-soft);
  font-size: 15px;
}

.site-footer__inner {
  display: flex;
  justify-content: space-between;
  gap: 24px;
}

.site-footer nav {
  display: flex;
  gap: 24px;
}

@media (max-width: 860px) {
  .site-nav {
    display: none;
  }

  .site-header__inner {
    justify-content: space-between;
  }

  .section {
    padding: 72px 0;
  }
}
</style>
