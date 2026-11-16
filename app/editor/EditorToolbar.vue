<script setup lang="ts">
import { computed, nextTick, ref, useId, useTemplateRef } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { useAdminI18n } from '../admin/useAdminI18n'
import { isAdminPath } from '../auth/paths'
import { useEditor } from './inject'
import { pageTitle } from './page-title'
import { useEditorSession } from './session'
import { useEditorUi } from './ui'

const props = defineProps<{
  title: string
  path: string
  /** The page has no CMS content: nothing to edit or save. */
  unbound: boolean
}>()

const { t } = useAdminI18n()
const { can } = usePermissions()
const { engine, view } = useEditor()
const session = useEditorSession()
const ui = useEditorUi()
const router = useRouter()
const uid = useId()

const isMac = import.meta.client && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl+'

const canPublish = computed(() => can('pages.publish'))
const disabled = computed(() => props.unbound || engine.readOnly.value || engine.status.value !== 'ready')

type StatusTone = 'neutral' | 'warning' | 'info' | 'success' | 'error'

const status = computed<{ text: string, tone: StatusTone }>(() => {
  if (props.unbound || engine.readOnly.value) {
    return { text: t('cms.editor.status.readOnly'), tone: 'neutral' }
  }

  if (engine.status.value !== 'ready') {
    return { text: t('cms.editor.status.loading'), tone: 'neutral' }
  }

  if (engine.saveStatus.value === 'saving') {
    return { text: t('cms.editor.status.saving'), tone: 'info' }
  }

  if (engine.saveStatus.value === 'error' && engine.dirty.value) {
    return { text: t('cms.editor.status.error'), tone: 'error' }
  }

  if (engine.dirty.value) {
    return { text: t('cms.editor.status.unsaved'), tone: 'warning' }
  }

  if (engine.hasDraft.value) {
    return { text: t('cms.editor.status.draft'), tone: 'info' }
  }

  return { text: t('cms.editor.status.published'), tone: 'success' }
})

/** Announced to screen readers: only outcomes, not every keystroke's "Unsaved". */
const announcement = computed(() => status.value.tone === 'error' || engine.saveStatus.value === 'saved'
  ? status.value.text
  : '')

// Publish stays clickable with issues: a click goes to the first one.
const publishDisabled = computed(() => disabled.value || !engine.hasUnpublished.value || engine.publishing.value)

// ── Issues ────────────────────────────────────────────────────────────

const issuesOpen = ref(false)
const issuesBox = useTemplateRef<HTMLElement>('issuesBox')

onClickOutside(issuesBox, () => {
  issuesOpen.value = false
})

function issueText(issue: (typeof engine.issues.value)[number]) {
  const name = issue.label ?? issue.key
  return issue.kind === 'required'
    ? t('cms.editor.issues.required', { name })
    : t('cms.editor.issues.maxLength', { name })
}

function goToIssue(fieldId: string) {
  issuesOpen.value = false
  session.focusIssue(fieldId)
}

// ── Page switcher ─────────────────────────────────────────────────────

const pagesOpen = ref(false)
const pagesBox = useTemplateRef<HTMLElement>('pagesBox')

onClickOutside(pagesBox, () => {
  pagesOpen.value = false
})

/** Static routes of the Client Project; Edit Mode cannot guess dynamic params. */
const pages = computed(() => router.getRoutes()
  .filter(route => !isAdminPath(route.path) && !route.path.includes(':') && route.components?.default)
  .map(route => ({ path: route.path, title: pageTitle(route, t('cms.editor.pages.home')) }))
  .sort((a, b) => a.path.localeCompare(b.path)))

async function togglePages() {
  pagesOpen.value = !pagesOpen.value

  if (pagesOpen.value) {
    await nextTick()
    pagesBox.value?.querySelector<HTMLElement>('[aria-current="page"], .pages__item')?.focus()
  }
}

function closePages() {
  pagesOpen.value = false
  pagesBox.value?.querySelector<HTMLElement>('.tb-page')?.focus()
}

function openPage(path: string) {
  pagesOpen.value = false
  void session.goTo(path)
}

// ── Actions ───────────────────────────────────────────────────────────

async function togglePreview() {
  session.blurActiveField()
  view.setPreview(!view.preview.value)
  // The button that was clicked is gone; focus its counterpart.
  await nextTick()
  document.querySelector<HTMLElement>(view.preview.value ? '[data-preview-exit]' : '[data-preview-enter]')?.focus()
}

async function discard() {
  const choice = await ui.confirm({
    title: t('cms.editor.discard.title'),
    body: t('cms.editor.discard.body'),
    confirm: t('cms.editor.discard.confirm'),
    cancel: t('cms.editor.leave.cancel'),
    destructive: true,
  })

  if (choice === 'confirm') {
    engine.discard()
  }
}
</script>

<template>
  <div
    v-if="view.preview.value"
    class="preview-pill"
  >
    <span class="preview-pill__label">
      <Icon
        name="lucide:eye"
        aria-hidden="true"
      />
      {{ t('cms.editor.toolbar.preview') }}
    </span>
    <AdminButton
      variant="primary"
      size="sm"
      class="preview-pill__exit"
      data-preview-exit
      @click="togglePreview"
    >
      {{ t('cms.editor.toolbar.exitPreview') }}
      <kbd class="tb-kbd">Esc</kbd>
    </AdminButton>
  </div>

  <header
    v-else
    class="toolbar"
    :aria-label="t('cms.editor.toolbar.label')"
  >
    <div class="toolbar__start">
      <AdminButton
        variant="secondary"
        size="md"
        @click="session.exit()"
      >
        <template #leading>
          <Icon
            name="lucide:x"
            aria-hidden="true"
          />
        </template>
        <span class="tb-label">{{ t('cms.editor.toolbar.exit') }}</span>
      </AdminButton>
    </div>

    <div class="toolbar__center">
      <div class="tb-group">
        <AdminButton
          variant="ghost"
          size="md"
          icon-only
          :disabled="!engine.canUndo.value"
          :title="`${t('cms.editor.toolbar.undo')} (${mod}Z)`"
          :aria-label="t('cms.editor.toolbar.undo')"
          @click="session.blurActiveField(); engine.undo()"
        >
          <Icon
            name="lucide:undo-2"
            aria-hidden="true"
          />
        </AdminButton>
        <AdminButton
          variant="ghost"
          size="md"
          icon-only
          :disabled="!engine.canRedo.value"
          :title="`${t('cms.editor.toolbar.redo')} (${mod}⇧Z)`"
          :aria-label="t('cms.editor.toolbar.redo')"
          @click="session.blurActiveField(); engine.redo()"
        >
          <Icon
            name="lucide:redo-2"
            aria-hidden="true"
          />
        </AdminButton>
      </div>

      <span
        class="tb-divider"
        aria-hidden="true"
      />

      <div
        ref="pagesBox"
        class="pages"
        @keydown.esc.stop="closePages"
      >
        <button
          type="button"
          class="tb-page"
          :aria-expanded="pagesOpen"
          :aria-controls="`${uid}-pages`"
          :title="t('cms.editor.toolbar.pages')"
          @click="togglePages"
        >
          <Icon
            name="lucide:globe"
            aria-hidden="true"
          />
          <span class="tb-page__title">{{ title }}</span>
          <Icon
            name="lucide:chevron-down"
            class="tb-page__chevron"
            aria-hidden="true"
          />
        </button>
        <ul
          v-if="pagesOpen"
          :id="`${uid}-pages`"
          class="tb-popover pages__list"
          :aria-label="t('cms.editor.toolbar.pages')"
        >
          <li
            v-for="page in pages"
            :key="page.path"
          >
            <button
              type="button"
              class="pages__item"
              :aria-current="page.path === path ? 'page' : undefined"
              @click="openPage(page.path)"
            >
              <span>{{ page.title }}</span>
              <span
                class="pages__path"
                translate="no"
              >{{ page.path }}</span>
            </button>
          </li>
        </ul>
      </div>

      <span
        class="tb-status"
        :class="`tb-status--${status.tone}`"
      >
        <span
          class="tb-status__dot"
          aria-hidden="true"
        />
        <span class="tb-status__text">{{ status.text }}</span>
      </span>
      <span
        class="ed-visually-hidden"
        role="status"
      >{{ announcement }}</span>
      <AdminButton
        v-if="status.tone === 'error'"
        variant="link"
        size="sm"
        @click="session.save()"
      >
        {{ t('cms.editor.status.retry') }}
      </AdminButton>

      <div
        v-if="engine.issues.value.length > 0"
        ref="issuesBox"
        class="issues"
        @keydown.esc.stop="issuesOpen = false"
      >
        <button
          type="button"
          class="tb-issues"
          :aria-expanded="issuesOpen"
          :aria-controls="`${uid}-issues`"
          @click="issuesOpen = !issuesOpen"
        >
          <Icon
            name="lucide:circle-alert"
            aria-hidden="true"
          />
          {{ t('cms.editor.status.issues', { count: engine.issues.value.length }) }}
        </button>
        <ul
          v-if="issuesOpen"
          :id="`${uid}-issues`"
          class="tb-popover issues__list"
        >
          <li
            v-for="issue in engine.issues.value"
            :key="`${issue.fieldId}-${issue.kind}`"
          >
            <button
              type="button"
              class="pages__item"
              @click="goToIssue(issue.fieldId)"
            >
              {{ issueText(issue) }}
            </button>
          </li>
        </ul>
      </div>
    </div>

    <div class="toolbar__end">
      <AdminButton
        variant="secondary"
        size="md"
        icon-only
        :disabled="unbound || engine.status.value !== 'ready'"
        :title="t('cms.editor.toolbar.history')"
        :aria-label="t('cms.editor.toolbar.history')"
        data-history-toggle
        @click="session.historyOpen.value = true"
      >
        <Icon
          name="lucide:history"
          aria-hidden="true"
        />
      </AdminButton>
      <AdminButton
        variant="secondary"
        size="md"
        icon-only
        class="tb-toggle"
        :aria-pressed="view.highlight.value"
        :title="`${t('cms.editor.toolbar.highlight')} (Alt)`"
        :aria-label="t('cms.editor.toolbar.highlight')"
        @click="view.highlight.value = !view.highlight.value"
      >
        <Icon
          :name="view.highlight.value ? 'lucide:scan-eye' : 'lucide:scan'"
          aria-hidden="true"
        />
      </AdminButton>
      <AdminButton
        variant="secondary"
        size="md"
        data-preview-enter
        :aria-label="t('cms.editor.toolbar.preview')"
        @click="togglePreview"
      >
        <template #leading>
          <Icon
            name="lucide:eye"
            aria-hidden="true"
          />
        </template>
        <span class="tb-label">{{ t('cms.editor.toolbar.preview') }}</span>
      </AdminButton>
      <AdminButton
        v-if="engine.dirty.value && !engine.readOnly.value"
        variant="ghost"
        size="md"
        icon-only
        :title="t('cms.editor.discard.title')"
        :aria-label="t('cms.editor.discard.title')"
        @click="discard"
      >
        <Icon
          name="lucide:rotate-ccw"
          aria-hidden="true"
        />
      </AdminButton>
      <AdminButton
        :variant="canPublish ? 'secondary' : 'primary'"
        size="md"
        :disabled="disabled || !engine.dirty.value || engine.saveStatus.value === 'saving'"
        :loading="engine.saveStatus.value === 'saving'"
        :title="`${t('cms.editor.toolbar.save')} (${mod}S)`"
        @click="session.save()"
      >
        {{ t('cms.editor.toolbar.save') }}
      </AdminButton>
      <AdminButton
        v-if="canPublish"
        variant="primary"
        size="md"
        :disabled="publishDisabled"
        :loading="engine.publishing.value"
        @click="session.publish()"
      >
        {{ t('cms.editor.toolbar.publish') }}
      </AdminButton>
    </div>
  </header>
</template>

<style scoped>
.toolbar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--cms-space-4);
  min-height: var(--cms-edit-bar);
  padding: var(--cms-space-2) var(--cms-space-5);
  padding-inline: max(var(--cms-space-5), env(safe-area-inset-left)) max(var(--cms-space-5), env(safe-area-inset-right));
  background: var(--cms-card);
  border-bottom: var(--cms-border-width) solid var(--cms-border);
}

.toolbar__start,
.toolbar__end,
.toolbar__center,
.tb-group {
  display: flex;
  align-items: center;
  gap: var(--cms-space-2);
  min-width: 0;
}

.toolbar__center {
  justify-content: center;
  gap: var(--cms-space-3);
}

.tb-divider {
  width: 1px;
  height: 20px;
  background: var(--cms-border);
}

.tb-toggle[aria-pressed="true"] {
  border-color: var(--cms-primary);
  background: var(--cms-primary-subtle);
  color: var(--cms-primary);
}

.pages,
.issues {
  position: relative;
  min-width: 0;
}

.tb-page,
.tb-issues,
.pages__item {
  font: inherit;
  cursor: pointer;
}

.tb-page {
  display: inline-flex;
  align-items: center;
  gap: var(--cms-space-2);
  max-width: 260px;
  height: var(--cms-control-md);
  padding: 0 var(--cms-space-3);
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-sm);
  background: var(--cms-surface-secondary);
  color: var(--cms-foreground);
  font-size: var(--cms-type-label-large-size);
}

.tb-page:hover {
  background: var(--cms-surface-hover);
}

.tb-page__title {
  min-width: 0;
  overflow: hidden;
  font-weight: var(--cms-type-label-large-weight);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tb-page__chevron {
  flex: none;
  color: var(--cms-text-secondary);
}

.tb-popover {
  position: absolute;
  top: calc(100% + var(--cms-space-1));
  left: 0;
  z-index: 2;
  min-width: 260px;
  max-height: 60vh;
  margin: 0;
  padding: var(--cms-space-1);
  overflow-y: auto;
  overscroll-behavior: contain;
  list-style: none;
  background: var(--cms-card);
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-lg);
  box-shadow: var(--cms-shadow-overlay);
}

.pages__item {
  display: flex;
  justify-content: space-between;
  gap: var(--cms-space-4);
  width: 100%;
  min-height: var(--cms-control-lg);
  padding: var(--cms-space-2) var(--cms-space-3);
  border: 0;
  border-radius: var(--cms-radius-sm);
  background: transparent;
  color: var(--cms-foreground);
  text-align: left;
}

.pages__item:hover {
  background: var(--cms-surface-hover);
}

.pages__item[aria-current="page"] {
  background: var(--cms-surface-selected);
  color: var(--cms-primary);
}

.pages__path {
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
}

.tb-page:focus-visible,
.tb-issues:focus-visible,
.pages__item:focus-visible {
  outline: none;
  box-shadow: var(--cms-focus-ring);
}

.tb-status {
  display: inline-flex;
  align-items: center;
  gap: var(--cms-space-2);
  min-width: 0;
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-size);
  white-space: nowrap;
}

.tb-status__text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.tb-status__dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: var(--cms-radius-full);
  background: var(--cms-neutral-400);
}

.tb-status--warning .tb-status__dot { background: var(--cms-warning-solid); }
.tb-status--info .tb-status__dot { background: var(--cms-primary); }
.tb-status--success .tb-status__dot { background: var(--cms-success); }
.tb-status--error { color: var(--cms-destructive-text); }
.tb-status--error .tb-status__dot { background: var(--cms-destructive); }

.tb-issues {
  display: inline-flex;
  align-items: center;
  gap: var(--cms-space-1);
  min-height: var(--cms-control-sm);
  padding: 0 var(--cms-space-2);
  border: var(--cms-border-width) solid var(--cms-destructive-border);
  border-radius: var(--cms-radius-sm);
  background: var(--cms-destructive-subtle);
  color: var(--cms-destructive-text);
  font-size: var(--cms-type-body-small-size);
  white-space: nowrap;
}

.issues__list {
  left: auto;
  right: 0;
  min-width: 300px;
}

.tb-kbd {
  padding: 0 var(--cms-space-1);
  border: var(--cms-border-width) solid currentColor;
  border-radius: var(--cms-radius-sm);
  font: inherit;
  font-size: var(--cms-type-caption-size);
  opacity: 0.8;
}

.preview-pill {
  position: fixed;
  bottom: max(var(--cms-space-6), env(safe-area-inset-bottom));
  left: 50%;
  z-index: var(--cms-edit-z-pill);
  display: flex;
  align-items: center;
  gap: var(--cms-space-3);
  padding: var(--cms-space-2) var(--cms-space-2) var(--cms-space-2) var(--cms-space-4);
  border-radius: var(--cms-radius-full);
  background: var(--cms-neutral-900);
  color: var(--cms-neutral-0);
  box-shadow: var(--cms-shadow-overlay);
  transform: translateX(-50%);
}

.preview-pill__label {
  display: inline-flex;
  align-items: center;
  gap: var(--cms-space-2);
  font-weight: var(--cms-type-label-weight);
}

.preview-pill__exit {
  border-radius: var(--cms-radius-full);
}

/* Labels leave the screen, not the accessibility tree. */
@media (max-width: 1100px) {
  .tb-label,
  .tb-status__text {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}

@media (max-width: 760px) {
  .toolbar {
    gap: var(--cms-space-2);
    padding-inline: var(--cms-space-3);
  }

  .tb-divider {
    display: none;
  }

  .tb-page {
    max-width: 140px;
  }
}
</style>
