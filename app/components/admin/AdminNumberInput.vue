<script setup lang="ts">
// Number input of the admin UI kit (design: Figma "Number input", node
// 17:7660): − value +, the value typed or stepped within min / max. Empty
// is no number (null). Typing keeps its own text until it is a number.
import { computed, ref, useId, watch } from 'vue'

const model = defineModel<number | null>({ default: null })

const props = withDefaults(defineProps<{
  label: string
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  readonly?: boolean
  placeholder?: string
  invalid?: boolean
}>(), { min: undefined, max: undefined, step: 1, placeholder: undefined })

const id = useId()
const text = ref(model.value === null ? '' : String(model.value))

watch(model, (value) => {
  if (value !== parse(text.value)) {
    text.value = value === null ? '' : String(value)
  }
})

function parse(value: string): number | null {
  const trimmed = value.trim().replace(',', '.')
  return trimmed === '' || !Number.isFinite(Number(trimmed)) ? null : Number(trimmed)
}

function onInput(value: string) {
  text.value = value

  // "-" or "1e" is not a number yet: the value waits.
  if (value.trim() === '' || parse(value) !== null) {
    model.value = parse(value)
  }
}

const locked = computed(() => props.disabled || props.readonly)

function stepBy(by: 1 | -1) {
  const current = model.value ?? (by > 0 ? (props.min ?? 0) - props.step : (props.max ?? 0) + props.step)
  let next = Math.round((current + by * props.step) * 1e6) / 1e6

  if (props.min !== undefined) {
    next = Math.max(props.min, next)
  }

  if (props.max !== undefined) {
    next = Math.min(props.max, next)
  }

  model.value = next
  text.value = String(next)
}
</script>

<template>
  <div
    class="admin-number"
    :class="{ 'admin-number--invalid': invalid, 'admin-number--locked': locked }"
  >
    <button
      type="button"
      class="admin-number__step"
      tabindex="-1"
      :aria-label="`${label} −`"
      :disabled="locked || (min !== undefined && model !== null && model <= min)"
      @click="stepBy(-1)"
    >
      <Icon
        name="lucide:minus"
        aria-hidden="true"
      />
    </button>
    <input
      :id="id"
      class="admin-number__input"
      type="text"
      inputmode="decimal"
      :value="text"
      :aria-label="label"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :aria-invalid="invalid ? 'true' : undefined"
      autocomplete="off"
      @input="onInput(($event.target as HTMLInputElement).value)"
      @keydown.up.prevent="!locked && stepBy(1)"
      @keydown.down.prevent="!locked && stepBy(-1)"
    >
    <button
      type="button"
      class="admin-number__step"
      tabindex="-1"
      :aria-label="`${label} +`"
      :disabled="locked || (max !== undefined && model !== null && model >= max)"
      @click="stepBy(1)"
    >
      <Icon
        name="lucide:plus"
        aria-hidden="true"
      />
    </button>
  </div>
</template>

<style scoped>
.admin-number {
  display: flex;
  align-items: stretch;
  height: var(--cms-control-md);
  overflow: hidden;
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-sm);
  background: var(--cms-card);
}

.admin-number:focus-within {
  border-color: var(--cms-ring);
  box-shadow: var(--cms-focus-ring-field);
}

.admin-number--invalid {
  border-color: var(--cms-destructive);
}

.admin-number--locked {
  background: var(--cms-surface-secondary);
}

.admin-number__step {
  display: grid;
  flex: none;
  place-items: center;
  width: var(--cms-control-md);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--cms-foreground);
  cursor: pointer;
}

.admin-number__step:first-child {
  border-right: var(--cms-border-width) solid var(--cms-border);
}

.admin-number__step:last-child {
  border-left: var(--cms-border-width) solid var(--cms-border);
}

.admin-number__step:hover:not(:disabled) {
  background: var(--cms-surface-hover);
}

.admin-number__step:disabled {
  color: var(--cms-text-disabled);
  cursor: not-allowed;
}

.admin-number__step :deep(svg) {
  width: var(--cms-icon-size);
  height: var(--cms-icon-size);
}

.admin-number__input {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 0 var(--cms-space-2);
  border: 0;
  outline: none;
  background: transparent;
  color: var(--cms-foreground);
  font: inherit;
  font-size: var(--cms-type-body-size);
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.admin-number__input:read-only,
.admin-number__input:disabled {
  color: var(--cms-text-secondary);
}
</style>
