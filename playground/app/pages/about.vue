<script setup lang="ts">
interface AboutContent {
  title?: string
  body?: string
}

// No `about` row is seeded: the page renders its defaults, not an error.
const { page, error } = useCmsPage('about')
const about = computed(() => (page.value?.content ?? {}) as AboutContent)
</script>

<template>
  <main>
    <h1>{{ about.title ?? 'About us' }}</h1>
    <p>{{ about.body ?? 'Default text from the page code.' }}</p>
    <p v-if="error">{{ error.message }}</p>
    <p>
      <NuxtLink to="/">Home</NuxtLink>
    </p>
  </main>
</template>
