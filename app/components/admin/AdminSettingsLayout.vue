<script setup lang="ts">
import { useAdminI18n } from '../../admin/useAdminI18n'

// Settings as a section with its own menu: one screen per group. Later groups
// (SEO, Social, Navigation…) get a menu item when they exist, not before (015).
defineProps<{
  /** Heading of the current group, e.g. "Languages". */
  title: string
}>()

const { t } = useAdminI18n()
const route = useRoute()

const items = [
  { to: '/admin/settings', key: 'general', icon: 'lucide:globe' },
  { to: '/admin/settings/brand', key: 'brand', icon: 'lucide:palette' },
  { to: '/admin/settings/languages', key: 'languages', icon: 'lucide:languages' },
] as const

function isCurrent(to: string) {
  return route.path === to || route.path === `${to}/`
}
</script>

<template>
  <AdminShell :title="t('cms.shell.nav.settings')">
    <div class="settings-layout">
      <nav
        class="settings-nav"
        :aria-label="t('cms.settings.nav.label')"
      >
        <ul class="settings-nav__list">
          <li
            v-for="item in items"
            :key="item.key"
          >
            <NuxtLink
              :to="item.to"
              class="settings-nav__item"
              :aria-current="isCurrent(item.to) ? 'page' : undefined"
            >
              <Icon
                :name="item.icon"
                aria-hidden="true"
              />
              {{ t(`cms.settings.nav.${item.key}`) }}
            </NuxtLink>
          </li>
        </ul>
      </nav>

      <div class="settings-layout__main">
        <div class="settings-layout__head">
          <h2 class="settings-layout__title">
            {{ title }}
          </h2>
          <slot name="actions" />
        </div>
        <slot />
      </div>
    </div>
  </AdminShell>
</template>

<style scoped>
.settings-layout {
  display: grid;
  grid-template-columns: 14rem minmax(0, 1fr);
  align-items: start;
  gap: var(--cms-space-8);
}

.settings-nav {
  position: sticky;
  top: var(--cms-space-6);
  padding: var(--cms-space-1);
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-lg);
  background: var(--cms-card);
}

.settings-nav__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.settings-nav__item {
  display: flex;
  align-items: center;
  gap: var(--cms-space-3);
  min-height: var(--cms-control-lg);
  padding: 0 var(--cms-space-3);
  border-radius: var(--cms-radius-sm);
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-label-large-size);
  font-weight: var(--cms-type-label-large-weight);
  text-decoration: none;
  white-space: nowrap;
}

.settings-nav__item:hover {
  background: var(--cms-surface-hover);
  color: var(--cms-foreground);
}

.settings-nav__item[aria-current="page"] {
  background: var(--cms-surface-selected);
  box-shadow: inset 3px 0 0 var(--cms-primary);
  color: var(--cms-primary);
}

.settings-nav__item:focus-visible {
  outline: none;
  box-shadow: var(--cms-focus-ring);
}

.settings-layout__main {
  display: flex;
  flex-direction: column;
  gap: var(--cms-space-6);
  min-width: 0;
  max-width: 48rem;
}

.settings-layout__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cms-space-3);
}

.settings-layout__title {
  margin: 0;
  font-size: var(--cms-type-h2-size);
  font-weight: var(--cms-type-h2-weight);
  line-height: var(--cms-type-h2-line);
}

/* The menu becomes a row of tabs on narrow screens. */
@media (max-width: 900px) {
  .settings-layout {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--cms-space-5);
  }

  .settings-nav {
    position: static;
    overflow-x: auto;
  }

  .settings-nav__list {
    flex-direction: row;
  }

  .settings-nav__item[aria-current="page"] {
    box-shadow: inset 0 -3px 0 var(--cms-primary);
  }
}
</style>
