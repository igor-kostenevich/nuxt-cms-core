<script setup lang="ts">
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { useAdminI18n } from '../admin/useAdminI18n'
import type { CmsPageLocaleState } from '../types/pages'
import { useEditor } from './inject'
import { useEditorLanguages } from './languages'
import { useEditorLocale } from './session'

// Language of the edited content, next to the page switcher. Shown when there
// is more than one language, hidden ones included: a hidden language is being
// translated and not shown on the site yet (C-83). Each language shows its
// state, derived from the stored rows (Б9 §22).
const { t } = useAdminI18n()
const { engine } = useEditor()
const { switchLocale } = useEditorLocale()
const { languages, multilingual } = useEditorLanguages()
const uid = useId()

const open = ref(false)
const box = useTemplateRef<HTMLElement>('box')
const states = ref<CmsPageLocaleState[]>([])

onClickOutside(box, () => {
  open.value = false
})

type LocaleTone = 'success' | 'info' | 'neutral'

function stateOf(code: string): { text: string, tone: LocaleTone, icon: string } {
  const state = states.value.find(item => item.locale === code)

  if (state?.hasDraft) {
    return { text: t('cms.editor.locale.stateDraft'), tone: 'info', icon: 'lucide:pencil-line' }
  }

  if (state?.publishedAt) {
    return { text: t('cms.editor.locale.statePublished'), tone: 'success', icon: 'lucide:circle-check' }
  }

  return code === engine.defaultLocale.value
    ? { text: t('cms.editor.locale.stateEmpty'), tone: 'neutral', icon: 'lucide:circle-dashed' }
    : { text: t('cms.editor.locale.stateUntranslated'), tone: 'neutral', icon: 'lucide:circle-dashed' }
}

const current = computed(() => (engine.locale.value ?? '').toUpperCase())

async function refreshStates() {
  if (!engine.entity.value) {
    return
  }

  states.value = await engine.listLocaleStates().catch(() => states.value)
}

// Loaded once the page is ready, so the list opens with its states, and again
// after Save / Publish or a language switch change them.
watch([engine.status, engine.hasDraft, engine.publishedAt, engine.locale], () => {
  if (engine.status.value === 'ready' && multilingual.value) {
    void refreshStates()
  }
}, { immediate: true })

async function toggle() {
  open.value = !open.value

  if (open.value) {
    void refreshStates()
    await nextTick()
    box.value?.querySelector<HTMLElement>('[aria-current="true"], .locales__item')?.focus()
  }
}

function close() {
  open.value = false
  box.value?.querySelector<HTMLElement>('.tb-locale')?.focus()
}

function choose(code: string) {
  open.value = false
  void switchLocale(code)
}

/** Up / Down move between the languages, as in a menu. */
function onListKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
    return
  }

  event.preventDefault()
  const items = [...(box.value?.querySelectorAll<HTMLElement>('.locales__item') ?? [])]
  const index = items.indexOf(document.activeElement as HTMLElement)
  const next = event.key === 'ArrowDown' ? index + 1 : index - 1
  items[(next + items.length) % items.length]?.focus()
}
</script>

<template>
  <div
    v-if="multilingual"
    ref="box"
    class="locales"
    @keydown.esc.stop="close"
  >
    <button
      type="button"
      class="tb-locale"
      :aria-expanded="open"
      :aria-controls="`${uid}-locales`"
      :title="t('cms.editor.locale.switcher')"
      :aria-label="t('cms.editor.locale.switcherCurrent', { code: current })"
      @click="toggle"
    >
      <Icon
        name="lucide:languages"
        aria-hidden="true"
      />
      <span
        class="tb-locale__code"
        translate="no"
      >{{ current }}</span>
      <Icon
        name="lucide:chevron-down"
        class="tb-locale__chevron"
        aria-hidden="true"
      />
    </button>
    <ul
      v-if="open"
      :id="`${uid}-locales`"
      class="locales__list"
      :aria-label="t('cms.editor.locale.switcher')"
      @keydown="onListKeydown"
    >
      <li
        v-for="language in languages"
        :key="language.code"
      >
        <button
          type="button"
          class="locales__item"
          :aria-current="language.code === engine.locale.value ? 'true' : undefined"
          @click="choose(language.code)"
        >
          <span
            class="locales__code"
            translate="no"
          >{{ language.code.toUpperCase() }}</span>
          <span class="locales__name">
            <span :lang="language.code">{{ language.nativeName }}</span>
            <span
              v-if="language.code === engine.defaultLocale.value"
              class="locales__default"
            >{{ t('cms.editor.locale.default') }}</span>
            <span
              v-else-if="!language.active"
              class="locales__default"
            >
              <Icon
                name="lucide:eye-off"
                aria-hidden="true"
              />
              {{ t('cms.editor.locale.hiddenOnSite') }}
            </span>
          </span>
          <span
            class="locales__state"
            :class="`locales__state--${stateOf(language.code).tone}`"
          >
            <Icon
              :name="stateOf(language.code).icon"
              aria-hidden="true"
            />
            {{ stateOf(language.code).text }}
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.locales {
  position: relative;
  flex: none;
}

.tb-locale,
.locales__item {
  font: inherit;
  cursor: pointer;
}

.tb-locale {
  display: inline-flex;
  align-items: center;
  gap: var(--cms-space-2);
  height: var(--cms-control-md);
  padding: 0 var(--cms-space-3);
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-sm);
  background: var(--cms-surface-secondary);
  color: var(--cms-foreground);
  font-size: var(--cms-type-label-large-size);
}

.tb-locale:hover {
  background: var(--cms-surface-hover);
}

.tb-locale__code {
  font-weight: var(--cms-type-label-large-weight);
  letter-spacing: 0.02em;
}

.tb-locale__chevron {
  color: var(--cms-text-secondary);
}

.locales__list {
  position: absolute;
  top: calc(100% + var(--cms-space-1));
  left: 0;
  z-index: 2;
  min-width: 300px;
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

.locales__item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--cms-space-3);
  width: 100%;
  min-height: var(--cms-control-lg);
  padding: var(--cms-space-2) var(--cms-space-3);
  border: 0;
  border-radius: var(--cms-radius-sm);
  background: transparent;
  color: var(--cms-foreground);
  text-align: left;
}

.locales__item:hover {
  background: var(--cms-surface-hover);
}

.locales__item[aria-current="true"] {
  background: var(--cms-surface-selected);
}

.tb-locale:focus-visible,
.locales__item:focus-visible {
  outline: none;
  box-shadow: var(--cms-focus-ring);
}

.locales__code {
  min-width: 32px;
  padding: 2px var(--cms-space-1);
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-sm);
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-label-small-size);
  font-weight: 600;
  text-align: center;
}

.locales__name {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--cms-space-2);
  min-width: 0;
}

.locales__default {
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-helper-size);
}

.locales__state {
  display: inline-flex;
  align-items: center;
  gap: var(--cms-space-1);
  font-size: var(--cms-type-helper-size);
  white-space: nowrap;
}

.locales__state--success {
  color: var(--cms-success-text);
}

.locales__state--info {
  color: var(--cms-info-text);
}

.locales__state--neutral {
  color: var(--cms-text-secondary);
}

@media (max-width: 1100px) {
  .tb-locale__chevron {
    display: none;
  }
}
</style>
