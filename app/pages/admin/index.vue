<script setup lang="ts">
import { CMS_PERMISSIONS } from '../../auth/permissions'

definePageMeta({
  middleware: ['cms-auth'],
})

const { t } = useI18n()
const { user, ensure, logout } = useCmsAuth()
const { can } = usePermissions()

await ensure()

async function onLogout() {
  await logout()
  await navigateTo('/admin/login')
}
</script>

<template>
  <main>
    <AdminLocaleSwitch />
    <h1>{{ t('admin.home.title') }}</h1>
    <p v-if="user">
      {{ t('admin.home.signedIn', { email: user.email, role: user.role }) }}
    </p>
    <ul>
      <li
        v-for="permission in CMS_PERMISSIONS"
        :key="permission"
      >
        {{ permission }} = {{ can(permission) ? t('admin.home.yes') : t('admin.home.no') }}
      </li>
    </ul>
    <button
      type="button"
      @click="onLogout"
    >
      {{ t('admin.home.logout') }}
    </button>
  </main>
</template>
