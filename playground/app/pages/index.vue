<script setup lang="ts">
import type { CmsButtonValue, CmsRichTextValue } from 'nuxt-cms-core/types'

interface HomeContent {
  hero?: {
    title?: string
    lead?: CmsRichTextValue
    cta?: CmsButtonValue
  }
}

const { version, config } = useCms()
const { settings, pending, error, refresh } = useSiteSettings()
const { page: home, error: homeError } = useCmsPage('home')

// The page owns its structure and defaults (slots); the CMS only fills in values.
const hero = computed(() => (home.value?.content as HomeContent | undefined)?.hero ?? {})
</script>

<template>
  <main>
    <section>
      <CmsImage
        field-key="hero.image"
        src="/placeholder.svg"
        width="320"
        height="120"
      />
      <CmsText
        :value="hero.title"
        field-key="hero.title"
        tag="h1"
      >
        nuxt-cms-core playground
      </CmsText>
      <CmsRichText
        :value="hero.lead"
        field-key="hero.lead"
        tag="p"
        inline
      >
        Default lead from the page code.
      </CmsRichText>
      <CmsButton
        :value="hero.cta"
        field-key="hero.cta"
        href="/about"
      >
        About us
      </CmsButton>
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
