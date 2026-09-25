<script setup lang="ts">
const { version, config } = useCms()
const { settings, pending, error, refresh } = useSiteSettings()
</script>

<template>
  <main>
    <h1>nuxt-cms-core playground</h1>
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
  </main>
</template>
