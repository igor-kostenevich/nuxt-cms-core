<script setup lang="ts">
definePageMeta({
  middleware: ['cms-auth'],
})

const { t } = useI18n()
const { user, ensure } = useCmsAuth()

await ensure()
</script>

<template>
  <AdminShell :title="t('admin.shell.nav.dashboard')">
    <p
      v-if="user"
      class="home__identity"
    >
      {{ t('admin.home.signedIn', { email: user.email, role: user.role }) }}
    </p>
  </AdminShell>
</template>

<style scoped>
.home__identity {
  margin: 0;
}
</style>
