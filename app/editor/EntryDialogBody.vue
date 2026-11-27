<script setup lang="ts">
import '../assets/admin/admin.css'
import './editor.css'
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, useId, watch } from 'vue'
import { useEventListener } from '@vueuse/core'
import { cmsConfig } from '#cms/config'
import { useAdminI18n } from '../admin/useAdminI18n'
import { useAdminToast } from '../admin/useAdminToast'
import { useConfirmPublish } from '../admin/useConfirmPublish'
import { createDocumentRepository } from './document-repository'
import { EDITOR_LAYER, editorShortcut, useEditorHost } from './host'
import { createPendingDocumentRepository } from './pending'
import { EDITOR_LOCALE } from './session'
import LockBanner from './LockBanner.vue'
import LocaleBanner from './LocaleBanner.vue'
import LocaleSwitcher from './LocaleSwitcher.vue'
import EditorToasts from './EditorToasts.vue'
import EditorDialog from './EditorDialog.vue'
import HistoryPanel from './HistoryPanel.vue'
import EntryForm from './form/EntryForm.vue'
import { FORM_ISSUES_SHOWN } from './form/shown-issue'
import { fieldDefaults, type CmsContentField } from '../../src/content-fields'

// An entry of a type without a route (014 stage 5), edited in a dialog with
// the form Core renders from the type's fields (C-103). The session is Edit Mode's: the
// same Engine, Draft / Publish, Undo, validation, translation, History and
// Content Lock. A new entry exists only in memory until the first Save or
// Publish creates it, with its lock, in one call (§4.1).
const props = defineProps<{
  type: string
  /** Null: a new entry. */
  entryId: string | null
  /** The form Core renders from the type's fields (014, C-103). */
  fields: Record<string, CmsContentField>
  /** Publish once the entry is loaded (asked in a list): checks and the question as usual. */
  publishOnOpen?: boolean
}>()

const emit = defineEmits<{
  /** The first save created the entry. */
  created: [id: string]
  /** Saved or published: the list may show something new. */
  changed: []
  /** The entry's title as it is now (the dialog's heading). */
  title: [value: string]
  /** Saved or published with the buttons: the work is done, the dialog may close. */
  done: []
  /** Publish asked in a list needs the person: the dialog should be shown. */
  reveal: []
}>()

const { t, locale: adminLocale } = useAdminI18n()
const { defaultLocale, ready: languagesReady } = useCmsLanguages()

const documents = createDocumentRepository({ bootstrapLocale: cmsConfig.defaultLocale })
documents.edit({ kind: 'entry', type: props.type, requireSlug: false })

// One id per new entry, chosen here: a retried create returns the same entry.
const newId = crypto.randomUUID()
const pending = createPendingDocumentRepository({
  repository: documents.repository,
  create: async (content) => {
    const created = await documents.entries.create(props.type, content, { id: newId, takeLock: true })
    return { id: created.id, draftUpdatedAt: created.draftUpdatedAt, lockToken: created.lockToken ?? '' }
  },
  defaultLocale: () => defaultLocale.value,
  id: props.entryId,
  // A new entry starts with the declared defaults; an existing one never gets them.
  initial: () => fieldDefaults(props.fields),
})

const { engine, view, session, ui } = useEditorHost({
  repository: pending.repository,
  locale: null,
  t,
  // A dialog has no page to leave for.
  navigate: () => undefined,
})

// Layers of the editor live inside this dialog: a modal <dialog> is in the top
// layer and leaves everything else inert, <body> included.
const layerId = `cms-entry-layer-${useId()}`
provide(EDITOR_LAYER, `#${layerId}`)
const layerReady = ref(false)

// The language switcher of Edit Mode, without the URL: ask about unsaved
// changes, then load the other language.
const stored = computed(() => Boolean(pending.id.value))

// A translation needs the original to exist: for a new entry the first switch
// creates its draft, which needs the title (the one thing a draft must have).
provide(EDITOR_LOCALE, {
  switchLocale: async (code: string) => {
    if (!stored.value) {
      const missing = engine.issues.value.find(issue => issue.key === 'title' && issue.kind === 'required')

      if (missing) {
        issuesShown.value = true
        session.focusIssue(missing.fieldId)
        ui.toast(t('cms.editor.locale.titleFirst'), { tone: 'error' })
        return
      }

      if (!await session.save()) {
        return
      }

      await engine.setLocale(code)
      return
    }

    // Another language is not leaving: what was typed is kept as the draft, with
    // no question. Only when that fails (a wrong value, a lost lock) it is
    // asked what to do with the changes.
    session.blurActiveField()

    if (engine.dirty.value) {
      if (engine.issues.value.some(issue => issue.kind !== 'required')) {
        await session.save()
        return
      }

      if (!await session.save({ quiet: true }) && !await session.confirmLeave()) {
        return
      }
    }

    await engine.setLocale(code)
  },
})

// A new form does not open full of "Required": fields show their issues once
// left, and all of them once Publish was tried.
const issuesShown = ref(false)
provide(FORM_ISSUES_SHOWN, issuesShown)

const toasts = useAdminToast()

/**
 * Save draft and Publish finish the work: the dialog closes, and the result is
 * said in the admin's toasts, since the dialog's own go away with it.
 */
async function saveDraft() {
  if (await session.save()) {
    toasts.toast(t('cms.editor.toasts.saved'), { tone: 'success' })
    emit('done')
  }
}

const { can } = usePermissions()

/** Takes the entry off the site; it stays open, now a draft with Publish to put it back. */
async function takeOffEntry() {
  const name = session.entryName()

  if (await session.takeOff()) {
    toasts.toast(t('cms.pages.type.archived', { title: name }), { tone: 'success' })
    emit('changed')
  }
}

/** Deletes the entry for good (asked in the dialog): the dialog closes, the list updates. */
async function removeEntry() {
  const name = session.entryName()

  if (await session.remove(name)) {
    toasts.toast(t('cms.editor.remove.done', { title: name }), { tone: 'success' })
    emit('done')
  }
}

async function publish() {
  issuesShown.value = true

  if (await session.publish()) {
    toasts.toast(session.publishedText.value || t('cms.editor.toasts.published'), { tone: 'success', long: session.publishedText.value !== t('cms.editor.toasts.published') })
    emit('done')
    return true
  }

  return false
}

// Publish asked in a list: once the entry and its fields are there, as if the
// button of the toolbar was pressed (the form's checks, the question). The
// dialog is not shown while this can be done without the person: it appears
// for the question, for a field to fix or a lock held by someone else, and
// after a while anyway, so that nobody waits at a page that shows nothing.
/** Publish on open shows the dialog after this long anyway: nobody waits at a page that shows nothing. */
const REVEAL_AFTER_MS = 2500
/** The dialog opens (its transition) before the question is asked in it. */
const DIALOG_OPEN_MS = 80
/** A field can be focused once the dialog is on screen. */
const FOCUS_AFTER_REVEAL_MS = 150

if (props.publishOnOpen) {
  const { askBeforePublish } = useConfirmPublish()
  const reveal = () => emit('reveal')
  const patience = setTimeout(reveal, REVEAL_AFTER_MS)
  onBeforeUnmount(() => clearTimeout(patience))

  const stop = watch(() => engine.status.value === 'ready' && engine.fields.size > 0, async (loaded) => {
    if (!loaded) {
      return
    }

    stop()
    await nextTick()

    if (engine.readOnly.value) {
      reveal()
      return
    }

    // The question is part of the dialog: show it first, let it open.
    if (askBeforePublish.value) {
      reveal()
      await nextTick()
      await new Promise(resolve => setTimeout(resolve, DIALOG_OPEN_MS))
    }

    if (!await publish()) {
      reveal()
      await new Promise(resolve => setTimeout(resolve, FOCUS_AFTER_REVEAL_MS))
      const issue = engine.issues.value[0]

      if (issue) {
        session.focusIssue(issue.fieldId)
      }
    }
  }, { immediate: true })
}

watch(() => pending.id.value, (id) => {
  if (id && !props.entryId) {
    emit('created', id)
  }
})

watch(() => [engine.draftSavedAt.value, engine.publishedAt.value] as const, () => emit('changed'))

watch(() => (engine.document.value as Record<string, unknown> | null)?.title, (value) => {
  emit('title', typeof value === 'string' ? value.trim() : '')
})

onMounted(async () => {
  layerReady.value = true
  await languagesReady
  void engine.load(props.entryId ?? 'new')
})

const ready = computed(() => engine.status.value === 'ready')

const status = computed(() => {
  if (engine.status.value === 'loading' || engine.status.value === 'idle') {
    return t('cms.editor.status.loading')
  }

  if (engine.readOnly.value) {
    return t('cms.editor.status.readOnly')
  }

  if (engine.saveStatus.value === 'saving') {
    return t('cms.editor.status.saving')
  }

  if (engine.dirty.value) {
    return t('cms.editor.status.unsaved')
  }

  if (!stored.value) {
    return t('cms.content.dialog.new')
  }

  // As in the lists: an entry off the site is a draft; a published one with a newer draft has changes.
  if (engine.offSite.value || (engine.hasDraft.value && !engine.publishedAt.value)) {
    return t('cms.editor.status.draft')
  }

  return engine.hasDraft.value ? t('cms.editor.status.changed') : t('cms.editor.status.published')
})

// ── Keyboard ─────────────────────────────────────────────────────────

const root = ref<HTMLElement | null>(null)

/** Inputs and the text editors keep their own Undo. */
function ownsKeyboard(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable)
}

// Esc first leaves the selected field (and its panel), as in Edit Mode; only
// with nothing selected does it reach the dialog and close it.
useEventListener(root, 'keydown', (event: KeyboardEvent) => {
  // A panel handles its own Esc (and prevents it); this is Esc from the field.
  if (event.key === 'Escape' && !event.defaultPrevented && view.selection.value) {
    event.preventDefault()
    view.select(null)
  }
})

// On the document, for keys from anywhere in this dialog: a click on plain text
// leaves focus on the <dialog> itself, outside this root.
useEventListener(document, 'keydown', (event: KeyboardEvent) => {
  const dialog = root.value?.closest('dialog')

  if (!dialog || !(event.target instanceof Node) || !dialog.contains(event.target)) {
    return
  }

  const shortcut = editorShortcut(event)

  if (shortcut === 'save') {
    event.preventDefault()
    void session.save()
    return
  }

  if (shortcut && !ownsKeyboard(event.target)) {
    event.preventDefault()

    if (shortcut === 'redo') {
      engine.redo()
    } else {
      engine.undo()
    }
  }
})

defineExpose({ confirmLeave: () => session.confirmLeave() })
</script>

<template>
  <div
    ref="root"
    class="entry-dialog cms-editor-ui"
    :lang="adminLocale"
  >
    <div
      class="entry-dialog__bar"
      role="toolbar"
      :aria-label="t('cms.editor.toolbar.label')"
    >
      <div class="entry-dialog__group">
        <AdminButton
          variant="ghost"
          size="sm"
          icon-only
          :aria-label="t('cms.editor.toolbar.undo')"
          :title="t('cms.editor.toolbar.undo')"
          :disabled="!engine.canUndo.value"
          @click="engine.undo()"
        >
          <Icon
            name="lucide:undo-2"
            aria-hidden="true"
          />
        </AdminButton>
        <AdminButton
          variant="ghost"
          size="sm"
          icon-only
          :aria-label="t('cms.editor.toolbar.redo')"
          :title="t('cms.editor.toolbar.redo')"
          :disabled="!engine.canRedo.value"
          @click="engine.redo()"
        >
          <Icon
            name="lucide:redo-2"
            aria-hidden="true"
          />
        </AdminButton>
        <LocaleSwitcher v-if="ready" />
        <AdminButton
          variant="ghost"
          size="sm"
          icon-only
          :aria-label="t('cms.editor.toolbar.history')"
          :title="t('cms.editor.toolbar.history')"
          :disabled="!stored || !ready"
          @click="session.historyOpen.value = true"
        >
          <Icon
            name="lucide:history"
            aria-hidden="true"
          />
        </AdminButton>
        <!-- Deleting is for an entry that is not on the site: with one on the site the button is
             there but off, and the tooltip says why. -->
        <span
          v-if="stored && ready && can('pages.publish')"
          class="entry-dialog__delete-wrap"
          :title="engine.removable.value ? t('cms.editor.remove.label') : t('cms.editor.remove.unavailable')"
        >
          <AdminButton
            variant="secondary"
            size="sm"
            class="entry-dialog__delete"
            :disabled="!engine.removable.value"
            :loading="engine.removing.value"
            :aria-label="t('cms.editor.remove.label')"
            data-test="entry-delete"
            @click="removeEntry"
          >
            <template #leading>
              <Icon
                name="lucide:trash-2"
                aria-hidden="true"
              />
            </template>
            <span class="entry-dialog__delete-text">{{ t('cms.editor.remove.short') }}</span>
          </AdminButton>
        </span>
      </div>
      <span
        class="entry-dialog__status"
        role="status"
        data-test="entry-status"
      >{{ status }}</span>
      <div class="entry-dialog__group">
        <AdminButton
          variant="secondary"
          size="sm"
          class="entry-dialog__save"
          :aria-label="t('cms.editor.toolbar.save')"
          :title="t('cms.editor.toolbar.save')"
          :disabled="!ready || engine.readOnly.value || !engine.dirty.value"
          :loading="engine.saveStatus.value === 'saving'"
          @click="saveDraft"
        >
          <Icon
            name="lucide:save"
            class="entry-dialog__save-icon"
            aria-hidden="true"
          />
          <span class="entry-dialog__save-text">{{ t('cms.editor.toolbar.save') }}</span>
        </AdminButton>
        <!-- On the site with nothing newer to publish: the action is taking it off the site. -->
        <AdminButton
          v-if="engine.canTakeOff.value && can('pages.publish')"
          variant="secondary"
          size="sm"
          class="entry-dialog__take-off"
          :loading="engine.takingOff.value"
          data-test="entry-take-off"
          @click="takeOffEntry"
        >
          {{ t('cms.pages.type.archive') }}
        </AdminButton>
        <AdminButton
          v-else
          variant="primary"
          size="sm"
          :disabled="!ready || engine.readOnly.value || (!engine.hasUnpublished.value && stored)"
          :loading="engine.publishing.value"
          @click="publish"
        >
          {{ t('cms.editor.toolbar.publish') }}
        </AdminButton>
      </div>
    </div>
    <LockBanner />
    <LocaleBanner :filter="false" />

    <div
      class="entry-dialog__scroller"
      data-cms-scroller
    >
      <p
        v-if="!ready"
        class="entry-dialog__loading"
        role="status"
      >
        {{ t('cms.editor.status.loading') }}
      </p>
      <EntryForm
        v-else
        :fields="fields"
        :locale="adminLocale"
      />
    </div>

    <div :id="layerId" />
    <template v-if="layerReady">
      <EditorToasts />
      <EditorDialog />
      <HistoryPanel v-if="session.historyOpen.value" />
    </template>
  </div>
</template>

<style scoped>
/* Allowed: a red button that can be seen; not allowed: the quiet disabled one. */
.entry-dialog__delete:not(:disabled) {
  border-color: color-mix(in srgb, var(--cms-destructive) 45%, var(--cms-border));
  background: var(--cms-destructive-subtle);
  color: var(--cms-destructive-text);
}

.entry-dialog__delete:hover:not(:disabled),
.entry-dialog__delete:focus-visible {
  border-color: var(--cms-destructive);
  background: color-mix(in srgb, var(--cms-destructive) 12%, var(--cms-card));
  color: var(--cms-destructive-text);
}

.entry-dialog__delete-wrap {
  display: inline-flex;
}

@media (max-width: 767px) {
  .entry-dialog__delete-text {
    display: none;
  }
}
.entry-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--cms-space-3);
  min-height: min(60vh, 32rem);
}

.entry-dialog__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cms-space-2);
  padding-bottom: var(--cms-space-3);
  border-bottom: var(--cms-border-width) solid var(--cms-border);
}

.entry-dialog__group {
  display: flex;
  align-items: center;
  gap: var(--cms-space-1);
}

.entry-dialog__status {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-dialog__scroller {
  flex: 1;
  overflow: auto;
}

.entry-dialog__loading {
  margin: 0;
  color: var(--cms-text-secondary);
}

.entry-dialog__save-icon {
  display: none;
}

/* A phone: one row of controls (Save as an icon), the status under it. */
@media (max-width: 767px) {
  .entry-dialog {
    gap: var(--cms-space-2);
  }

  .entry-dialog__bar {
    row-gap: 0;
    justify-content: space-between;
    padding-bottom: var(--cms-space-2);
  }

  .entry-dialog__group {
    gap: 2px;
  }

  .entry-dialog__status {
    flex-basis: 100%;
    order: 3;
  }

  .entry-dialog__save-icon {
    display: inline-block;
  }

  .entry-dialog__save-text {
    display: none;
  }
}
</style>
