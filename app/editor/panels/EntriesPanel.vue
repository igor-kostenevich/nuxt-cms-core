<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { useAdminI18n } from '../../admin/useAdminI18n'
import type { CmsEntryListItem, CmsEntrySelectionValue, CmsEntryState } from '../../types/entries'
import { useEditorEntries } from '../entries'
import { useEditor } from '../inject'
import type { FieldRegistration } from '../kinds'
import { entryChoiceProblem, moveEntryId } from '../entries-choice'
import ResetButton from './ResetButton.vue'

// The choice of a section of entries (014 §7): the newest N (Automatic) or
// chosen entries in an order (Manual). The page reads what is chosen; this
// panel only stores `{ mode, limit }` / `{ mode, ids }` in the page's
// document. Chosen entries the site would not show are explained here.
const props = defineProps<{
  field: Extract<FieldRegistration, { kind: 'entries' }>
}>()

const { t } = useAdminI18n()
const { engine, view } = useEditor()
const entries = useEditorEntries()

const stored = computed(() => (engine.get(props.field.key) ?? null) as CmsEntrySelectionValue | null)
const mode = computed(() => stored.value?.mode ?? 'automatic')
const limit = computed(() => (stored.value?.mode === 'automatic' && stored.value.limit) || props.field.api.limit())
const ids = computed(() => (stored.value?.mode === 'manual' ? stored.value.ids : []))
const max = computed(() => props.field.api.max())
// Structure: the same in every language (C-78).
const locked = computed(() => engine.translating.value)

function write(value: CmsEntrySelectionValue) {
  engine.set(props.field.key, value)
}

function setMode(next: 'automatic' | 'manual') {
  if (next === mode.value) {
    return
  }

  // Manual starts from what the section shows now.
  write(next === 'manual'
    ? { mode: 'manual', ids: props.field.api.shown().slice(0, max.value) }
    : { mode: 'automatic', limit: limit.value })
}

function setLimit(text: string) {
  const value = Number.parseInt(text, 10)

  if (Number.isInteger(value) && value >= 1 && value <= max.value) {
    write({ mode: 'automatic', limit: value })
  }
}

function setIds(next: string[]) {
  write({ mode: 'manual', ids: next })
}

function move(id: string, by: -1 | 1) {
  setIds(moveEntryId(ids.value, id, by))
}

// ── What the chosen entries are, and why the site may not show one ────

const states = shallowRef(new Map<string, CmsEntryState>())

watch(ids, async (now) => {
  try {
    const rows = await entries.status(now)
    states.value = new Map(rows.map(row => [row.id, row]))
  } catch {
    states.value = new Map()
  }
}, { immediate: true })

function titleOf(id: string) {
  return states.value.get(id)?.title ?? t('cms.pages.type.untitled')
}

/** Why the site leaves the entry out (`hidden`), or shows it differently. */
function problemOf(id: string): { hidden: boolean, text: string } | null {
  const problem = entryChoiceProblem(states.value.get(id), {
    type: props.field.api.type(),
    defaultLocale: engine.defaultLocale.value,
    locale: engine.locale.value,
  })

  if (!problem) {
    return null
  }

  return {
    hidden: problem !== 'untranslated',
    text: t(`cms.editor.entries.${problem}`, { code: (engine.locale.value ?? '').toUpperCase() }),
  }
}

// ── Picker ───────────────────────────────────────────────────────────

const search = ref('')
const results = shallowRef<CmsEntryListItem[]>([])
const searching = ref(false)

async function find() {
  searching.value = true

  try {
    const list = await entries.list(props.field.api.type(), { search: search.value.trim(), sort: 'updated', limit: 20 })
    results.value = list.items
  } catch {
    results.value = []
  } finally {
    searching.value = false
  }
}

watchDebounced(search, () => void find(), { debounce: 250 })
watch(mode, (now) => {
  if (now === 'manual' && results.value.length === 0) {
    void find()
  }
}, { immediate: true })

const offered = computed(() => results.value.filter(item => !ids.value.includes(item.id)))
const full = computed(() => ids.value.length >= max.value)

function add(item: CmsEntryListItem) {
  if (!full.value) {
    setIds([...ids.value, item.id])
  }
}

function done() {
  view.select(null)
  props.field.el.focus({ preventScroll: true })
}
</script>

<template>
  <div
    class="ed-card ed-entries"
    data-test="entries-panel"
  >
    <p
      v-if="locked"
      class="ed-note"
    >
      <Icon
        name="lucide:lock"
        aria-hidden="true"
      />
      {{ t('cms.editor.entries.locked', { code: engine.defaultLocaleLabel.value }) }}
    </p>

    <div
      class="ed-entries__modes"
      role="group"
      :aria-label="t('cms.editor.entries.mode')"
    >
      <AdminButton
        v-for="option in (['automatic', 'manual'] as const)"
        :key="option"
        variant="ghost"
        size="xs"
        :aria-pressed="mode === option ? 'true' : 'false'"
        :disabled="locked"
        @click="setMode(option)"
      >
        {{ t(`cms.editor.entries.${option}`) }}
      </AdminButton>
    </div>

    <template v-if="mode === 'automatic'">
      <AdminInput
        :model-value="String(limit)"
        :label="t('cms.editor.entries.limit')"
        :hint="t('cms.editor.entries.automaticHint', { count: limit })"
        size="sm"
        type="number"
        min="1"
        :max="max"
        name="cms-entries-limit"
        :disabled="locked"
        @focus="engine.beginEdit(field.key)"
        @blur="engine.endEdit()"
        @update:model-value="setLimit"
      />
    </template>

    <template v-else>
      <p class="ed-hint">
        {{ t('cms.editor.entries.manualHint', { count: ids.length, max }) }}
      </p>
      <ol
        v-if="ids.length > 0"
        class="ed-entries__list"
        data-test="entries-chosen"
      >
        <li
          v-for="(id, index) in ids"
          :key="id"
          class="ed-entries__row"
        >
          <span class="ed-entries__main">
            <span class="ed-entries__title">{{ titleOf(id) }}</span>
            <span
              v-if="problemOf(id)"
              class="ed-entries__problem"
              :class="{ 'ed-entries__problem--hidden': problemOf(id)!.hidden }"
            >{{ problemOf(id)!.text }}</span>
          </span>
          <template v-if="!locked">
            <AdminButton
              variant="ghost"
              size="xs"
              icon-only
              :aria-label="t('cms.content.moveUp')"
              :disabled="index === 0"
              @click="move(id, -1)"
            >
              <Icon
                name="lucide:chevron-up"
                aria-hidden="true"
              />
            </AdminButton>
            <AdminButton
              variant="ghost"
              size="xs"
              icon-only
              :aria-label="t('cms.content.moveDown')"
              :disabled="index === ids.length - 1"
              @click="move(id, 1)"
            >
              <Icon
                name="lucide:chevron-down"
                aria-hidden="true"
              />
            </AdminButton>
            <AdminButton
              variant="ghost"
              size="xs"
              icon-only
              :aria-label="t('cms.editor.entries.remove', { title: titleOf(id) })"
              @click="setIds(ids.filter(item => item !== id))"
            >
              <Icon
                name="lucide:x"
                aria-hidden="true"
              />
            </AdminButton>
          </template>
        </li>
      </ol>

      <div
        v-if="!locked"
        class="ed-stack"
      >
        <AdminInput
          v-model="search"
          :label="t('cms.editor.entries.add')"
          :placeholder="t('cms.editor.entries.search')"
          size="sm"
          type="search"
          name="cms-entries-search"
          autocomplete="off"
        />
        <p
          v-if="full"
          class="ed-hint"
        >
          {{ t('cms.editor.entries.full', { max }) }}
        </p>
        <ul
          v-else
          class="ed-entries__list"
          data-test="entries-offered"
          :aria-busy="searching ? 'true' : 'false'"
        >
          <li
            v-for="item in offered"
            :key="item.id"
            class="ed-entries__row"
          >
            <span class="ed-entries__main">
              <span class="ed-entries__title">{{ item.title ?? t('cms.pages.type.untitled') }}</span>
              <span
                v-if="item.status === 'draft'"
                class="ed-entries__problem ed-entries__problem--hidden"
              >{{ t('cms.editor.entries.unpublished') }}</span>
            </span>
            <AdminButton
              variant="secondary"
              size="xs"
              @click="add(item)"
            >
              {{ t('cms.editor.entries.addOne') }}
            </AdminButton>
          </li>
          <li
            v-if="!searching && offered.length === 0"
            class="ed-hint"
          >
            {{ t('cms.editor.entries.nothing') }}
          </li>
        </ul>
      </div>
    </template>

    <div class="ed-actions">
      <ResetButton
        v-if="!locked"
        :field="field"
      />
      <span class="ed-actions__spacer" />
      <AdminButton
        variant="primary"
        size="xs"
        @click="done"
      >
        {{ t('cms.editor.field.done') }}
      </AdminButton>
    </div>
  </div>
</template>

<style scoped>
.ed-entries {
  width: 340px;
}

.ed-entries__modes {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: var(--cms-radius-md);
  background: var(--cms-surface-secondary);
}

.ed-entries__modes > * {
  flex: 1;
}

.ed-entries__modes [aria-pressed="true"] {
  background: var(--cms-card);
  box-shadow: var(--cms-shadow-sm);
}

.ed-entries__list {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ed-entries__row {
  display: flex;
  align-items: center;
  gap: var(--cms-space-1);
  min-height: var(--cms-control-sm);
  padding: var(--cms-space-1) var(--cms-space-2);
  border-radius: var(--cms-radius-md);
  background: var(--cms-surface-secondary);
}

.ed-entries__main {
  display: grid;
  flex: 1;
  min-width: 0;
}

.ed-entries__title {
  overflow: hidden;
  font-size: var(--cms-type-body-small-size);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ed-entries__problem {
  color: var(--cms-info-text);
  font-size: var(--cms-type-helper-size);
  line-height: var(--cms-type-helper-line);
}

.ed-entries__problem--hidden {
  color: var(--cms-warning);
}
</style>
