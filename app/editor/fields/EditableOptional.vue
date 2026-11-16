<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CmsOptionalValue } from '../../types/primitives'
import { useAdminI18n } from '../../admin/useAdminI18n'
import { useEditorField } from '../field'

// Editable branch of CmsOptional. A hidden block leaves a slim bar in its
// place, so the editor can find it and show it again.
const props = defineProps<{
  value?: CmsOptionalValue | null
  fieldKey: string
  tag: string
  fieldLabel?: string
}>()

const { t } = useAdminI18n()
const el = ref<HTMLElement | null>(null)
const hidden = computed(() => props.value?.hidden === true)

const { engine, view, key } = useEditorField({
  kind: 'optional',
  fieldKey: () => props.fieldKey,
  el,
  label: () => props.fieldLabel,
  api: {
    hidden: () => hidden.value,
    toggle: () => toggle(),
  },
})

function toggle() {
  engine.set(key.value, hidden.value ? { hidden: false } : { hidden: true })
}

const name = computed(() => props.fieldLabel ?? props.fieldKey)
</script>

<template>
  <div
    v-if="hidden"
    ref="el"
    class="cms-admin cms-editor-ui cms-hidden-block"
  >
    <span class="cms-hidden-block__text">
      {{ t('cms.editor.field.hidden', { name }) }}
    </span>
    <button
      v-if="view.editable.value"
      type="button"
      class="cms-hidden-block__show"
      @click.stop="toggle"
    >
      {{ t('cms.editor.field.show') }}
    </button>
  </div>
  <component
    :is="tag"
    v-else
    ref="el"
  >
    <slot />
  </component>
</template>
