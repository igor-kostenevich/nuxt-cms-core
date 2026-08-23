<script setup lang="ts">
const { version, config } = useCms()
</script>

<template>
  <main>
    <h1>nuxt-cms-core playground</h1>
    <p>Core version: {{ version }}</p>
    <pre>{{ config }}</pre>
  </main>
</template>
