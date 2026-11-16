<script setup lang="ts">
// Site frame of the playground: header and footer are plain code (global
// content is read-only in Edit Mode, MASTER_PLAN D-19). Its links navigate
// normally, inside Edit Mode too.
const nav = [
  { label: 'Home', to: '/' },
  { label: 'About', to: '/about' },
  { label: 'Services', to: '/#services' },
  { label: 'Work', to: '/#work' },
  { label: 'Contact', to: '/#contact' },
]

const year = new Date().getFullYear()
</script>

<template>
  <div class="site">
    <a
      href="#main"
      class="skip-link"
    >Skip to content</a>
    <header class="site-header">
      <div class="container site-header__inner">
        <NuxtLink
          to="/"
          class="logo"
        >
          Luminary
        </NuxtLink>
        <nav
          class="site-nav"
          aria-label="Main"
        >
          <NuxtLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>
        <NuxtLink
          to="/#contact"
          class="btn btn--dark"
        >
          Get in touch
        </NuxtLink>
      </div>
    </header>

    <slot />

    <footer class="site-footer">
      <div class="container site-footer__inner">
        <span>© {{ year }} Luminary Studio</span>
        <nav aria-label="Footer">
          <NuxtLink to="/about">
            About
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
