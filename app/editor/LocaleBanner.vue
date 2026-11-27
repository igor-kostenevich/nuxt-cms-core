<script setup lang="ts">
import { computed, watch } from 'vue'
import { useAdminI18n } from '../admin/useAdminI18n'
import { useEditor } from './inject'

// A thin strip under the toolbar while a translation is edited: what can be
// changed in this language, and what belongs to the default one (C-78).
const props = withDefaults(defineProps<{
  /** The "only untranslated" filter dims the page through the Overlay; a form has none. */
  filter?: boolean
}>(), { filter: true })

const { t } = useAdminI18n()
const { engine, view } = useEditor()

const code = computed(() => (engine.locale.value ?? '').toUpperCase())
const defaultCode = engine.defaultLocaleLabel
// Fields on this page still to translate; a hint, not a progress bar.
const remaining = computed(() => engine.untranslated.value.size)

// Nothing left to show, or back in the default language: the filter goes off.
watch([remaining, engine.translating], ([count, translating]) => {
  if (count === 0 || !translating) {
    view.onlyUntranslated.value = false
  }
})
</script>

<template>
  <div
    v-if="engine.translating.value && engine.status.value === 'ready'"
    class="locale-banner"
  >
    <Icon
      name="lucide:languages"
      aria-hidden="true"
    />
    <span class="locale-banner__text">
      <strong>{{ t('cms.editor.locale.bannerTitle', { code }) }}.</strong>
      {{ t('cms.editor.locale.bannerBody', { code: defaultCode }) }}
    </span>
    <button
      v-if="props.filter"
      type="button"
      class="locale-banner__filter"
      :aria-pressed="view.onlyUntranslated.value"
      :disabled="remaining === 0"
      @click="view.onlyUntranslated.value = !view.onlyUntranslated.value"
    >
      <Icon
        :name="remaining === 0 ? 'lucide:check' : 'lucide:filter'"
        aria-hidden="true"
      />
      {{ remaining === 0
        ? t('cms.editor.locale.allTranslated')
        : t('cms.editor.locale.onlyUntranslated', { count: remaining }) }}
    </button>
  </div>
</template>

<style scoped>
.locale-banner {
  display: flex;
  align-items: center;
  gap: var(--cms-space-3);
  padding: var(--cms-space-2) var(--cms-space-5);
  border-bottom: var(--cms-border-width) solid var(--cms-border-subtle);
  background: var(--cms-surface-secondary);
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
  line-height: var(--cms-type-body-small-line);
}

.locale-banner__text {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.locale-banner__filter {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--cms-space-2);
  min-height: var(--cms-control-sm);
  padding: 0 var(--cms-space-3);
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-full);
  background: var(--cms-card);
  color: var(--cms-foreground);
  font: inherit;
  font-size: var(--cms-type-body-small-size);
  white-space: nowrap;
  cursor: pointer;
}

.locale-banner__filter:hover {
  background: var(--cms-surface-hover);
}

.locale-banner__filter[aria-pressed="true"] {
  border-color: var(--cms-info-text);
  background: var(--cms-info-subtle);
  color: var(--cms-info-text);
}

.locale-banner__filter:disabled {
  border-color: transparent;
  background: transparent;
  color: var(--cms-success-text);
  cursor: default;
}

.locale-banner__filter:focus-visible {
  outline: none;
  box-shadow: var(--cms-focus-ring);
}

.locale-banner strong {
  color: var(--cms-foreground);
  font-weight: 600;
}
</style>
