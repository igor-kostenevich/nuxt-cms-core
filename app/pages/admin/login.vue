<script setup lang="ts">
import { useForm } from 'vee-validate'
import { adminErrorKey } from '../../admin/error-key'
import { safeRedirect } from '../../auth/redirect'
import { useAdminI18n } from '../../admin/useAdminI18n'
import { useAdminValidation } from '../../admin/useAdminValidation'

const { t } = useAdminI18n()
const route = useRoute()
const { all, required, email: emailRule, password: passwordRule } = useAdminValidation()
const submitting = ref(false)
const message = ref('')

const { user, ensure, login, error } = useCmsAuth()

// The login form is the way out of a broken session, so a session read error
// must not fail the page. It is shown in the alert above the form instead.
await ensure().catch(() => undefined)

if (user.value) {
  await navigateTo(safeRedirect(route.query.redirect))
}

const { handleSubmit, defineField, errors, submitCount } = useForm({
  initialValues: {
    email: '',
    password: '',
  },
  validationSchema: {
    email: all(required(), emailRule()),
    password: all(required(), passwordRule()),
  },
})

const fieldOptions = () => ({
  validateOnBlur: submitCount.value > 0,
  validateOnChange: false,
  validateOnInput: false,
  validateOnModelUpdate: false,
})

const [email, emailProps] = defineField('email', fieldOptions)
const [password, passwordProps] = defineField('password', fieldOptions)

const submit = handleSubmit(async (values) => {
  submitting.value = true
  message.value = ''

  try {
    const result = await login(values.email.trim(), values.password)

    if (!result.ok) {
      message.value = t('cms.login.invalid')
      return
    }

    await navigateTo(safeRedirect(route.query.redirect))
  } catch (cause) {
    message.value = t(adminErrorKey(cause))
  } finally {
    submitting.value = false
  }
})

function onSubmit(event: Event) {
  message.value = ''
  return submit(event)
}

const devLogins = import.meta.dev
  ? [
      { role: 'owner', email: 'owner@example.com' },
      { role: 'admin', email: 'admin@example.com' },
      { role: 'editor', email: 'editor@example.com' },
    ]
  : []

async function onDevLogin(accountEmail: string) {
  if (!import.meta.dev) {
    return
  }

  email.value = accountEmail
  password.value = 'local-dev-password'
  await submit()
}
</script>

<template>
  <AdminRoot class="login">
    <div class="login__panel">
      <div class="login__brand">
        <div
          class="login__mark"
          aria-hidden="true"
        >
          {{ t('cms.common.mark') }}
        </div>
        <p class="login__caption">
          {{ t('cms.common.caption') }}
        </p>
      </div>

      <section class="login__card">
        <h1 class="login__title">
          {{ t('cms.login.title') }}
        </h1>

        <form
          class="login__form"
          method="post"
          novalidate
          @submit="onSubmit"
        >
          <AdminAlert
            v-if="error"
            tone="danger"
            :title="t(adminErrorKey(error))"
          />
          <AdminAlert
            v-if="message"
            tone="danger"
            :title="message"
          />

          <AdminInput
            v-model="email"
            v-bind="emailProps"
            :label="t('cms.login.email')"
            :placeholder="t('cms.common.emailPlaceholder')"
            :error="errors.email"
            :disabled="submitting"
            name="email"
            type="email"
            autocomplete="username"
            required
          >
            <template #leading>
              <Icon
                name="lucide:mail"
                aria-hidden="true"
              />
            </template>
          </AdminInput>

          <AdminInput
            v-model="password"
            v-bind="passwordProps"
            :label="t('cms.login.password')"
            :placeholder="t('cms.login.passwordPlaceholder')"
            :error="errors.password"
            :disabled="submitting"
            name="password"
            type="password"
            autocomplete="current-password"
            required
          >
            <template #leading>
              <Icon
                name="lucide:lock"
                aria-hidden="true"
              />
            </template>
          </AdminInput>

          <AdminButton
            class="login__submit"
            type="submit"
            variant="primary"
            size="md"
            :loading="submitting"
          >
            {{ t('cms.login.submit') }}
          </AdminButton>

          <div
            v-if="devLogins.length"
            class="login__dev"
          >
            <p class="login__dev-label">
              Dev
            </p>
            <div class="login__dev-actions">
              <AdminButton
                v-for="account in devLogins"
                :key="account.email"
                type="button"
                variant="secondary"
                size="sm"
                :disabled="submitting"
                @click="onDevLogin(account.email)"
              >
                {{ t(`cms.roles.${account.role}`) }}
              </AdminButton>
            </div>
          </div>
        </form>
      </section>
    </div>
  </AdminRoot>
</template>

<style scoped>
.login {
  position: relative;
  display: flex;
  justify-content: center;
  min-height: 100vh;
  padding: calc(var(--cms-space-16) * 2) var(--cms-space-4) var(--cms-space-12);
  overflow: hidden;
}

/* Decorative background shapes. Their geometry belongs to this screen only, so it is not tokenised. */
.login::before,
.login::after {
  content: "";
  position: absolute;
  border-radius: var(--cms-radius-full);
  filter: blur(var(--cms-space-16));
  pointer-events: none;
}

.login::before {
  top: 270px;
  left: -96px;
  width: 288px;
  height: 288px;
  background: var(--cms-primary-subtle);
  opacity: 0.7;
}

.login::after {
  top: 552px;
  right: -80px;
  width: 256px;
  height: 256px;
  background: var(--cms-neutral-100);
  opacity: 0.9;
}

.login__panel {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--cms-space-6);
  width: min(100%, 28rem);
}

.login__brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--cms-space-3);
}

.login__mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: var(--cms-radius-lg);
  background: var(--cms-primary);
  box-shadow: var(--cms-shadow-sm);
  color: var(--cms-primary-foreground);
  font-size: var(--cms-type-h3-size);
  font-weight: var(--cms-type-h3-weight);
  line-height: var(--cms-type-h3-line);
}

.login__caption {
  margin: 0;
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-helper-size);
  font-weight: var(--cms-type-helper-weight);
  line-height: var(--cms-type-helper-line);
  text-align: center;
}

.login__card {
  width: 100%;
  padding: var(--cms-space-6);
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-lg);
  background: var(--cms-card);
  box-shadow: var(--cms-shadow-md);
}

.login__title {
  margin: 0 0 var(--cms-space-5);
  font-size: var(--cms-type-h1-size);
  font-weight: var(--cms-type-h1-weight);
  line-height: var(--cms-type-h1-line);
}

.login__form {
  display: flex;
  flex-direction: column;
  gap: var(--cms-space-5);
}

.login__form :deep(.login__submit) {
  width: 100%;
  margin-top: var(--cms-space-1);
}

.login__dev {
  display: flex;
  flex-direction: column;
  gap: var(--cms-space-2);
  padding-top: var(--cms-space-4);
  border-top: var(--cms-border-width) solid var(--cms-border);
}

.login__dev-label {
  margin: 0;
  color: var(--cms-text-tertiary);
  font-size: var(--cms-type-helper-size);
  font-weight: var(--cms-type-helper-weight);
  line-height: var(--cms-type-helper-line);
}

.login__dev-actions {
  display: flex;
  gap: var(--cms-space-2);
}

.login__dev-actions :deep(.admin-button) {
  flex: 1;
}
</style>
