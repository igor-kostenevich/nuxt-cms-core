<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import { adminErrorKey } from '../../../admin/error-key'
import { displayName, languageInput } from '../../../admin/languages'
import { useAdminI18n } from '../../../admin/useAdminI18n'
import { useAdminLanguages } from '../../../admin/useAdminLanguages'
import { useAdminToast } from '../../../admin/useAdminToast'
import { CmsDataError } from '../../../data/errors'
import type { CmsLanguage } from '../../../types/languages'

definePageMeta({
  // The Client Project's layouts frame the site, not the admin.
  layout: false,
  middleware: ['cms-auth'],
})

// Settings → Languages (010): one list and one "Add language" button. Every
// action applies at once (one database call, then the list reloads), so there
// is nothing to save. Rare actions (move, delete) sit in the row menu;
// explanations are tooltips or appear where they matter (the confirmation,
// the message after adding). The site is multilingual as soon as two
// languages are active (C-81). Deleting a language deletes its translations
// and asks first. The default language is the language of the original and
// never changes (C-87).
const { t, locale: adminLocale } = useAdminI18n()
const { can } = usePermissions()
const {
  languages,
  bootstrapping,
  error: loadError,
  ready,
  add,
  setActive,
  moveTo,
  remove,
} = useAdminLanguages()

await ready

const canManage = computed(() => can('languages.manage'))
const toasts = useAdminToast()
/** The action in flight; one at a time. Only its own control shows it. */
const busy = ref<string | null>(null)

/**
 * Runs one action and reports its outcome in a toast, so the list never
 * shifts under the pointer. A click during another action is ignored rather
 * than every control being disabled (that made the whole list flicker).
 * `conflict` means something specific per action (a language that exists, a
 * page open in Edit Mode), so the caller names it.
 */
async function run(key: string, action: () => Promise<unknown>, success: string, conflict?: string) {
  if (busy.value !== null) {
    return
  }

  busy.value = key

  try {
    await action()
    toasts.toast(success, { tone: 'success' })
  } catch (cause) {
    const message = conflict && cause instanceof CmsDataError && cause.code === 'conflict'
      ? conflict
      : t(adminErrorKey(cause))
    toasts.toast(message, { tone: 'error' })
  } finally {
    busy.value = null
  }
}

/** The name in the admin language, when it differs from the native one. */
function secondaryName(language: CmsLanguage) {
  const name = displayName(language.code, adminLocale.value) ?? language.name
  return name === language.nativeName ? '' : name
}

// ── Add ───────────────────────────────────────────────────────────────

const addOpen = ref(false)
const addBox = useTemplateRef<HTMLElement>('addBox')
const taken = computed(() => languages.value.map(language => language.code))

onClickOutside(addBox, () => {
  addOpen.value = false
})

function closeAdd() {
  addOpen.value = false
  addBox.value?.querySelector<HTMLElement>('.lang-add__trigger')?.focus()
}

async function addLanguage(code: string) {
  const input = languageInput(code)
  closeAdd()
  await run(
    'add',
    () => add(input),
    t('cms.settings.languages.added', { name: input.nativeName }),
    t('cms.settings.languages.exists'),
  )
}

// ── Row actions ───────────────────────────────────────────────────────

// The switch moves at once; the list catches up when the call returns, and
// goes back to the stored state if it fails.
const pendingActive = reactive<Record<string, boolean>>({})

function isActive(language: CmsLanguage) {
  return pendingActive[language.code] ?? language.active
}

async function toggle(language: CmsLanguage, next: boolean) {
  if (busy.value !== null) {
    return
  }

  pendingActive[language.code] = next
  await run(
    `active:${language.code}`,
    () => setActive(language.code, next),
    t(next ? 'cms.settings.languages.enabled' : 'cms.settings.languages.disabled', { name: language.nativeName }),
  )
  Reflect.deleteProperty(pendingActive, language.code)
}

function move(language: CmsLanguage, index: number) {
  void run(`move:${language.code}`, () => moveTo(language.code, index), t('cms.settings.languages.reordered'))
}

function menuItems(language: CmsLanguage, index: number) {
  return [
    // A hidden language is one being translated: the shortest way to do it.
    ...(language.isDefault
      ? []
      : [{ key: 'translate', label: t('cms.settings.languages.translate'), icon: 'lucide:languages' }]),
    { key: 'up', label: t('cms.settings.languages.moveUpShort'), icon: 'lucide:arrow-up', disabled: index === 0 },
    {
      key: 'down',
      label: t('cms.settings.languages.moveDownShort'),
      icon: 'lucide:arrow-down',
      disabled: index === languages.value.length - 1,
    },
    // The default language cannot go: every other one is a translation of it.
    ...(language.isDefault
      ? []
      : [{ key: 'delete', label: t('cms.settings.languages.delete'), icon: 'lucide:trash-2', danger: true }]),
  ]
}

function onMenu(language: CmsLanguage, index: number, key: string) {
  if (key === 'delete') {
    pendingDelete.value = language
  } else if (key === 'translate') {
    void navigateTo(`/admin/edit/?locale=${encodeURIComponent(language.code)}`)
  } else {
    move(language, key === 'up' ? index - 1 : index + 1)
  }
}

const locked = computed(() => !canManage.value || bootstrapping.value)

// ── Drag to reorder ───────────────────────────────────────────────────

// A row is draggable only while its handle is held, so text in the row stays
// selectable. The handle also moves the row with Up / Down from the keyboard.
const armed = ref<string | null>(null)
const dragging = ref<string | null>(null)
const dropIndex = ref<number | null>(null)

function onDragStart(event: DragEvent, language: CmsLanguage) {
  dragging.value = language.code
  event.dataTransfer?.setData('text/plain', language.code)

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}

function onDragOver(event: DragEvent, index: number) {
  if (!dragging.value) {
    return
  }

  event.preventDefault()
  dropIndex.value = index
}

function onDrop(index: number) {
  const language = languages.value.find(item => item.code === dragging.value)
  endDrag()

  if (language) {
    move(language, index)
  }
}

function endDrag() {
  armed.value = null
  dragging.value = null
  dropIndex.value = null
}

function onHandleKeydown(event: KeyboardEvent, language: CmsLanguage, index: number) {
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault()

    // Not disabled while busy: a disabled button would drop the keyboard focus.
    if (busy.value === null) {
      move(language, event.key === 'ArrowUp' ? index - 1 : index + 1)
    }
  }
}

/** The handle stays focusable while an action runs; it only reorders when it may. */
const canReorder = computed(() => canManage.value && !bootstrapping.value && languages.value.length > 1)

// ── Delete ────────────────────────────────────────────────────────────

const pendingDelete = ref<CmsLanguage | null>(null)
const deleteOpen = computed({
  get: () => pendingDelete.value !== null,
  set: (open) => {
    if (!open) {
      pendingDelete.value = null
    }
  },
})

async function confirmDelete() {
  const language = pendingDelete.value

  if (!language) {
    return
  }

  pendingDelete.value = null
  await run(
    `delete:${language.code}`,
    () => remove(language.code),
    t('cms.settings.languages.deleted', { name: language.nativeName }),
    t('cms.settings.languages.pageOpen'),
  )
}

</script>

<template>
  <AdminSettingsLayout :title="t('cms.settings.nav.languages')">
    <template
      v-if="canManage && !loadError"
      #actions
    >
      <div
        ref="addBox"
        class="lang-add"
        @keydown.esc.stop.prevent="closeAdd"
      >
        <AdminButton
          class="lang-add__trigger"
          variant="primary"
          size="md"
          aria-haspopup="dialog"
          :aria-expanded="addOpen"
          :loading="busy === 'add'"
          @click="addOpen = !addOpen"
        >
          <template #leading>
            <Icon
              name="lucide:plus"
              aria-hidden="true"
            />
          </template>
          {{ t('cms.settings.languages.add') }}
        </AdminButton>
        <div
          v-if="addOpen"
          class="lang-add__popover"
          role="dialog"
          :aria-label="t('cms.settings.languages.add')"
        >
          <AdminLanguageCombobox
            :taken="taken"
            @pick="addLanguage"
          />
        </div>
      </div>
    </template>

    <AdminAlert
      v-if="loadError"
      tone="danger"
      :title="t(adminErrorKey(loadError))"
    />

    <template v-else>
      <AdminAlert
        v-if="!canManage"
        tone="info"
        :title="t('cms.settings.languages.ownerOnly')"
      />

      <section
        class="settings-card lang-card"
        :aria-label="t('cms.settings.nav.languages')"
      >
        <ul class="lang-list">
          <li
            v-for="(language, index) in languages"
            :key="language.code"
            class="lang-row"
            :class="{
              'lang-row--off': !isActive(language),
              'lang-row--dragging': dragging === language.code,
              'lang-row--drop': dropIndex === index && dragging !== language.code,
            }"
            :draggable="armed === language.code"
            @dragstart="onDragStart($event, language)"
            @dragover="onDragOver($event, index)"
            @drop.prevent="onDrop(index)"
            @dragend="endDrag"
          >
            <button
              type="button"
              class="lang-row__handle"
              :aria-label="t('cms.settings.languages.dragHandle', { name: language.nativeName })"
              :title="t('cms.settings.languages.dragHandle', { name: language.nativeName })"
              :disabled="!canReorder"
              @pointerdown="armed = busy === null ? language.code : null"
              @pointerup="armed = null"
              @keydown="onHandleKeydown($event, language, index)"
            >
              <Icon
                name="lucide:grip-vertical"
                aria-hidden="true"
              />
            </button>

            <span class="lang-row__names">
              <span
                class="lang-row__native"
                :lang="language.code"
              >{{ language.nativeName }}</span>
              <span
                v-if="secondaryName(language)"
                class="lang-row__secondary"
              >{{ secondaryName(language) }}</span>
            </span>

            <span
              v-if="language.isDefault"
              class="lang-row__badge lang-row__badge--default"
              :title="t('cms.settings.languages.defaultTooltip')"
            >
              <Icon
                name="lucide:star"
                aria-hidden="true"
              />
              {{ t('cms.settings.languages.defaultBadge') }}
            </span>
            <span
              v-else-if="!isActive(language)"
              class="lang-row__badge"
              :title="t('cms.settings.languages.offTooltip')"
            >{{ t('cms.settings.languages.offBadge') }}</span>

            <span
              class="lang-row__switch"
              :title="language.isDefault
                ? t('cms.settings.languages.defaultCannotDisable')
                : t(isActive(language) ? 'cms.settings.languages.disableTooltip' : 'cms.settings.languages.enableTooltip')"
            >
              <AdminSwitch
                :model-value="isActive(language)"
                :label="t('cms.settings.languages.activeFor', { name: language.nativeName })"
                :disabled="locked || language.isDefault"
                @update:model-value="toggle(language, $event)"
              />
            </span>

            <AdminMenu
              :label="t('cms.settings.languages.actions', { name: language.nativeName })"
              :items="menuItems(language, index)"
              :disabled="locked"
              @select="onMenu(language, index, $event)"
            />
          </li>
        </ul>

        <div
          v-if="languages.length < 2"
          class="lang-empty"
        >
          <Icon
            name="lucide:languages"
            aria-hidden="true"
          />
          <p>{{ t('cms.settings.languages.monolingual') }}</p>
        </div>
      </section>
    </template>

    <AdminDialog
      v-model:open="deleteOpen"
      :title="t('cms.settings.languages.deleteTitle', { name: pendingDelete?.nativeName ?? '' })"
    >
      <div class="lang-confirm">
        <p>{{ t('cms.settings.languages.deleteBody') }}</p>
        <p class="lang-confirm__hint">
          {{ t('cms.settings.languages.deleteHint') }}
        </p>
      </div>
      <template #footer>
        <AdminButton
          variant="secondary"
          size="md"
          @click="pendingDelete = null"
        >
          {{ t('cms.common.cancel') }}
        </AdminButton>
        <AdminButton
          variant="destructive"
          size="md"
          @click="confirmDelete"
        >
          {{ t('cms.settings.languages.deleteConfirm') }}
        </AdminButton>
      </template>
    </AdminDialog>

  </AdminSettingsLayout>
</template>

<style scoped>
.lang-add {
  position: relative;
}

.lang-add__popover {
  position: absolute;
  top: calc(100% + var(--cms-space-2));
  right: 0;
  z-index: 10;
  width: min(24rem, calc(100vw - 2 * var(--cms-space-4)));
  padding: var(--cms-space-3);
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-lg);
  background: var(--cms-card);
  box-shadow: var(--cms-shadow-overlay);
}

.lang-card {
  gap: var(--cms-space-4);
  padding: var(--cms-space-2);
}

.lang-list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.lang-row {
  display: flex;
  align-items: center;
  gap: var(--cms-space-3);
  min-height: 3.5rem;
  padding: var(--cms-space-2) var(--cms-space-3) var(--cms-space-2) var(--cms-space-1);
  border-radius: var(--cms-radius-md);
}

.lang-row + .lang-row {
  border-top: var(--cms-border-width) solid var(--cms-border-subtle);
}

.lang-row:hover {
  background: var(--cms-surface-hover);
}

.lang-row--dragging {
  opacity: 0.5;
}

.lang-row--drop {
  box-shadow: inset 0 2px 0 var(--cms-primary);
}

.lang-row--off .lang-row__native {
  color: var(--cms-text-secondary);
}

.lang-row__handle {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: var(--cms-control-sm);
  padding: 0;
  border: 0;
  border-radius: var(--cms-radius-sm);
  background: transparent;
  color: var(--cms-text-tertiary);
  cursor: grab;
}

.lang-row__handle:active {
  cursor: grabbing;
}

.lang-row__handle:focus-visible {
  outline: none;
  box-shadow: var(--cms-focus-ring);
}

.lang-row__handle:disabled {
  visibility: hidden;
}

.lang-row__names {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 var(--cms-space-3);
  min-width: 0;
}

.lang-row__native {
  font-weight: var(--cms-type-label-large-weight);
}

.lang-row__secondary {
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
}

.lang-row__badge {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--cms-space-1);
  padding: 2px var(--cms-space-2);
  border-radius: var(--cms-radius-full);
  background: var(--cms-surface-secondary);
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-label-small-size);
  font-weight: 600;
}

.lang-row__badge--default {
  background: var(--cms-primary-subtle);
  color: var(--cms-primary);
}

/* The switch speaks for itself next to the name; its label stays for screen readers. */
.lang-row__switch :deep(.admin-switch__copy) {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.lang-empty {
  display: flex;
  align-items: center;
  gap: var(--cms-space-3);
  margin: 0 var(--cms-space-2) var(--cms-space-2);
  padding: var(--cms-space-4);
  border: var(--cms-border-width) dashed var(--cms-border);
  border-radius: var(--cms-radius-md);
  color: var(--cms-text-secondary);
}

.lang-empty p {
  margin: 0;
}

.lang-confirm p {
  margin: 0 0 var(--cms-space-3);
}

.lang-confirm__hint {
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
}
</style>
