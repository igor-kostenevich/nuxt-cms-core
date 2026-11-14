<script setup lang="ts">
interface HeroContent {
  title?: string
  lead?: string
}

const { version, config } = useCms()
const { settings, pending, error, refresh } = useSiteSettings()
const { page: home, error: homeError } = useCmsPage('home')

// The page owns its structure and defaults; the CMS only fills in values.
const hero = computed(() => (home.value?.content.hero ?? {}) as HeroContent)
</script>

<template>
  <main>
    <section>
      <h1>{{ hero.title ?? 'nuxt-cms-core playground' }}</h1>
      <p>{{ hero.lead ?? 'Default lead from the page code.' }}</p>
      <p v-if="homeError">{{ homeError.message }}</p>
    </section>

    <p>Core version: {{ version }}</p>
    <pre>{{ config }}</pre>

    <h2>Site settings</h2>
    <p v-if="pending">Loading…</p>
    <p v-else-if="error">{{ error.message }}</p>
    <pre v-else>{{ settings }}</pre>

    <button
      type="button"
      @click="refresh()"
    >
      Refresh
    </button>

    <p>
      <NuxtLink to="/about">About</NuxtLink>
      ·
      <NuxtLink to="/admin" :prefetch="false">Admin</NuxtLink>
    </p>
  </main>
</template>
