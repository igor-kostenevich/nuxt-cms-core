<script setup lang="ts">
import { adminErrorKey } from '../../admin/error-key'
import { safeRedirect } from '../../auth/redirect'

const { t } = useI18n()
const route = useRoute()
const email = ref('')
const password = ref('')
const submitting = ref(false)
const message = ref('')

const { user, ensure, login, error } = useCmsAuth()

await ensure()

if (user.value) {
  await navigateTo(safeRedirect(route.query.redirect))
}

async function onSubmit() {
  submitting.value = true
  message.value = ''

  try {
    const result = await login(email.value.trim(), password.value)

    if (!result.ok) {
      message.value = t('admin.login.invalid')
      return
    }

    await navigateTo(safeRedirect(route.query.redirect))
  } catch (cause) {
    message.value = t(adminErrorKey(cause))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main>
    <AdminLocaleSwitch />
    <h1>{{ t('admin.login.title') }}</h1>
    <p v-if="error">{{ t(adminErrorKey(error)) }}</p>

    <form
      method="post"
      @submit.prevent="onSubmit"
    >
      <label>
        {{ t('admin.login.email') }}
        <input
          v-model="email"
          name="email"
          type="email"
          autocomplete="username"
          required
        >
      </label>
      <label>
        {{ t('admin.login.password') }}
        <input
          v-model="password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
        >
      </label>
      <button
        type="submit"
        :disabled="submitting"
      >
        {{ t('admin.login.submit') }}
      </button>
    </form>

    <p v-if="message">{{ message }}</p>
  </main>
</template>
