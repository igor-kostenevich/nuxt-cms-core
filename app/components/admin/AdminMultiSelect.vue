<script setup lang="ts">
// Multi-select of the admin UI kit (design: Figma "Select controls",
// "Multi-select", node 17:7471): chosen values as chips with ×, a search to
// add more. A value that is not among the options any more stays as a
// marked chip (`unknownLabel`), never dropped silently.
import { computed, ref, useId, useTemplateRef } from 'vue'
import { onClickOutside } from '@vueuse/core'

export interface AdminMultiSelectOption {
  value: string
  label: string
}

const model = defineModel<string[]>({ default: () => [] })

const props = withDefaults(defineProps<{
  options: AdminMultiSelectOption[]
  label: string
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  /** Most values; the search hides once reached. */
  max?: number
  /** How a value no longer among the options reads: `(value) => …`. */
  unknownLabel?: (value: string) => string
}>(), { placeholder: '', max: undefined, unknownLabel: (value: string) => value })

const id = useId()
const root = useTemplateRef<HTMLElement>('root')
const input = useTemplateRef<HTMLInputElement>('input')
const query = ref('')
const open = ref(false)
const active = ref(0)

const chips = computed(() => model.value.map((value) => {
  const option = props.options.find(item => item.value === value)
  return { value, label: option?.label ?? props.unknownLabel(value), known: Boolean(option) }
}))

const offered = computed(() => {
  const search = query.value.trim().toLocaleLowerCase()
  return props.options.filter(option => !model.value.includes(option.value)
    && (!search || option.label.toLocaleLowerCase().includes(search)))
})

const full = computed(() => props.max !== undefined && model.value.length >= props.max)
/** The list is showing: the field and the list read as one box, like AdminSelect. */
const listed = computed(() => open.value && !props.disabled && !full.value && offered.value.length > 0)

function add(value: string) {
  if (!full.value) {
    model.value = [...model.value, value]
  }

  query.value = ''
  active.value = 0
  input.value?.focus()
}

function remove(value: string) {
  model.value = model.value.filter(item => item !== value)
  input.value?.focus()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    open.value = true
    const count = offered.value.length
    active.value = count ? (active.value + (event.key === 'ArrowDown' ? 1 : -1) + count) % count : 0
  } else if (event.key === 'Enter') {
    const option = offered.value[active.value]

    if (open.value && option) {
      event.preventDefault()
      add(option.value)
    }
  } else if (event.key === 'Backspace' && query.value === '' && model.value.length > 0) {
    model.value = model.value.slice(0, -1)
  } else if (event.key === 'Escape' && open.value) {
    // Closes the list, not the dialog around it.
    event.preventDefault()
    event.stopPropagation()
    open.value = false
  }
}

onClickOutside(root, () => {
  open.value = false
})
</script>

<template>
  <div
    ref="root"
    class="admin-multi"
    :class="{ 'admin-multi--invalid': invalid, 'admin-multi--disabled': disabled, 'admin-multi--open': listed }"
    @click="!disabled && input?.focus()"
  >
    <span
      v-for="chip in chips"
      :key="chip.value"
      class="admin-multi__chip"
      :class="{ 'admin-multi__chip--unknown': !chip.known }"
    >
      {{ chip.label }}
      <button
        v-if="!disabled"
        type="button"
        class="admin-multi__remove"
        :aria-label="`× ${chip.label}`"
        @click.stop="remove(chip.value)"
      >
        <Icon
          name="lucide:x"
          aria-hidden="true"
        />
      </button>
    </span>
    <input
      v-if="!disabled && !full"
      ref="input"
      v-model="query"
      class="admin-multi__input"
      role="combobox"
      :aria-label="label"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="`${id}-list`"
      :aria-activedescendant="open && offered[active] ? `${id}-${active}` : undefined"
      :aria-invalid="invalid ? 'true' : undefined"
      :placeholder="placeholder"
      autocomplete="off"
      @focus="open = true"
      @input="open = true; active = 0"
      @keydown="onKeydown"
    >
    <ul
      v-if="listed"
      :id="`${id}-list`"
      class="admin-multi__list"
      role="listbox"
    >
      <li
        v-for="(option, index) in offered"
        :id="`${id}-${index}`"
        :key="option.value"
        role="option"
        class="admin-multi__option"
        :class="{ 'admin-multi__option--active': index === active }"
        :aria-selected="index === active ? 'true' : 'false'"
        @mousedown.prevent="add(option.value)"
        @mouseenter="active = index"
      >
        {{ option.label }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.admin-multi {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cms-space-1);
  min-height: var(--cms-control-md);
  padding: var(--cms-space-1) var(--cms-space-2);
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-sm);
  background: var(--cms-card);
  cursor: text;
}

.admin-multi:focus-within {
  border-color: var(--cms-ring);
  box-shadow: var(--cms-focus-ring-field);
}

/* Open: the field and the list are one box (as AdminSelect). The field's
   edge next to the list is the divider; the outline is the ring colour. */
.admin-multi--open,
.admin-multi--open:focus-within {
  border-color: var(--cms-ring);
  border-bottom-color: var(--cms-border);
  border-radius: var(--cms-radius-sm) var(--cms-radius-sm) 0 0;
  box-shadow: none;
}

.admin-multi--invalid {
  border-color: var(--cms-destructive);
}

.admin-multi--disabled {
  background: var(--cms-surface-secondary);
  cursor: default;
}

.admin-multi__chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0 2px 0 var(--cms-space-2);
  border-radius: var(--cms-radius-sm);
  background: var(--cms-surface-secondary);
  color: var(--cms-foreground);
  font-size: var(--cms-type-body-small-size);
  font-weight: 600;
  line-height: var(--cms-space-6);
}

.admin-multi__chip--unknown {
  background: var(--cms-destructive-subtle);
  color: var(--cms-destructive-text);
}

.admin-multi__remove {
  display: grid;
  place-items: center;
  width: var(--cms-space-5);
  height: var(--cms-space-5);
  padding: 0;
  border: 0;
  border-radius: var(--cms-radius-sm);
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.admin-multi__remove:hover {
  background: var(--cms-surface-hover);
}

.admin-multi__remove :deep(svg) {
  width: 12px;
  height: 12px;
}

.admin-multi__input {
  flex: 1 1 8rem;
  min-width: 6rem;
  height: var(--cms-control-xs);
  margin: 0;
  padding: 0 var(--cms-space-1);
  border: 0;
  outline: none;
  background: transparent;
  color: var(--cms-foreground);
  font: inherit;
  font-size: var(--cms-type-body-small-size);
}

.admin-multi__list {
  position: absolute;
  top: 100%;
  right: calc(-1 * var(--cms-border-width));
  left: calc(-1 * var(--cms-border-width));
  z-index: 5;
  max-height: 16rem;
  margin: 0;
  padding: 0.21875rem;
  overflow: auto;
  overscroll-behavior: contain;
  border: var(--cms-border-width) solid var(--cms-ring);
  border-top: 0;
  border-radius: 0 0 var(--cms-radius-sm) var(--cms-radius-sm);
  background: var(--cms-card);
  box-shadow: var(--cms-shadow-sm);
  list-style: none;
}

.admin-multi__option {
  padding: var(--cms-space-1) var(--cms-space-2);
  border-radius: var(--cms-radius-sm);
  color: var(--cms-foreground);
  font-size: var(--cms-type-body-small-size);
  line-height: 1.25rem;
  cursor: pointer;
}

.admin-multi__option--active {
  background: var(--cms-surface-hover);
}
</style>
