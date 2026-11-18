<script setup lang="ts">
import { computed } from 'vue'
import { useAdminI18n } from '../../admin/useAdminI18n'
import { isRichTextDoc } from '../../primitives/rich-text'
import { translationLeaf } from '../../primitives/translation'
import { useEditor } from '../inject'
import type { FieldRegistration } from '../kinds'
import { richTextPlain } from '../plain-text'

// Shown only while a translation is edited (C-78): whether the field has its
// own text in this language, what the default language says ("Original"),
// and, with `structure`, which controls belong to the default language.
const props = defineProps<{
  field: FieldRegistration
  /** One-line chip for the mini toolbars of text fields. */
  compact?: boolean
  /** Explains the controls of this panel that are read-only in a translation. */
  structure?: string
}>()

const { t } = useAdminI18n()
const { engine } = useEditor()

const defaultCode = engine.defaultLocaleLabel
const translatable = computed(() => engine.canTranslate(props.field.key))
const translated = computed(() => engine.isTranslated(props.field.key, props.field.kind))

/** What the default language has for the translated part of the field. */
const original = computed(() => {
  const address = translationLeaf(props.field.kind, props.field.key)
  const value = address ? engine.baseValue(address) : undefined

  if (isRichTextDoc(value)) {
    return richTextPlain(value)
  }

  if (typeof value === 'string') {
    return value
  }

  // Not stored in the default language: the text from the page code (an item
  // that is still a code default, a field nobody has edited).
  return props.field.kind === 'link' || props.field.kind === 'button'
    ? props.field.api.defaultLabel()
    : props.field.kind === 'image' || props.field.kind === 'background'
      ? props.field.api.defaultAlt()
      : ''
})
</script>

<template>
  <template v-if="engine.translating.value">
    <span
      v-if="compact"
      class="ed-tr-chip"
      :class="{ 'ed-tr-chip--missing': !translated }"
      :title="original ? t('cms.editor.locale.original', { code: defaultCode, text: original }) : undefined"
    >
      <Icon
        :name="translated ? 'lucide:check' : 'lucide:languages'"
        aria-hidden="true"
      />
      {{ !translatable
        ? t('cms.editor.locale.saveBaseFirstShort', { code: defaultCode })
        : translated ? t('cms.editor.locale.translated') : t('cms.editor.locale.untranslated', { code: defaultCode }) }}
    </span>
    <div
      v-else
      class="ed-tr"
    >
      <p
        v-if="!translatable"
        class="ed-note"
      >
        <Icon
          name="lucide:info"
          aria-hidden="true"
        />
        {{ t('cms.editor.locale.saveBaseFirst', { code: defaultCode }) }}
      </p>
      <template v-else>
        <p
          class="ed-tr__status"
          :class="{ 'ed-tr__status--missing': !translated }"
        >
          <Icon
            :name="translated ? 'lucide:check' : 'lucide:languages'"
            aria-hidden="true"
          />
          {{ translated ? t('cms.editor.locale.translated') : t('cms.editor.locale.untranslated', { code: defaultCode }) }}
        </p>
        <p
          v-if="original"
          class="ed-tr__original"
        >
          <span class="ed-tr__original-label">{{ t('cms.editor.locale.originalLabel', { code: defaultCode }) }}</span>
          {{ original }}
        </p>
      </template>
      <p
        v-if="structure"
        class="ed-hint"
      >
        {{ structure }}
      </p>
    </div>
  </template>
</template>
