<script setup lang="ts">
definePageMeta({
  middleware: ['cms-auth'],
})

const { user, ensure } = useCmsAuth()

await ensure()
</script>

<template>
  <main>
    <h1>Edit</h1>
    <p v-if="user">
      Signed in as {{ user.email }} ({{ user.role }})
    </p>
  </main>
</template>
