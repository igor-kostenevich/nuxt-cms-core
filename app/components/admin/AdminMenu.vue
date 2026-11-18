<script setup lang="ts">
import { nextTick, ref, useId, useTemplateRef } from 'vue'
import { onClickOutside } from '@vueuse/core'

// Row actions behind a "⋯" button (WAI-ARIA menu button): rare actions that
// would crowd the row if they were buttons of their own. Focus moves into the
// menu on open, arrows move between items, Esc closes and returns focus.
export interface AdminMenuItem<K extends string = string> {
  key: K
  label: string
  icon?: string
  disabled?: boolean
  /** A destructive action: red, set apart from the rest. */
  danger?: boolean
}

defineProps<{
  /** Accessible name of the trigger, e.g. "Actions for English". */
  label: string
  items: AdminMenuItem[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  select: [key: string]
}>()

const id = useId()
const root = useTemplateRef<HTMLElement>('root')
const open = ref(false)

onClickOutside(root, () => {
  open.value = false
})

function enabledItems(): HTMLElement[] {
  return [...(root.value?.querySelectorAll<HTMLElement>('[role=menuitem]:not([aria-disabled=true])') ?? [])]
}

async function toggle() {
  open.value = !open.value

  if (open.value) {
    await nextTick()
    enabledItems()[0]?.focus()
  }
}

function close() {
  open.value = false
  root.value?.querySelector<HTMLElement>('.admin-menu__trigger')?.focus()
}

function choose(item: AdminMenuItem) {
  if (item.disabled) {
    return
  }

  close()
  emit('select', item.key)
}

function onKeydown(event: KeyboardEvent) {
  const items = enabledItems()
  const index = items.indexOf(document.activeElement as HTMLElement)

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1
    items[(next + items.length) % items.length]?.focus()
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    items[event.key === 'Home' ? 0 : items.length - 1]?.focus()
  } else if (event.key === 'Tab') {
    open.value = false
  }
}

</script>

<template>
  <div
    ref="root"
    class="admin-menu"
    @keydown.esc.stop.prevent="close"
  >
    <button
      type="button"
      class="admin-menu__trigger"
      :aria-label="label"
      :title="label"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="`${id}-menu`"
      :disabled="disabled"
      @click="toggle"
    >
      <Icon
        name="lucide:ellipsis"
        aria-hidden="true"
      />
    </button>
    <ul
      v-if="open"
      :id="`${id}-menu`"
      class="admin-menu__list"
      role="menu"
      :aria-label="label"
      @keydown="onKeydown"
    >
      <li
        v-for="item in items"
        :key="item.key"
        role="menuitem"
        class="admin-menu__item"
        :class="{ 'admin-menu__item--danger': item.danger }"
        :tabindex="item.disabled ? undefined : -1"
        :aria-disabled="item.disabled ? 'true' : undefined"
        @click="choose(item)"
        @keydown.enter.prevent="choose(item)"
        @keydown.space.prevent="choose(item)"
      >
        <Icon
          v-if="item.icon"
          :name="item.icon"
          aria-hidden="true"
        />
        {{ item.label }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.admin-menu {
  position: relative;
  flex: none;
}

.admin-menu__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--cms-control-sm);
  height: var(--cms-control-sm);
  padding: 0;
  border: 0;
  border-radius: var(--cms-radius-sm);
  background: transparent;
  color: var(--cms-text-secondary);
  cursor: pointer;
}

.admin-menu__trigger:hover,
.admin-menu__trigger[aria-expanded="true"] {
  background: var(--cms-surface-hover);
  color: var(--cms-foreground);
}

.admin-menu__trigger:focus-visible {
  outline: none;
  box-shadow: var(--cms-focus-ring);
}

.admin-menu__trigger:disabled {
  color: var(--cms-text-disabled);
  cursor: not-allowed;
}

.admin-menu__list {
  position: absolute;
  top: calc(100% + var(--cms-space-1));
  right: 0;
  z-index: 5;
  min-width: 13rem;
  margin: 0;
  padding: var(--cms-space-1);
  list-style: none;
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-lg);
  background: var(--cms-card);
  box-shadow: var(--cms-shadow-overlay);
}

.admin-menu__item {
  display: flex;
  align-items: center;
  gap: var(--cms-space-2);
  min-height: var(--cms-control-md);
  padding: 0 var(--cms-space-3);
  border-radius: var(--cms-radius-sm);
  color: var(--cms-foreground);
  font-size: var(--cms-type-body-small-size);
  white-space: nowrap;
  cursor: pointer;
}

.admin-menu__item:hover,
.admin-menu__item:focus-visible {
  outline: none;
  background: var(--cms-surface-hover);
}

.admin-menu__item--danger {
  color: var(--cms-destructive-text);
}

/* Set apart from the safe actions above it. */
.admin-menu__item--danger:not(:first-child) {
  position: relative;
  margin-top: var(--cms-space-2);
}

.admin-menu__item--danger:not(:first-child)::before {
  position: absolute;
  top: calc(-1 * var(--cms-space-1) - 1px);
  right: 0;
  left: 0;
  border-top: var(--cms-border-width) solid var(--cms-border-subtle);
  content: '';
}

.admin-menu__item--danger:hover,
.admin-menu__item--danger:focus-visible {
  background: var(--cms-destructive-subtle);
}

.admin-menu__item[aria-disabled="true"] {
  color: var(--cms-text-disabled);
  cursor: not-allowed;
}

.admin-menu__item[aria-disabled="true"]:hover {
  background: transparent;
}
</style>
