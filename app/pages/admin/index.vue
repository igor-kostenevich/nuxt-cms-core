<script setup lang="ts">
import { useAdminI18n } from '../../admin/useAdminI18n'
definePageMeta({
  // The Client Project's layouts frame the site, not the admin.
  layout: false,
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
      {{ t('cms.home.signedIn', { email: user.email, role: t(`cms.roles.${user.role}`) }) }}
    </p>
  </AdminShell>
</template>

<style scoped>
.home__identity {
  margin: 0;
}
</style>
