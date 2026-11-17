<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useAdminI18n } from '../../admin/useAdminI18n'
import { frameOffset, type ImageFrame } from '../../admin/media/crop'
import type { CmsFocalPoint } from '../../types/media'

// Focal point on a thumbnail: press to place it and drag to move it (mouse,
// pen or touch), arrow keys for fine steps (Shift for larger ones). Used by
// the editor's image panel and the media library's file dialog.
// With `frame`, the thumbnail dims what the page crops away, so the effect of
// the point is visible before looking at the page.
const props = defineProps<{
  src: string
  label: string
  disabled?: boolean
  /** Part of the image the page shows; null or absent: no crop preview. */
  frame?: ImageFrame | null
}>()

const focal = defineModel<CmsFocalPoint | null>({ required: true })

// One drag is one gesture: the editor makes it a single Undo step.
const emit = defineEmits<{ start: [], end: [] }>()

/** Arrow keys move the focal point this much; with Shift, more. */
const STEP = 2
const STEP_LARGE = 10

const { t } = useAdminI18n()
const uid = useId()
const point = computed(() => focal.value ?? { x: 50, y: 50 })
const dragging = ref(false)

const frameStyle = computed(() => {
  if (!props.frame) {
    return null
  }

  const { left, top } = frameOffset(props.frame, point.value)

  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${props.frame.width * 100}%`,
    height: `${props.frame.height * 100}%`,
  }
})

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

/** Moves the point under the pointer; outside the image it sticks to the edge. */
function moveTo(event: PointerEvent) {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const next = {
    x: clamp(((event.clientX - box.left) / box.width) * 100),
    y: clamp(((event.clientY - box.top) / box.height) * 100),
  }

  if (next.x !== point.value.x || next.y !== point.value.y || !focal.value) {
    focal.value = next
  }
}

function onPointerDown(event: PointerEvent) {
  if (props.disabled || event.button !== 0) {
    return
  }

  // Keep receiving moves when the pointer leaves the image mid-drag.
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  dragging.value = true
  emit('start')
  moveTo(event)
}

function onPointerMove(event: PointerEvent) {
  if (dragging.value) {
    moveTo(event)
  }
}

function onPointerEnd() {
  if (!dragging.value) {
    return
  }

  dragging.value = false
  emit('end')
}

function nudge(event: KeyboardEvent) {
  const step = event.shiftKey ? STEP_LARGE : STEP
  const delta: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  }
  const move = delta[event.key]

  if (props.disabled || !move) {
    return
  }

  event.preventDefault()
  focal.value = { x: clamp(point.value.x + move[0]), y: clamp(point.value.y + move[1]) }
}
</script>

<template>
  <div class="focal-picker">
    <span
      :id="`${uid}-label`"
      class="focal-picker__label"
    >{{ label }}</span>
    <button
      type="button"
      class="focal-picker__target"
      :class="{ 'focal-picker__target--dragging': dragging }"
      :aria-labelledby="`${uid}-label`"
      :aria-describedby="`${uid}-hint`"
      :disabled="disabled"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerEnd"
      @pointercancel="onPointerEnd"
      @lostpointercapture="onPointerEnd"
      @keydown="nudge"
    >
      <span class="focal-picker__image">
        <img
          :src="src"
          alt=""
          draggable="false"
        >
        <span
          v-if="frameStyle"
          class="focal-picker__frame"
          aria-hidden="true"
          :style="frameStyle"
        />
      </span>
      <span
        class="focal-picker__dot"
        aria-hidden="true"
        :style="{ left: `${point.x}%`, top: `${point.y}%` }"
      />
    </button>
    <span
      :id="`${uid}-hint`"
      class="focal-picker__hint"
      :aria-live="dragging ? 'off' : 'polite'"
    >{{ t('cms.media.focalHint', { x: point.x, y: point.y }) }}<template v-if="frame">
      {{ t('cms.media.frameHint') }}</template></span>
  </div>
</template>

<style scoped>
.focal-picker {
  display: flex;
  flex-direction: column;
  gap: var(--cms-space-1);
}

.focal-picker__label {
  font-size: var(--cms-type-label-size);
  font-weight: var(--cms-type-label-weight);
  line-height: var(--cms-type-label-line);
}

/* The button hugs the image, so a click position maps onto the image itself. */
.focal-picker__target {
  position: relative;
  display: block;
  width: fit-content;
  max-width: 100%;
  margin-inline: auto;
  padding: 0;
  /* Not hidden: the point stays whole at the edge of the image. */
  overflow: visible;
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-md);
  background: var(--cms-surface-secondary);
  cursor: grab;
  /* The page must not scroll or select while a finger drags the point. */
  touch-action: none;
  user-select: none;
}

.focal-picker__target--dragging {
  cursor: grabbing;
}

.focal-picker__target:disabled {
  cursor: default;
}

.focal-picker__target:focus-visible {
  outline: none;
  box-shadow: var(--cms-focus-ring);
}

/* Clips the dimming; the point itself may sit on the edge, outside this. */
.focal-picker__image {
  position: relative;
  display: block;
  overflow: hidden;
  border-radius: inherit;
}

.focal-picker__frame {
  position: absolute;
  border: 2px solid var(--cms-neutral-0);
  border-radius: var(--cms-radius-sm);
  box-shadow: 0 0 0 9999px rgb(0 0 0 / 50%);
  pointer-events: none;
}

.focal-picker__target img {
  display: block;
  border-radius: inherit;
  max-width: 100%;
  max-height: 14rem;
}

.focal-picker__dot {
  position: absolute;
  transition: transform 120ms ease;
  width: 1rem;
  height: 1rem;
  border: 2px solid var(--cms-neutral-0);
  border-radius: var(--cms-radius-full);
  background: var(--cms-primary);
  box-shadow: var(--cms-shadow-md);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.focal-picker__target--dragging .focal-picker__dot {
  transform: translate(-50%, -50%) scale(1.25);
}

@media (prefers-reduced-motion: reduce) {
  .focal-picker__dot {
    transition: none;
  }
}

.focal-picker__hint {
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-helper-size);
  line-height: var(--cms-type-helper-line);
}
</style>
