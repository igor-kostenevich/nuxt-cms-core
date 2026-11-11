<script setup lang="ts">
defineProps<{
  title: string
}>()

const { t } = useI18n()
const route = useRoute()
const { logout } = useCmsAuth()
const { settings } = useSiteSettings()

const siteName = computed(() => settings.value?.siteName || t('admin.login.caption'))

const groups = [
  {
    label: 'admin.shell.groups.content',
    items: [
      { label: 'admin.shell.nav.pages', icon: 'lucide:file' },
      { label: 'admin.shell.nav.media', icon: 'lucide:image' },
      { label: 'admin.shell.nav.forms', icon: 'lucide:clipboard-list' },
    ],
  },
  {
    label: 'admin.shell.groups.website',
    items: [
      { label: 'admin.shell.nav.analytics', icon: 'lucide:chart-column' },
      { label: 'admin.shell.nav.activity', icon: 'lucide:activity' },
      { label: 'admin.shell.nav.integrations', icon: 'lucide:plug' },
    ],
  },
  {
    label: 'admin.shell.groups.system',
    items: [
      { label: 'admin.shell.nav.users', icon: 'lucide:users' },
      { label: 'admin.shell.nav.secrets', icon: 'lucide:key-round' },
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
  await logout()
  await navigateTo('/admin/login')
}

async function onViewSite() {
  await navigateTo('/')
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
          {{ t('admin.login.mark') }}
        </span>
        <span class="shell__site">{{ siteName }}</span>
      </div>

      <nav
        class="shell__nav"
        :aria-label="t('admin.shell.navLabel')"
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
          <span>{{ t('admin.shell.nav.dashboard') }}</span>
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
            aria-disabled="true"
          >
            <Icon
              :name="item.icon"
              aria-hidden="true"
            />
            <span>{{ t(item.label) }}</span>
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
          <span>{{ t('admin.shell.nav.settings') }}</span>
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
            type="button"
            variant="ghost"
            size="sm"
            @click="onViewSite"
          >
            {{ t('admin.shell.viewSite') }}
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
            {{ t('admin.home.logout') }}
          </AdminButton>
        </div>
      </header>
      <div class="shell__content">
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
  font-size: 10px;
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
  color: rgb(255 255 255 / 30%);
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

.shell__item--stub {
  cursor: default;
}

.shell__item--stub:hover {
  background: transparent;
  color: rgb(255 255 255 / 72%);
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
