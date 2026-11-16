<script setup lang="ts">
// Playground diagnostics: Core version, resolved config and site settings.
const { version, config } = useCms()
const { settings, pending, error, refresh } = useSiteSettings()
</script>

<template>
  <main
    id="main"
    class="container dev"
  >
    <h1>Diagnostics</h1>
    <p>Core version: {{ version }}</p>
    <pre>{{ config }}</pre>

    <h2>Site settings</h2>
    <p v-if="pending">
      Loading…
    </p>
    <p v-else-if="error">
      {{ error.message }}
    </p>
    <pre v-else>{{ settings }}</pre>

    <button
      type="button"
      class="btn btn--dark"
      @click="refresh()"
    >
      Refresh
    </button>
  </main>
</template>

<style scoped>
.dev {
  padding: 64px 0;
}

pre {
  overflow: auto;
  padding: 16px;
  border-radius: 12px;
  background: #fff;
}
</style>
