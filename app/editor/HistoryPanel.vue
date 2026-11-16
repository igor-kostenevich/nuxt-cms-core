<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { useAdminI18n } from '../admin/useAdminI18n'
import { adminErrorKey } from '../admin/error-key'
import type { CmsPageRevision } from '../types/pages'
import { useEditor } from './inject'
import { useEditorSession } from './session'
import { useEditorUi } from './ui'

// Publication history (Revisions), deliberately apart from Undo (MASTER_PLAN
// C-12): every entry is a version that went live; Restore makes it the Draft.
const { t, locale } = useAdminI18n()
const { engine } = useEditor()
const session = useEditorSession()
const ui = useEditorUi()

const drawer = useTemplateRef<HTMLElement>('drawer')
const revisions = ref<CmsPageRevision[]>([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  await nextTick()
  drawer.value?.querySelector<HTMLElement>('h2')?.focus()

  try {
    revisions.value = await engine.listRevisions()
  } catch (cause) {
    error.value = t(adminErrorKey(cause))
  } finally {
    loading.value = false
  }
})

// Focus goes back to the History button the drawer was opened from.
onBeforeUnmount(() => {
  document.querySelector<HTMLElement>('[data-history-toggle]')?.focus()
})

function format(at: string) {
  return new Date(at).toLocaleString(locale.value, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function restore(revision: CmsPageRevision) {
  const choice = await ui.confirm({
    title: t('cms.editor.history.restoreTitle'),
    body: t('cms.editor.history.restoreBody'),
    confirm: t('cms.editor.history.restore'),
    cancel: t('cms.editor.leave.cancel'),
  })

  if (choice !== 'confirm') {
    return
  }

  try {
    if (await engine.restore(revision.id)) {
      ui.toast(t('cms.editor.history.restored'), { tone: 'success' })
      close()
    } else {
      ui.toast(t('cms.errors.lockLost'), { tone: 'error' })
    }
  } catch (cause) {
    ui.toast(t(adminErrorKey(cause)), { tone: 'error' })
  }
}

async function resetPage() {
  const choice = await ui.confirm({
    title: t('cms.editor.history.resetTitle'),
    body: t('cms.editor.history.resetBody'),
    confirm: t('cms.editor.history.reset'),
    cancel: t('cms.editor.leave.cancel'),
    destructive: true,
  })

  if (choice === 'confirm') {
    engine.resetAll()
    close()
  }
}

function close() {
  session.historyOpen.value = false
}
</script>

<template>
  <Teleport to="body">
    <aside
      ref="drawer"
      class="cms-admin cms-editor-ui ed-drawer"
      :lang="locale"
      aria-labelledby="cms-history-title"
      @keydown.esc.stop="close"
    >
      <header class="ed-drawer__header">
        <h2
          id="cms-history-title"
          class="ed-drawer__title"
          tabindex="-1"
        >
          {{ t('cms.editor.history.title') }}
        </h2>
        <AdminButton
          variant="ghost"
          size="sm"
          icon-only
          :aria-label="t('cms.editor.history.close')"
          @click="close"
        >
          <Icon
            name="lucide:x"
            aria-hidden="true"
          />
        </AdminButton>
      </header>
      <p class="ed-hint ed-drawer__hint">
        {{ t('cms.editor.history.hint') }}
      </p>

      <p
        v-if="loading"
        class="ed-drawer__empty"
        role="status"
      >
        {{ t('cms.editor.status.loading') }}
      </p>
      <p
        v-else-if="error"
        class="ed-drawer__empty ed-hint--error"
        role="alert"
      >
        {{ error }}
      </p>
      <p
        v-else-if="revisions.length === 0"
        class="ed-drawer__empty"
      >
        {{ t('cms.editor.history.empty') }}
      </p>
      <ol
        v-else
        class="ed-revisions"
      >
        <li
          v-for="(revision, index) in revisions"
          :key="revision.id"
          class="ed-revisions__item"
        >
          <span
            class="ed-revisions__dot"
            aria-hidden="true"
          />
          <span class="ed-revisions__when">{{ format(revision.createdAt) }}</span>
          <span
            v-if="index === 0"
            class="ed-badge"
          >{{ t('cms.editor.history.current') }}</span>
          <AdminButton
            v-else-if="!engine.readOnly.value"
            variant="secondary"
            size="xs"
            :aria-label="t('cms.editor.history.restoreVersion', { date: format(revision.createdAt) })"
            @click="restore(revision)"
          >
            {{ t('cms.editor.history.restore') }}
          </AdminButton>
        </li>
      </ol>

      <footer
        v-if="!engine.readOnly.value && engine.hasUnpublished.value"
        class="ed-drawer__footer"
      >
        <AdminButton
          variant="ghost"
          size="sm"
          @click="resetPage"
        >
          <template #leading>
            <Icon
              name="lucide:rotate-ccw"
              aria-hidden="true"
            />
          </template>
          {{ t('cms.editor.history.reset') }}
        </AdminButton>
      </footer>
    </aside>
  </Teleport>
</template>
