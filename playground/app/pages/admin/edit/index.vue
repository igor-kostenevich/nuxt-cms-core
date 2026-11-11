<script setup lang="ts">
definePageMeta({
  middleware: ['cms-auth'],
})

const { user, ensure } = useCmsAuth()

await ensure()
</script>

<template>
  <AdminShell title="Edit">
    <p
      v-if="user"
      class="edit__identity"
    >
      Signed in as {{ user.email }} ({{ user.role }})
    </p>
  </AdminShell>
</template>

<style scoped>
.edit__identity {
  margin: 0;
}
</style>
