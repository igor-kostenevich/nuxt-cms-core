<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAdminI18n } from '../admin/useAdminI18n'
import { useEditor } from './inject'
import { useEditorUi } from './ui'

// Content Lock states (MASTER_PLAN C-13, C-69): someone else edits the page
// (read-only + take over for pages.unlock), or this session lost the lock.
const { t, locale } = useAdminI18n()
const { can } = usePermissions()
const { engine } = useEditor()
const ui = useEditorUi()
const busy = ref(false)

const holder = computed(() => engine.lockHolder.value)
const holderName = computed(() => holder.value?.holderEmail ?? t('cms.editor.lock.someone'))
const since = computed(() => {
  const at = holder.value?.acquiredAt
  return at ? new Date(at).toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' }) : '—'
})
const canTakeOver = computed(() => can('pages.unlock') || holder.value?.stale === true)

/** Takes the lock and says so when it stayed with someone else. */
async function acquire(action: () => Promise<void>) {
  busy.value = true

  try {
    await action()
  } catch {
    // Reported below: the lock is not ours.
  } finally {
    busy.value = false
  }

  if (engine.lock.value !== 'held') {
    ui.toast(t('cms.editor.lock.takeBackFailed'), { tone: 'error' })
  }
}

async function takeOver() {
  // A stale session is gone already; a fresh one loses its work: ask first.
  if (holder.value?.stale) {
    return acquire(engine.takeOver)
  }

  const choice = await ui.confirm({
    title: t('cms.editor.lock.takeOverTitle'),
    body: t('cms.editor.lock.takeOverBody', { name: holderName.value }),
    confirm: t('cms.editor.lock.forceUnlock'),
    cancel: t('cms.editor.leave.cancel'),
    destructive: true,
  })

  if (choice === 'confirm') {
    await acquire(engine.forceUnlock)
  }
}
</script>

<template>
  <div
    v-if="engine.lock.value === 'locked'"
    class="lock-banner"
    role="status"
  >
    <Icon
      name="lucide:lock"
      aria-hidden="true"
    />
    <span class="lock-banner__text">
      {{ t('cms.editor.lock.lockedBy', { name: holderName, time: since }) }}
      <template v-if="holder?.stale"> {{ t('cms.editor.lock.stale') }}</template>
    </span>
    <AdminButton
      v-if="canTakeOver"
      variant="secondary"
      size="sm"
      :loading="busy"
      @click="takeOver"
    >
      {{ t('cms.editor.lock.forceUnlock') }}
    </AdminButton>
  </div>

  <div
    v-else-if="engine.lock.value === 'lost'"
    class="lock-banner lock-banner--lost"
    role="alert"
  >
    <Icon
      name="lucide:unplug"
      aria-hidden="true"
    />
    <span class="lock-banner__text">
      <strong>{{ t('cms.editor.lock.lostTitle') }}.</strong>
      {{ t('cms.editor.lock.lostBody') }}
    </span>
    <AdminButton
      variant="secondary"
      size="sm"
      :loading="busy"
      @click="acquire(engine.takeOver)"
    >
      {{ t('cms.editor.lock.takeBack') }}
    </AdminButton>
  </div>
</template>

<style scoped>
.lock-banner {
  display: flex;
  align-items: center;
  gap: var(--cms-space-3);
  padding: var(--cms-space-2) var(--cms-space-5);
  border-bottom: var(--cms-border-width) solid var(--cms-info-border);
  background: var(--cms-info-subtle);
  color: var(--cms-info-text);
  font-size: var(--cms-type-body-size);
}

.lock-banner--lost {
  border-color: var(--cms-warning-border);
  background: var(--cms-warning-subtle);
  color: var(--cms-warning);
}

.lock-banner__text {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
