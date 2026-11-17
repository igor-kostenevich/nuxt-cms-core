<script setup lang="ts" generic="T extends string">
import { autoUpdate, computePosition, flip, size as fitSize } from '@floating-ui/dom'
import { computed, nextTick, onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue'

// Single select of the admin UI kit (design: Figma "Select controls", node
// 17:7471; opened state 17:7533): a combobox button with a listbox, instead
// of the native <select> whose menu the browser draws. Open, the field and
// the list read as one box with a divider. Keyboard follows the WAI-ARIA
// select-only combobox: focus stays on the button, the active option is
// announced through aria-activedescendant.
export interface AdminSelectOption<V extends string = string> {
  value: V
  label: string
}

const props = withDefaults(defineProps<{
  options: AdminSelectOption<T>[]
  /** Accessible name; shown above the field unless `labelPlacement` says otherwise. */
  label: string
  labelPlacement?: 'top' | 'inline' | 'hidden'
  placeholder?: string
  disabled?: boolean
  error?: string
  /** `sm` is the compact height of toolbars (31.5px), `md` of forms. */
  size?: 'sm' | 'md'
}>(), {
  labelPlacement: 'top',
  placeholder: '',
  disabled: false,
  error: undefined,
  size: 'md',
})

const model = defineModel<T | null>({ required: true })

/** Type-ahead keeps collecting letters this long after the last key. */
const TYPEAHEAD_RESET = 500
/** Menu height before it scrolls. */
const MENU_MAX_HEIGHT = 256
/** Below this the menu is too short to use: keep the full height and let the page scroll. */
const MENU_MIN_HEIGHT = 120
/** Distance the menu keeps from the viewport edge. */
const VIEWPORT_PADDING = 8

const id = useId()
const labelId = `${id}-label`
const listId = `${id}-list`
const errorId = `${id}-error`
const root = useTemplateRef<HTMLElement>('root')
const trigger = useTemplateRef<HTMLElement>('trigger')
const list = useTemplateRef<HTMLElement>('list')

const open = ref(false)
/** Where the menu ended up; null until the first position is computed. */
const side = ref<'bottom' | 'top' | null>(null)
const active = ref(-1)
let stopPositioning: (() => void) | null = null
let typed = ''
let typedTimer: ReturnType<typeof setTimeout> | undefined

const selectedIndex = computed(() => props.options.findIndex(option => option.value === model.value))
const selected = computed(() => props.options[selectedIndex.value] ?? null)
const optionId = (index: number) => `${id}-option-${index}`

function show() {
  if (props.disabled || open.value || props.options.length === 0) {
    return
  }

  active.value = Math.max(0, selectedIndex.value)
  side.value = null
  open.value = true
}

function hide() {
  open.value = false
}

/**
 * Below the field by default; above it only when there is no room below and
 * there is room above. When neither fits, it stays below (initialPlacement).
 * `fixed`, so a scrolling container such as a dialog body does not clip it.
 */
function startPositioning() {
  const reference = trigger.value
  const floating = list.value

  if (!reference || !floating) {
    return
  }

  stopPositioning = autoUpdate(reference, floating, async () => {
    const { x, y, placement } = await computePosition(reference, floating, {
      placement: 'bottom-start',
      strategy: 'fixed',
      middleware: [
        flip({
          fallbackPlacements: ['top-start'],
          fallbackStrategy: 'initialPlacement',
          padding: VIEWPORT_PADDING,
        }),
        fitSize({
          padding: VIEWPORT_PADDING,
          apply({ availableHeight, rects }) {
            Object.assign(floating.style, {
              width: `${rects.reference.width}px`,
              maxHeight: `${Math.min(MENU_MAX_HEIGHT, Math.max(availableHeight, MENU_MIN_HEIGHT))}px`,
            })
          },
        }),
      ],
    })

    Object.assign(floating.style, { left: `${x}px`, top: `${y}px` })
    side.value = placement.startsWith('top') ? 'top' : 'bottom'
  })
}

function stopPositioningMenu() {
  stopPositioning?.()
  stopPositioning = null
}

function choose(index: number) {
  const option = props.options[index]

  if (option) {
    model.value = option.value
  }

  hide()
}

function move(to: number) {
  const last = props.options.length - 1
  active.value = Math.max(0, Math.min(last, to))
}

function typeahead(char: string) {
  clearTimeout(typedTimer)
  typed += char.toLowerCase()
  typedTimer = setTimeout(() => {
    typed = ''
  }, TYPEAHEAD_RESET)

  const start = open.value ? active.value : selectedIndex.value
  const order = props.options.map((_, index) => (start + 1 + index) % props.options.length)
  // A repeated letter cycles through the options that start with it.
  const query = typed.length > 1 && new Set(typed).size === 1 ? typed[0]! : typed
  const match = order.find(index => props.options[index]!.label.toLowerCase().startsWith(query))

  if (match === undefined) {
    return
  }

  if (open.value) {
    active.value = match
  } else {
    model.value = props.options[match]!.value
  }
}

function onKeydown(event: KeyboardEvent) {
  if (props.disabled) {
    return
  }

  switch (event.key) {
    case 'ArrowDown':
    case 'ArrowUp':
      event.preventDefault()

      if (!open.value) {
        show()
      } else if (!event.altKey) {
        move(active.value + (event.key === 'ArrowDown' ? 1 : -1))
      } else {
        choose(active.value)
      }

      return
    case 'Home':
    case 'End':
      if (open.value) {
        event.preventDefault()
        move(event.key === 'Home' ? 0 : props.options.length - 1)
      }

      return
    case 'Enter':
    case ' ':
      event.preventDefault()

      if (open.value) {
        choose(active.value)
      } else {
        show()
      }

      return
    case 'Escape':
      // Close the menu, not the dialog around it.
      if (open.value) {
        event.preventDefault()
        event.stopPropagation()
        hide()
      }

      return
    case 'Tab':
      hide()
      return
    default:
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        typeahead(event.key)
      }
  }
}

function onOutside(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) {
    hide()
  }
}

watch(open, async (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onOutside, true)
    await nextTick()
    startPositioning()
    list.value?.querySelector<HTMLElement>(`#${CSS.escape(optionId(active.value))}`)?.scrollIntoView({ block: 'nearest' })
  } else {
    document.removeEventListener('pointerdown', onOutside, true)
    stopPositioningMenu()
  }
})

watch(active, async (index) => {
  if (open.value) {
    await nextTick()
    list.value?.querySelector<HTMLElement>(`#${CSS.escape(optionId(index))}`)?.scrollIntoView({ block: 'nearest' })
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutside, true)
  stopPositioningMenu()
  clearTimeout(typedTimer)
})
</script>

<template>
  <div
    ref="root"
    class="admin-select"
    :class="[
      `admin-select--${size}`,
      `admin-select--label-${labelPlacement}`,
      {
        'admin-select--open': open,
        'admin-select--up': open && side === 'top',
        'admin-select--error': error,
        'admin-select--disabled': disabled,
      },
    ]"
  >
    <span
      :id="labelId"
      class="admin-select__label"
    >{{ label }}</span>
    <div class="admin-select__field">
      <button
        ref="trigger"
        type="button"
        role="combobox"
        class="admin-select__trigger"
        aria-haspopup="listbox"
        :aria-expanded="open"
        :aria-controls="listId"
        :aria-labelledby="labelId"
        :aria-activedescendant="open && active >= 0 ? optionId(active) : undefined"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="error ? errorId : undefined"
        :disabled="disabled"
        @click="open ? hide() : show()"
        @keydown="onKeydown"
      >
        <span
          class="admin-select__value"
          :class="{ 'admin-select__value--placeholder': !selected }"
        >{{ selected?.label ?? placeholder }}</span>
        <Icon
          name="lucide:chevron-down"
          class="admin-select__chevron"
          aria-hidden="true"
        />
      </button>
      <ul
        v-show="open"
        :id="listId"
        ref="list"
        role="listbox"
        class="admin-select__menu"
        :class="{ 'admin-select__menu--up': side === 'top', 'admin-select__menu--placed': side !== null }"
        :aria-labelledby="labelId"
        tabindex="-1"
      >
        <li
          v-for="(option, index) in options"
          :id="optionId(index)"
          :key="option.value"
          role="option"
          class="admin-select__option"
          :class="{
            'admin-select__option--active': index === active,
            'admin-select__option--selected': index === selectedIndex,
          }"
          :aria-selected="index === selectedIndex"
          @pointermove="active = index"
          @mousedown.prevent
          @click="choose(index)"
        >
          {{ option.label }}
        </li>
      </ul>
    </div>
    <p
      v-if="error"
      :id="errorId"
      class="admin-select__error"
    >
      {{ error }}
    </p>
  </div>
</template>

<style scoped>
.admin-select {
  display: flex;
  flex-direction: column;
  gap: var(--cms-space-1);
  min-width: 0;
}

.admin-select--label-inline {
  flex-direction: row;
  align-items: center;
  gap: var(--cms-space-2);
}

.admin-select__label {
  color: var(--cms-foreground);
  font-size: var(--cms-type-label-size);
  font-weight: var(--cms-type-label-weight);
  line-height: var(--cms-type-label-line);
}

.admin-select--label-inline .admin-select__label {
  color: var(--cms-text-secondary);
  font-weight: var(--cms-type-body-weight);
  white-space: nowrap;
}

.admin-select--label-hidden .admin-select__label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.admin-select__field {
  position: relative;
  flex: 1;
  min-width: 0;
}

.admin-select__trigger {
  display: flex;
  align-items: center;
  gap: var(--cms-space-2);
  width: 100%;
  height: var(--cms-control-md);
  margin: 0;
  padding: 0 var(--cms-space-3);
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-sm);
  background: var(--cms-card);
  color: var(--cms-foreground);
  font: inherit;
  font-size: var(--cms-type-body-size);
  line-height: var(--cms-type-body-line);
  text-align: start;
  cursor: pointer;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}

.admin-select--sm .admin-select__trigger {
  height: var(--cms-control-sm);
  font-size: var(--cms-type-body-small-size);
}

.admin-select__trigger:hover {
  border-color: var(--cms-border-strong);
}

.admin-select__trigger:focus-visible {
  outline: none;
  border-color: var(--cms-ring);
  box-shadow: var(--cms-focus-ring-field);
}

/* Open: the field and the menu are one box. The field's edge next to the
   menu becomes the divider; the shared outline is the ring colour. */
.admin-select--open .admin-select__trigger {
  border-color: var(--cms-ring);
  border-bottom-color: var(--cms-border);
  border-radius: var(--cms-radius-sm) var(--cms-radius-sm) 0 0;
  box-shadow: none;
}

.admin-select--open.admin-select--up .admin-select__trigger {
  border-top-color: var(--cms-border);
  border-bottom-color: var(--cms-ring);
  border-radius: 0 0 var(--cms-radius-sm) var(--cms-radius-sm);
}

.admin-select--error .admin-select__trigger {
  border-color: var(--cms-destructive);
}

.admin-select--error .admin-select__trigger:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--cms-destructive) 20%, transparent);
}

.admin-select__trigger:disabled {
  border-color: var(--cms-border-disabled);
  background: var(--cms-surface-disabled);
  color: var(--cms-text-disabled);
  cursor: not-allowed;
}

.admin-select__value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-select__value--placeholder {
  color: var(--cms-text-secondary);
}

.admin-select__chevron {
  flex: none;
  width: 0.875rem;
  height: 0.875rem;
  color: var(--cms-text-secondary);
  transition: transform 120ms ease;
}

.admin-select--open .admin-select__chevron {
  transform: rotate(180deg);
}

.admin-select__menu {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1000;
  box-sizing: border-box;
  max-height: 16rem;
  margin: 0;
  padding: 0.21875rem;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: var(--cms-border-width) solid var(--cms-ring);
  border-top: 0;
  border-radius: 0 0 var(--cms-radius-sm) var(--cms-radius-sm);
  background: var(--cms-card);
  box-shadow: var(--cms-shadow-sm);
  list-style: none;
  /* Hidden until floating-ui has placed it, so it never flashes at 0,0. */
  visibility: hidden;
}

.admin-select__menu--placed {
  visibility: visible;
}

.admin-select__menu--up {
  border-top: var(--cms-border-width) solid var(--cms-ring);
  border-bottom: 0;
  border-radius: var(--cms-radius-sm) var(--cms-radius-sm) 0 0;
}

.admin-select__option {
  padding: var(--cms-space-1) var(--cms-space-2);
  border-radius: var(--cms-radius-sm);
  color: var(--cms-foreground);
  font-size: var(--cms-type-body-small-size);
  line-height: 1.25rem;
  white-space: nowrap;
  cursor: pointer;
}

.admin-select__option--active {
  background: var(--cms-surface-hover);
}

.admin-select__option--selected {
  background: var(--cms-primary-subtle);
  color: var(--cms-primary);
}

.admin-select__error {
  margin: 0;
  color: var(--cms-destructive-text);
  font-size: var(--cms-type-helper-size);
  font-weight: var(--cms-type-helper-weight);
  line-height: var(--cms-type-helper-line);
}

@media (prefers-reduced-motion: reduce) {
  .admin-select__trigger,
  .admin-select__chevron {
    transition: none;
  }
}
</style>
