<script setup lang="ts">
definePageMeta({
  middleware: ['cms-auth'],
})

const { t } = useAdminI18n()
const { user, ensure } = useCmsAuth()

await ensure()
</script>

<template>
  <AdminShell :title="t('cms.shell.nav.dashboard')">
    <p
      v-if="user"
      class="home__identity"
    >
      {{ t('cms.home.signedIn', { email: user.email, role: user.role }) }}
    </p>
  </AdminShell>
</template>

<style scoped>
.home__identity {
  margin: 0;
}
</style>
