<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { SLUG_FORMAT, SLUG_MAX } from '../admin/slug'
import { useAdminI18n } from '../admin/useAdminI18n'
import type { CmsEntrySlugCheck } from '../types/entries'
import { useEditorEntries } from './entries'
import { useEditorField } from './field'
import { useEditor } from './inject'

// The address of an entry with a route (014 §6), under the toolbar: the `slug`
// leaf of the document, so Undo, translation (a language's own address),
// History and Restore work as for any text. Format and length are checked as
// typed, a static page of the site and another entry's address too; Publish
// checks the same again on the server.
const props = defineProps<{
  type: string
  entryId: string
  /** `/blog/` */
  prefix: string
  /** Slugs static pages of the site take next to the route (`archive`). */
  reserved: readonly string[]
}>()

const { t } = useAdminI18n()
const entries = useEditorEntries()
const el = shallowRef<HTMLElement | null>(null)

const { engine } = useEditor()
const { view, key } = useEditorField({
  kind: 'text',
  fieldKey: () => 'slug',
  absolute: true,
  el,
  label: () => t('cms.editor.address.label'),
  required: () => true,
  maxLength: () => SLUG_MAX,
  value: () => engine.get('slug'),
  api: undefined,
})

const value = computed(() => {
  const stored = engine.get('slug')
  return typeof stored === 'string' ? stored : ''
})
const editable = computed(() => view.editable.value && engine.canTranslate(key.value))

function onInput(next: string) {
  engine.beginEdit('slug')
  engine.set('slug', next.trim().toLowerCase())
}

/** The wrapper renders AdminInput; the field is its input element. */
function bind(node: unknown) {
  el.value = node instanceof HTMLElement ? node.querySelector('input') : null
}

// ── Checks ───────────────────────────────────────────────────────────

const check = shallowRef<CmsEntrySlugCheck | null>(null)
const checking = ref(false)
let asked = 0

const local = computed<'empty' | 'format' | 'length' | 'reserved' | null>(() => {
  const slug = value.value

  if (!slug) {
    return 'empty'
  }

  if (slug.length > SLUG_MAX) {
    return 'length'
  }

  if (!SLUG_FORMAT.test(slug)) {
    return 'format'
  }

  return props.reserved.includes(slug) ? 'reserved' : null
})

const ask = useDebounceFn(async (slug: string, locale: string) => {
  const mine = ++asked
  checking.value = true

  try {
    const result = await entries.checkSlug(props.type, props.entryId, locale, slug)

    if (mine === asked) {
      check.value = result
    }
  } catch {
    if (mine === asked) {
      check.value = null
    }
  } finally {
    if (mine === asked) {
      checking.value = false
    }
  }
}, 400)

watch([value, () => engine.locale.value, local], ([slug, locale, problem]) => {
  check.value = null

  if (!problem && locale) {
    void ask(slug, locale)
  }
}, { immediate: true })

const error = computed(() => {
  switch (local.value) {
    case 'empty': return t('cms.editor.address.required')
    case 'length': return t('cms.editor.address.tooLong', { max: SLUG_MAX })
    case 'format': return t('cms.editor.address.format')
    case 'reserved': return t('cms.editor.address.reserved')
  }

  if (check.value?.status === 'taken') {
    return check.value.holderArchived
      ? t('cms.editor.address.takenArchived', { title: check.value.holderTitle ?? '' })
      : t('cms.editor.address.taken', { title: check.value.holderTitle ?? '' })
  }

  return undefined
})

/** The published address of this language, when the draft moves away from it. */
const leaving = computed(() => {
  const published = engine.publishedValue('slug')
  return typeof published === 'string' && published && published !== value.value ? published : null
})

const hint = computed(() => {
  const counter = `${value.value.length} / ${SLUG_MAX}`

  if (leaving.value) {
    return `${counter} · ${t('cms.editor.address.leaving', { path: `${props.prefix}${leaving.value}` })}`
  }

  return checking.value
    ? `${counter} · ${t('cms.editor.address.checking')}`
    : `${t('cms.editor.address.hint')} · ${counter}`
})

/** The link as visitors see it: the site's host and the route, then the editable end. */
const site = import.meta.client ? window.location.host : ''
</script>

<template>
  <div
    class="entry-address"
    role="group"
    :aria-label="t('cms.editor.address.label')"
  >
    <span
      class="entry-address__label"
      aria-hidden="true"
    >{{ t('cms.editor.address.label') }}</span>
    <span
      class="entry-address__prefix"
      aria-hidden="true"
    >{{ site }}{{ prefix }}</span>
    <div
      :ref="bind"
      class="entry-address__field"
    >
      <AdminInput
        :model-value="value"
        :label="t('cms.editor.address.label')"
        :error="error"
        :hint="hint"
        :disabled="!editable"
        size="sm"
        hide-label
        spellcheck="false"
        autocomplete="off"
        data-test="entry-address"
        @update:model-value="onInput"
        @blur="engine.endEdit()"
      />
    </div>
    <span
      v-if="engine.translating.value"
      class="entry-address__locale"
    >{{ (engine.locale.value ?? '').toUpperCase() }}</span>
  </div>
</template>

<style scoped>
.entry-address {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--cms-space-2);
  padding: var(--cms-space-2) var(--cms-space-4);
  border-top: var(--cms-border-width) solid var(--cms-border);
  background: var(--cms-card);
}

.entry-address__label {
  padding-top: var(--cms-space-2);
  font-size: var(--cms-type-label-size);
  font-weight: var(--cms-type-label-weight);
  white-space: nowrap;
}

.entry-address__prefix {
  padding-top: var(--cms-space-2);
  overflow-wrap: anywhere;
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
}

.entry-address__field {
  flex: 1 1 14rem;
  max-width: 32rem;
}

.entry-address__locale {
  padding-top: var(--cms-space-2);
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-caption-size);
  font-weight: 600;
}
</style>
