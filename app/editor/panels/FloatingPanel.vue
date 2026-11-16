<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { autoUpdate, computePosition, flip, offset, shift, type Placement } from '@floating-ui/dom'
import { useEditor } from '../inject'

/**
 * A panel anchored to a field of the page. Flips and shifts to stay on
 * screen and follows the field while the page scrolls, resizes or the field
 * re-renders. Selected from the keyboard, it takes focus; Escape gives focus
 * back to the field (WCAG 2.1.1, 2.4.3).
 */
const props = withDefaults(defineProps<{
  anchor: HTMLElement
  /** Accessible name of the panel, e.g. «Button» or the field label. */
  label: string
  placement?: Placement
  gap?: number
  /** A toolbar (rich text, mini bar) rather than a dialog-like panel. */
  toolbar?: boolean
}>(), {
  placement: 'bottom-start',
  gap: 10,
  toolbar: false,
})

const { view } = useEditor()
const panel = useTemplateRef<HTMLElement>('panel')
const style = ref<Record<string, string>>({ visibility: 'hidden' })
let stop: (() => void) | null = null

function track(anchor: HTMLElement) {
  stop?.()
  const floating = panel.value

  if (!floating) {
    return
  }

  stop = autoUpdate(anchor, floating, async () => {
    const { x, y } = await computePosition(anchor, floating, {
      placement: props.placement,
      strategy: 'absolute',
      middleware: [offset(props.gap), flip({ padding: 12 }), shift({ padding: 12 })],
    })

    style.value = { transform: `translate(${Math.round(x)}px, ${Math.round(y)}px)` }
  }, { animationFrame: true })
}

onMounted(async () => {
  track(props.anchor)

  if (view.selectionSource.value === 'keyboard') {
    await nextTick()
    panel.value?.querySelector<HTMLElement>('input, textarea, button:not([disabled]), [tabindex="0"]')?.focus()
  }
})

// The field's element is replaced (Hide, a link losing its href): follow the new one.
watch(() => props.anchor, anchor => track(anchor))

onBeforeUnmount(() => {
  stop?.()
})

function onEscape(event: KeyboardEvent) {
  event.stopPropagation()
  const anchor = props.anchor
  view.select(null)
  anchor.focus({ preventScroll: true })
}
</script>

<template>
  <div
    ref="panel"
    class="floating"
    :role="toolbar ? 'toolbar' : 'group'"
    :aria-label="label"
    :style="style"
    @keydown.esc="onEscape"
  >
    <slot />
  </div>
</template>

<style scoped>
.floating {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 3;
  pointer-events: auto;
}
</style>
