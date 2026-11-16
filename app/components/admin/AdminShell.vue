<script setup lang="ts">
import { useAdminI18n } from '../../admin/useAdminI18n'

defineProps<{
  title: string
}>()

const { t } = useAdminI18n()
const route = useRoute()
const { logout } = useCmsAuth()
const { settings } = useSiteSettings()
const logoutError = ref('')

const siteName = computed(() => settings.value?.siteName || t('cms.common.caption'))

const groups = [
  {
    label: 'cms.shell.groups.content',
    items: [
      { label: 'cms.shell.nav.pages', icon: 'lucide:file' },
      { label: 'cms.shell.nav.media', icon: 'lucide:image' },
      { label: 'cms.shell.nav.forms', icon: 'lucide:clipboard-list' },
    ],
  },
  {
    label: 'cms.shell.groups.website',
    items: [
      { label: 'cms.shell.nav.analytics', icon: 'lucide:chart-column' },
      { label: 'cms.shell.nav.activity', icon: 'lucide:activity' },
      { label: 'cms.shell.nav.integrations', icon: 'lucide:plug' },
    ],
  },
  {
    label: 'cms.shell.groups.system',
    items: [
      { label: 'cms.shell.nav.users', icon: 'lucide:users' },
      { label: 'cms.shell.nav.secrets', icon: 'lucide:key-round' },
    ],
  },
] as const

function isCurrent(path: string) {
  if (path === '/admin') {
    return route.path === '/admin'
  }

  return route.path === path || route.path.startsWith(`${path}/`)
}

async function onLogout() {
  logoutError.value = ''

  try {
    await logout()
  } catch {
    // The session is still there, so /admin/login would send the user back.
    logoutError.value = t('cms.shell.logoutFailed')
    return
  }

  await navigateTo('/admin/login')
}
</script>

<template>
  <AdminRoot class="shell">
    <aside class="shell__sidebar">
      <div class="shell__brand">
        <span
          class="shell__mark"
          aria-hidden="true"
        >
          {{ t('cms.common.mark') }}
        </span>
        <span class="shell__site">{{ siteName }}</span>
      </div>

      <nav
        class="shell__nav"
        :aria-label="t('cms.shell.navLabel')"
      >
        <NuxtLink
          to="/admin"
          class="shell__item"
          :class="{ 'shell__item--current': isCurrent('/admin') }"
          :aria-current="isCurrent('/admin') ? 'page' : undefined"
        >
          <Icon
            name="lucide:layout-dashboard"
            aria-hidden="true"
          />
          <span>{{ t('cms.shell.nav.dashboard') }}</span>
        </NuxtLink>
        <NuxtLink
          to="/admin/edit/"
          class="shell__item"
          :prefetch="false"
        >
          <Icon
            name="lucide:square-pen"
            aria-hidden="true"
          />
          <span>{{ t('cms.shell.nav.editSite') }}</span>
        </NuxtLink>

        <div
          v-for="group in groups"
          :key="group.label"
          class="shell__group"
        >
          <p class="shell__group-label">
            {{ t(group.label) }}
          </p>
          <span
            v-for="item in group.items"
            :key="item.label"
            class="shell__item shell__item--stub"
          >
            <Icon
              :name="item.icon"
              aria-hidden="true"
            />
            <span>{{ t(item.label) }}</span>
            <span class="shell__visually-hidden">({{ t('cms.shell.soon') }})</span>
          </span>
        </div>
      </nav>

      <div class="shell__foot">
        <NuxtLink
          to="/admin/settings"
          class="shell__item"
          :class="{ 'shell__item--current': isCurrent('/admin/settings') }"
          :aria-current="isCurrent('/admin/settings') ? 'page' : undefined"
        >
          <Icon
            name="lucide:settings"
            aria-hidden="true"
          />
          <span>{{ t('cms.shell.nav.settings') }}</span>
        </NuxtLink>
      </div>
    </aside>

    <div class="shell__main">
      <header class="shell__header">
        <h1 class="shell__title">
          {{ title }}
        </h1>
        <div class="shell__tools">
          <AdminButton
            to="/"
            variant="ghost"
            size="sm"
          >
            {{ t('cms.shell.viewSite') }}
          </AdminButton>
          <div class="shell__locale">
            <AdminLocaleSwitch />
          </div>
          <AdminButton
            type="button"
            variant="ghost"
            size="sm"
            @click="onLogout"
          >
            {{ t('cms.common.logout') }}
          </AdminButton>
        </div>
      </header>
      <div class="shell__content">
        <AdminAlert
          v-if="logoutError"
          class="shell__alert"
          tone="danger"
          :title="logoutError"
          dismissible
          @dismiss="logoutError = ''"
        />
        <slot />
      </div>
    </div>
  </AdminRoot>
</template>

<style scoped>
.shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.shell__sidebar {
  display: flex;
  flex: none;
  flex-direction: column;
  width: var(--cms-sidebar-width);
  height: 100%;
  background: var(--cms-neutral-900);
  color: var(--cms-neutral-0);
}

.shell__brand {
  display: flex;
  align-items: center;
  gap: var(--cms-space-2);
  height: var(--cms-shell-bar);
  padding: 0 var(--cms-space-4);
  border-bottom: var(--cms-border-width) solid var(--cms-neutral-800);
}

.shell__mark {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--cms-space-6);
  height: var(--cms-space-6);
  border-radius: var(--cms-radius-sm);
  background: var(--cms-primary);
  color: var(--cms-primary-foreground);
  font-size: var(--cms-type-micro-size);
  font-weight: 700;
  line-height: 1;
}

.shell__site {
  overflow: hidden;
  font-size: var(--cms-type-body-small-size);
  font-weight: var(--cms-type-h4-weight);
  line-height: var(--cms-type-body-small-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shell__nav {
  flex: 1;
  min-height: 0;
  padding: var(--cms-space-2) 0;
  overflow: auto;
}

.shell__group {
  padding-top: var(--cms-space-3);
}

.shell__group-label {
  margin: 0;
  padding: var(--cms-space-2) var(--cms-space-4) var(--cms-space-1);
  /* neutral-500 on neutral-900 is 4.9:1, enough for small text (WCAG AA). */
  color: var(--cms-neutral-500);
  font-size: var(--cms-type-caption-size);
  font-weight: var(--cms-type-label-small-weight);
  line-height: var(--cms-type-caption-line);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.shell__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--cms-space-3);
  width: 100%;
  height: var(--cms-control-md);
  padding: 0 var(--cms-space-3);
  border-radius: var(--cms-radius-sm);
  color: rgb(255 255 255 / 72%);
  font-size: var(--cms-type-body-size);
  font-weight: var(--cms-type-body-weight);
  line-height: var(--cms-type-label-large-line);
  text-decoration: none;
}

.shell__item :deep(svg) {
  flex: none;
  width: var(--cms-icon-size);
  height: var(--cms-icon-size);
}

.shell__item:hover {
  background: var(--cms-sidebar-active);
  color: var(--cms-neutral-0);
}

.shell__item:focus-visible {
  outline: 2px solid var(--cms-primary);
  outline-offset: -2px;
}

.shell__item--current {
  background: var(--cms-sidebar-active);
  color: var(--cms-neutral-0);
  font-weight: var(--cms-type-label-weight);
}

.shell__item--current::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 3px;
  background: var(--cms-primary);
}

/* Sections without a screen yet: plain text, not links, and visibly dimmer. */
.shell__item--stub {
  color: var(--cms-neutral-500);
  cursor: default;
}

.shell__item--stub:hover {
  background: transparent;
  color: var(--cms-neutral-500);
}

.shell__visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.shell__alert {
  margin-bottom: var(--cms-space-4);
}

.shell__foot {
  padding: var(--cms-space-1) 0;
  border-top: var(--cms-border-width) solid var(--cms-neutral-800);
}

.shell__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  overflow: auto;
}

.shell__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cms-space-4);
  height: var(--cms-shell-bar);
  padding: 0 var(--cms-space-6);
  border-bottom: var(--cms-border-width) solid var(--cms-border);
  background: var(--cms-card);
}

.shell__title {
  margin: 0;
  font-size: var(--cms-type-h2-size);
  font-weight: var(--cms-type-h2-weight);
  line-height: var(--cms-type-h2-line);
}

.shell__tools {
  display: flex;
  align-items: center;
  gap: var(--cms-space-3);
}

.shell__locale :deep(label) {
  display: inline-flex;
  align-items: center;
  gap: var(--cms-space-2);
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-label-size);
  line-height: var(--cms-type-label-line);
}

.shell__locale :deep(select) {
  height: var(--cms-control-sm);
  padding: 0 var(--cms-space-2);
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-sm);
  background: var(--cms-card);
  color: var(--cms-foreground);
  font: inherit;
  font-size: var(--cms-type-body-small-size);
}

.shell__content {
  flex: 1;
  padding: var(--cms-space-6);
}
</style>
