<script setup lang="ts">
import { computed } from 'vue'
import { useAdminI18n } from '../../admin/useAdminI18n'
import { toSafeHref } from '../../primitives/link'
import type { CmsLinkValue } from '../../types/primitives'
import { useEditor } from '../inject'
import type { FieldRegistration } from '../kinds'
import { linkKind } from '../link-kind'
import { useEditorSession } from '../session'
import ResetButton from './ResetButton.vue'
import TranslationNote from './TranslationNote.vue'

// Link and button editor: label, address, new tab, and a way to follow the
// link, since a click on it in Edit Mode selects instead of navigating.
const props = defineProps<{
  field: Extract<FieldRegistration, { kind: 'link' | 'button' }>
}>()

const { t } = useAdminI18n()
const { engine, view } = useEditor()
const session = useEditorSession()

const stored = computed(() => (engine.get(props.field.key) ?? null) as CmsLinkValue | null)
const label = computed(() => stored.value?.label ?? props.field.api.defaultLabel())
const href = computed(() => stored.value?.href ?? props.field.api.defaultHref() ?? '')
const newTab = computed(() => stored.value?.newTab ?? false)
const kind = computed(() => linkKind(href.value))

/**
 * Writes only what the editor changed. The code defaults (slot label, `href`
 * prop) stay defaults: copying them into content would freeze them, and a
 * later change in the page code would no longer show.
 */
function update(patch: Partial<CmsLinkValue>) {
  const next: CmsLinkValue = { ...stored.value, ...patch }

  if (next.newTab === false) {
    delete next.newTab
  }

  engine.set(props.field.key, Object.keys(next).length > 0 ? next : undefined)
}

function open() {
  const safe = toSafeHref(href.value)

  if (safe) {
    void session.goTo(safe, newTab.value)
  }
}

function done() {
  view.select(null)
  props.field.el.focus({ preventScroll: true })
}
</script>

<template>
  <form
    class="ed-card ed-card--narrow"
    @submit.prevent="done"
  >
    <TranslationNote
      :field="field"
      :structure="t('cms.editor.locale.structureLink', { code: engine.defaultLocaleLabel.value })"
    />
    <AdminInput
      :model-value="label"
      :label="t('cms.editor.link.label')"
      size="sm"
      name="cms-link-label"
      autocomplete="off"
      @focus="engine.beginEdit(field.key)"
      @blur="engine.endEdit()"
      @update:model-value="update({ label: $event })"
    />

    <AdminInput
      :model-value="href"
      :label="t('cms.editor.link.destination')"
      :hint="t('cms.editor.link.type', { type: t(`cms.editor.link.types.${kind}`) })"
      :error="kind === 'invalid' ? t('cms.editor.link.types.invalid') : undefined"
      :placeholder="t('cms.editor.link.destinationHint')"
      size="sm"
      name="cms-link-href"
      inputmode="url"
      autocomplete="off"
      spellcheck="false"
      :disabled="engine.translating.value"
      @focus="engine.beginEdit(field.key)"
      @blur="engine.endEdit()"
      @update:model-value="update({ href: $event })"
    />

    <label class="ed-check">
      <input
        type="checkbox"
        :checked="newTab"
        :disabled="engine.translating.value"
        @change="update({ newTab: ($event.target as HTMLInputElement).checked })"
      >
      {{ t('cms.editor.link.newTab') }}
    </label>

    <p class="ed-hint">
      {{ t('cms.editor.link.openHint') }}
    </p>

    <div class="ed-actions">
      <ResetButton :field="field" />
      <span class="ed-actions__spacer" />
      <AdminButton
        variant="secondary"
        size="xs"
        :disabled="kind === 'none' || kind === 'invalid'"
        @click="open"
      >
        {{ t('cms.editor.link.open') }}
        <template #trailing>
          <Icon
            name="lucide:arrow-up-right"
            aria-hidden="true"
          />
        </template>
      </AdminButton>
      <AdminButton
        variant="primary"
        size="xs"
        type="submit"
      >
        {{ t('cms.editor.field.done') }}
      </AdminButton>
    </div>
  </form>
</template>
