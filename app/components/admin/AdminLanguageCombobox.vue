<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId, useTemplateRef, watch } from 'vue'
import { displayName, isLocaleCode, languageInput, searchLanguages, type LanguageOption } from '../../admin/languages'
import { useAdminI18n } from '../../admin/useAdminI18n'

// Language search of Settings → Languages, inside the "Add language" popover:
// a combobox whose list is always shown under the field. Choosing a language
// is the action itself, there is no separate "Add" button. Options show
// names only; typing a code still finds the language, and a valid code that
// is not in the catalog is offered as "Use code …".
const props = defineProps<{
  /** Codes already added: not offered again. */
  taken: string[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  pick: [code: string]
}>()

const { t, locale } = useAdminI18n()
const id = useId()
const listId = `${id}-list`
const list = useTemplateRef<HTMLElement>('list')
const input = useTemplateRef<HTMLInputElement>('input')

const query = ref('')
const active = ref(0)

type Option = LanguageOption & { custom?: boolean }

/** How many catalog matches the list shows. */
const MAX_OPTIONS = 50

const options = computed<Option[]>(() => {
  const found: Option[] = searchLanguages(query.value, props.taken, locale.value).slice(0, MAX_OPTIONS)
  const typed = query.value.trim()

  // A well-formed code outside the catalog: offer it as it is.
  if (isLocaleCode(typed) && !props.taken.includes(typed) && !found.some(option => option.code === typed)) {
    found.push({
      code: typed,
      label: displayName(typed, locale.value) ?? typed,
      native: languageInput(typed).nativeName,
      custom: true,
    })
  }

  return found
})

/** A code-shaped entry that the database would refuse: tell why, near the field. */
const error = computed(() => {
  const typed = query.value.trim()

  if (!typed || options.value.length > 0) {
    return undefined
  }

  return /^[a-z]{2,3}[-_]/i.test(typed) ? t('cms.settings.languages.codeFormat') : undefined
})

watch(options, () => {
  active.value = 0
})

onMounted(() => {
  input.value?.focus()
})

function pick(option: Option | undefined) {
  if (option && !props.disabled) {
    emit('pick', option.code)
  }
}

async function onKeydown(event: KeyboardEvent) {
  const count = options.value.length

  if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && count > 0) {
    event.preventDefault()
    active.value = (active.value + (event.key === 'ArrowDown' ? 1 : -1) + count) % count
    await nextTick()
    list.value?.querySelector(`#${CSS.escape(`${id}-option-${active.value}`)}`)?.scrollIntoView({ block: 'nearest' })
  } else if (event.key === 'Enter') {
    event.preventDefault()
    pick(options.value[active.value])
  }
}
</script>

<template>
  <div class="lang-combo">
    <div class="lang-combo__field">
      <Icon
        name="lucide:search"
        class="lang-combo__icon"
        aria-hidden="true"
      />
      <input
        :id="id"
        ref="input"
        v-model="query"
        type="text"
        role="combobox"
        class="lang-combo__input"
        autocomplete="off"
        spellcheck="false"
        :aria-label="t('cms.settings.languages.searchLabel')"
        :placeholder="t('cms.settings.languages.searchPlaceholder')"
        :disabled="disabled"
        aria-expanded="true"
        :aria-controls="listId"
        aria-autocomplete="list"
        :aria-activedescendant="options.length > 0 ? `${id}-option-${active}` : undefined"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="error ? `${id}-error` : undefined"
        @keydown="onKeydown"
      >
    </div>
    <ul
      v-if="options.length > 0"
      :id="listId"
      ref="list"
      class="lang-combo__list"
      role="listbox"
      :aria-label="t('cms.settings.languages.searchLabel')"
    >
      <li
        v-for="(option, index) in options"
        :id="`${id}-option-${index}`"
        :key="option.code"
        role="option"
        class="lang-combo__option"
        :class="{ 'lang-combo__option--active': index === active }"
        :aria-selected="index === active"
        @mousedown.prevent
        @mousemove="active = index"
        @click="pick(option)"
      >
        <span class="lang-combo__name">
          <template v-if="option.custom">{{ t('cms.settings.languages.useCode', { code: option.code }) }} · </template>{{ option.label }}
        </span>
        <!-- The name in the language itself, unless it reads the same. -->
        <span
          v-if="option.native !== option.label"
          class="lang-combo__native"
          :lang="option.code"
        >{{ option.native }}</span>
      </li>
    </ul>
    <p
      v-else-if="error"
      :id="`${id}-error`"
      class="lang-combo__message lang-combo__message--error"
    >
      {{ error }}
    </p>
    <p
      v-else
      class="lang-combo__message"
    >
      {{ t('cms.settings.languages.noResults') }}
    </p>
  </div>
</template>

<style scoped>
.lang-combo {
  display: grid;
  gap: var(--cms-space-2);
}

.lang-combo__field {
  position: relative;
}

.lang-combo__icon {
  position: absolute;
  top: 50%;
  left: var(--cms-space-3);
  color: var(--cms-text-tertiary);
  transform: translateY(-50%);
  pointer-events: none;
}

.lang-combo__input {
  width: 100%;
  height: var(--cms-control-md);
  padding: 0 var(--cms-space-3) 0 calc(var(--cms-space-3) * 2 + 16px);
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-sm);
  background: var(--cms-card);
  color: var(--cms-foreground);
  font: inherit;
  font-size: var(--cms-type-body-size);
}

.lang-combo__input::placeholder {
  color: var(--cms-text-tertiary);
}

.lang-combo__input:focus-visible {
  outline: none;
  border-color: var(--cms-ring);
  box-shadow: var(--cms-focus-ring-field);
}

.lang-combo__input[aria-invalid="true"] {
  border-color: var(--cms-destructive);
}

.lang-combo__list {
  max-height: 18rem;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  list-style: none;
}

.lang-combo__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cms-space-3);
  min-height: var(--cms-control-lg);
  padding: var(--cms-space-2) var(--cms-space-3);
  border-radius: var(--cms-radius-sm);
  cursor: pointer;
}

.lang-combo__option--active {
  background: var(--cms-surface-hover);
}

.lang-combo__native {
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
}

.lang-combo__message {
  margin: 0;
  padding: var(--cms-space-3);
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
  text-align: center;
}

.lang-combo__message--error {
  color: var(--cms-destructive-text);
  text-align: left;
}
</style>
