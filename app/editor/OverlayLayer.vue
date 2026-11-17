<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { useEventListener, useRafFn } from '@vueuse/core'
import { useAdminI18n } from '../admin/useAdminI18n'
import { sameBox, toBox, type Box } from './geometry'
import { useEditor } from './inject'
import { KIND_TRAITS, type FieldRegistration } from './kinds'
import { useEditorSession } from './session'
import FieldPanel from './panels/FieldPanel.vue'
import ItemControls from './panels/ItemControls.vue'

/**
 * Everything the editor draws over the page lives here, in one fixed layer
 * outside the Client Project's DOM (MASTER_PLAN C-65): outlines, type chips,
 * the dimming mask, item controls and panels. Positions follow the fields'
 * bounding boxes every frame, so transforms, overflow and stacking contexts in
 * the client's CSS do not matter. The layer itself ignores the pointer; only
 * its controls take clicks.
 */
const props = defineProps<{
  /** Dim what is not editable; outlines show either way. */
  highlight: boolean
}>()

/** Re-run the occlusion hit-test this often even when nothing moved (a menu opening). */
const RECHECK_EVERY_FRAMES = 20
/** Outlines and dimming holes sit this far outside the field. */
const PAD = 4

const { t } = useAdminI18n()
const { engine, view } = useEditor()
const session = useEditorSession()

const boxes = shallowRef(new Map<string, Box>())
const frame = ref<Box>({ x: 0, y: 0, w: 0, h: 0 })
const focused = ref<string | null>(null)
const hoveredItem = ref<string | null>(null)
/**
 * An item whose controls hold keyboard focus keeps them, wherever the
 * pointer goes, so they do not vanish from under the focus (WCAG 2.4.3).
 * After a click focus may sit in the controls too (the handle gets it back
 * after a move); then the controls follow the pointer as usual.
 */
const pinnedItem = ref<string | null>(null)
/** Last kind of input: decides whether focus in the controls pins them. */
let lastInput: 'pointer' | 'keyboard' = 'pointer'

let scroller: HTMLElement | null = null
let rawBoxes = new Map<string, Box>()
let frameCount = 0

useRafFn(() => {
  scroller ??= document.querySelector<HTMLElement>('[data-cms-scroller]')

  if (scroller) {
    const next = toBox(scroller.getBoundingClientRect())

    if (!sameBox(next, frame.value)) {
      frame.value = next
    }
  }

  const raw = new Map<string, Box>()
  let moved = false

  for (const field of engine.fields.values()) {
    if (!field.el.isConnected) {
      continue
    }

    const box = toBox(field.el.getBoundingClientRect())

    if (box.w === 0 && box.h === 0) {
      continue
    }

    raw.set(field.id, box)
    moved ||= !sameBox(box, rawBoxes.get(field.id))
  }

  // Fields that appeared or went away (hidden ones are never in `raw`).
  moved ||= raw.size !== rawBoxes.size
  rawBoxes = raw
  frameCount++

  // Hit-testing is the costly part: redo it when something moved, and now and
  // then for content that covers fields without moving them.
  if (!moved && frameCount % RECHECK_EVERY_FRAMES !== 0) {
    return
  }

  const next = new Map<string, Box>()
  let changed = moved || boxes.value.size !== raw.size

  for (const [id, box] of raw) {
    const field = engine.fields.get(id)
    const visible = field ? visibleBox(field, box) : null

    if (visible) {
      next.set(id, visible)
      changed ||= !sameBox(visible, boxes.value.get(id))
    } else {
      changed ||= boxes.value.has(id)
    }
  }

  if (changed) {
    boxes.value = next
  }
})

/** The element covering `field` at a point, or null when the field is on top there. */
function coveringAt(field: FieldRegistration, x: number, y: number): Element | null {
  const hit = document.elementFromPoint(x, y)

  if (!hit || field.el.contains(hit) || hit.contains(field.el) || hit.closest('.cms-editor-ui')) {
    return null
  }

  return hit
}

/**
 * The part of a field the editor can actually see. Page content in front of it
 * (a sticky header the page scrolled under) hides it, or cuts its top, so
 * outlines and the dimming holes do not draw over that content.
 */
function visibleBox(field: FieldRegistration, box: Box): Box | null {
  const f = frame.value
  const x = Math.min(Math.max(box.x + box.w / 2, f.x + 1), f.x + f.w - 1)
  const top = Math.max(box.y, f.y) + 2
  const bottom = Math.min(box.y + box.h, f.y + f.h) - 2

  if (bottom <= top || coveringAt(field, x, (top + bottom) / 2)) {
    return null
  }

  let cover = coveringAt(field, x, top)

  if (!cover) {
    return box
  }

  // Cut at the bottom of the fixed / sticky container, not of the link that was hit.
  for (let el: Element | null = cover; el; el = el.parentElement) {
    const position = getComputedStyle(el).position

    if (position === 'sticky' || position === 'fixed') {
      cover = el
      break
    }
  }

  const cut = cover.getBoundingClientRect().bottom
  return cut > box.y && cut < box.y + box.h ? { ...box, y: cut, h: box.y + box.h - cut } : box
}

function local(box: Box) {
  return { x: box.x - frame.value.x, y: box.y - frame.value.y, w: box.w, h: box.h }
}

const fieldsWithBoxes = computed(() => {
  const list: { field: FieldRegistration, box: Box }[] = []

  for (const field of engine.fields.values()) {
    const box = boxes.value.get(field.id)

    if (box) {
      list.push({ field, box: local(box) })
    }
  }

  return list
})

const outlined = computed(() => fieldsWithBoxes.value.filter(({ field }) => KIND_TRAITS[field.kind].outlined))

function fieldFromTarget(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>('[data-cms-field]') : null
}

function itemFromTarget(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>('[data-cms-kind="item"]') : null
}

function insideOverlay(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[data-cms-overlay]'))
}

function fieldOf(el: HTMLElement | null) {
  return el ? engine.fields.get(el.dataset.cmsField!) : undefined
}

// ── Hover and focus ───────────────────────────────────────────────────

useEventListener(document, 'pointermove', (event: PointerEvent) => {
  if (insideOverlay(event.target)) {
    return
  }

  view.hover.value = fieldFromTarget(event.target)?.dataset.cmsField ?? null
  hoveredItem.value = itemFromTarget(event.target)?.dataset.cmsField ?? null
}, { passive: true })

useEventListener(document.documentElement, 'pointerleave', () => {
  view.hover.value = null
  hoveredItem.value = null
})

useEventListener(document, 'pointerdown', () => {
  lastInput = 'pointer'
}, { capture: true, passive: true })

useEventListener(document, 'keydown', () => {
  lastInput = 'keyboard'
}, { capture: true, passive: true })

useEventListener(document, 'focusin', (event: FocusEvent) => {
  const target = event.target as Element | null

  if (target?.closest?.('[data-cms-item-controls]')) {
    pinnedItem.value = lastInput === 'keyboard' ? activeItem.value?.field.id ?? pinnedItem.value : null
    return
  }

  pinnedItem.value = null

  if (insideOverlay(target)) {
    return
  }

  const fieldEl = fieldFromTarget(target)
  focused.value = fieldEl?.dataset.cmsField ?? null

  // Tab may land on a field under the page's sticky header: bring it into view.
  const field = fieldOf(fieldEl)

  if (field && field.el === target) {
    const box = toBox(field.el.getBoundingClientRect())
    const shown = visibleBox(field, box)

    if (!shown || shown.y !== box.y) {
      field.el.scrollIntoView({ block: 'center' })
    }
  }
})

// ── Clicks: select instead of navigate ────────────────────────────────

useEventListener(document, 'click', (event: MouseEvent) => {
  if (!scroller?.contains(event.target as Node) || insideOverlay(event.target)) {
    return
  }

  const target = event.target as Element
  const field = fieldOf(fieldFromTarget(target))
  const anchor = target.closest<HTMLAnchorElement>('a[href]')
  const followNow = event.metaKey || event.ctrlKey
  // Enter / Space on a focused element fire a click with no pointer detail.
  const source = event.detail === 0 ? 'keyboard' : 'pointer'

  if (field && KIND_TRAITS[field.kind].linkLike) {
    // Selecting a button must not run the page's own handler (open a modal…).
    event.preventDefault()
    event.stopPropagation()
    const href = field.el.getAttribute('href')

    if (followNow && href) {
      void session.goTo(href, field.el.getAttribute('target') === '_blank')
      return
    }

    view.select(field.id, source)
    return
  }

  if (anchor && field && !followNow) {
    // A field inside a plain link (an image in a card link) is edited, not followed.
    event.preventDefault()

    if (!KIND_TRAITS[field.kind].inline) {
      view.select(field.id, source)
    }

    return
  }

  if (anchor) {
    event.preventDefault()
    const newTab = anchor.target === '_blank' || event.shiftKey || followNow
    void session.goTo(anchor.getAttribute('href')!, newTab)
    return
  }

  if (field && !KIND_TRAITS[field.kind].inline) {
    view.select(field.id, source)
    return
  }

  if (!field) {
    view.select(null)
  }
}, { capture: true })

// ── Keyboard ──────────────────────────────────────────────────────────

// Bubble phase: panels, the dialog and the history drawer handle their own
// Escape first and stop it; only what is left moves the selection.
useEventListener(document, 'keydown', (event: KeyboardEvent) => {
  if (event.defaultPrevented) {
    return
  }

  const target = event.target as Element | null

  if (event.key === 'Escape') {
    if (!target?.closest?.('dialog, [data-cms-overlay], .cms-editor-ui')) {
      escape()
    }

    return
  }

  if (event.key !== 'Enter' && event.key !== ' ') {
    return
  }

  // Elements with role=button (images, items) do not click on Enter by themselves.
  const field = fieldOf(fieldFromTarget(target))

  if (field && field.el === target && !KIND_TRAITS[field.kind].inline && !KIND_TRAITS[field.kind].linkLike) {
    event.preventDefault()
    view.select(field.id, 'keyboard')
  }
})

/** Esc moves the selection one level up: field → item → collection → nothing. */
function escape() {
  const field = view.selectedField.value

  if (!field) {
    return
  }

  const parent = field.el.parentElement?.closest<HTMLElement>('[data-cms-kind="item"], [data-cms-kind="collection"]')

  view.select(parent?.dataset.cmsField ?? null, 'keyboard')
  ;(parent ?? field.el).focus({ preventScroll: true })
}

// ── What to draw ──────────────────────────────────────────────────────

const chipTarget = computed(() => {
  const id = view.hover.value ?? focused.value

  if (!id || id === view.selection.value) {
    return null
  }

  return fieldsWithBoxes.value.find(entry => entry.field.id === id) ?? null
})

const selectedBox = computed(() => {
  const id = view.selection.value
  return id ? fieldsWithBoxes.value.find(entry => entry.field.id === id)?.box ?? null : null
})

const focusedItem = computed(() => {
  const field = focused.value ? engine.fields.get(focused.value) : undefined
  return field?.el.closest<HTMLElement>('[data-cms-kind="item"]')?.dataset.cmsField ?? null
})

/**
 * Item whose controls show: pinned by keyboard focus, else under the pointer,
 * else the one holding the selection or focus. The pointer wins over the
 * selection: moving to another card brings its controls along.
 */
const activeItem = computed(() => {
  const candidates = [pinnedItem.value, hoveredItem.value, view.selection.value, focusedItem.value]

  for (const id of candidates) {
    const field = id ? engine.fields.get(id) : undefined

    if (!field) {
      continue
    }

    const itemId = field.kind === 'item'
      ? field.id
      : field.kind === 'collection' ? null : field.el.closest<HTMLElement>('[data-cms-kind="item"]')?.dataset.cmsField

    const entry = itemId ? fieldsWithBoxes.value.find(item => item.field.id === itemId) : undefined

    if (entry) {
      return entry
    }
  }

  return null
})

function chipLabel(field: FieldRegistration) {
  return field.label || t(`cms.editor.kinds.${field.kind}`)
}

function chipStyle(box: Box) {
  const above = box.y >= 30
  return {
    transform: `translate(${box.x + box.w}px, ${above ? box.y - 28 : box.y + 4}px) translateX(-100%)`,
  }
}

function boxStyle(box: Box, pad = PAD) {
  return {
    transform: `translate(${box.x - pad}px, ${box.y - pad}px)`,
    width: `${box.w + pad * 2}px`,
    height: `${box.h + pad * 2}px`,
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      class="cms-admin cms-editor-ui overlay"
      data-cms-overlay
      :style="{
        transform: `translate(${frame.x}px, ${frame.y}px)`,
        width: `${frame.w}px`,
        height: `${frame.h}px`,
      }"
    >
      <div
        class="overlay__marks"
        aria-hidden="true"
      >
        <svg
          v-if="props.highlight"
          class="overlay__dim"
          :width="frame.w"
          :height="frame.h"
        >
          <defs>
            <mask id="cms-overlay-holes">
              <rect
                :width="frame.w"
                :height="frame.h"
                fill="white"
              />
              <rect
                v-for="{ field, box } in outlined"
                :key="field.id"
                :x="box.x - PAD"
                :y="box.y - PAD"
                :width="box.w + PAD * 2"
                :height="box.h + PAD * 2"
                rx="6"
                fill="black"
              />
            </mask>
          </defs>
          <rect
            :width="frame.w"
            :height="frame.h"
            mask="url(#cms-overlay-holes)"
            class="overlay__dim-fill"
          />
        </svg>

        <div
          v-for="{ field, box } in outlined"
          :key="field.id"
          class="overlay__outline"
          :class="{ 'overlay__outline--changed': engine.changed(field.key) }"
          :style="boxStyle(box)"
        />

        <div
          v-if="chipTarget"
          class="overlay__hover"
          :style="boxStyle(chipTarget.box)"
        />
        <div
          v-if="chipTarget"
          class="overlay__chip"
          :style="chipStyle(chipTarget.box)"
        >
          <Icon :name="KIND_TRAITS[chipTarget.field.kind].icon" />
          {{ chipLabel(chipTarget.field) }}
        </div>

        <div
          v-if="selectedBox"
          class="overlay__selected"
          :style="boxStyle(selectedBox)"
        />
      </div>

      <ItemControls
        v-if="activeItem?.field.kind === 'item' && view.editable.value"
        :key="activeItem.field.id"
        :item="activeItem.field"
        :box="activeItem.box"
        :frame="frame"
      />

      <FieldPanel
        v-if="view.selectedField.value && view.editable.value"
        :key="view.selectedField.value.id"
        :field="view.selectedField.value"
      />
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  z-index: var(--cms-edit-z-overlay);
  overflow: hidden;
  pointer-events: none;
}

.overlay__marks {
  position: absolute;
  inset: 0;
}

.overlay__dim {
  position: absolute;
  inset: 0;
}

.overlay__dim-fill {
  fill: var(--cms-edit-dim);
}

.overlay__outline,
.overlay__hover,
.overlay__selected {
  position: absolute;
  top: 0;
  left: 0;
  border-radius: var(--cms-radius-md);
}

.overlay__outline {
  outline: 1px dashed var(--cms-edit-outline);
  outline-offset: -1px;
}

.overlay__outline--changed {
  outline-color: var(--cms-warning-solid);
}

.overlay__hover {
  outline: 2px solid var(--cms-primary);
  outline-offset: -1px;
}

.overlay__selected {
  outline: 2px solid var(--cms-primary);
  outline-offset: -1px;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--cms-primary) 25%, transparent);
}

.overlay__chip {
  position: absolute;
  top: 0;
  left: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--cms-space-1);
  height: 24px;
  padding: 0 var(--cms-space-2);
  border-radius: var(--cms-radius-full);
  background: var(--cms-neutral-900);
  color: var(--cms-neutral-0);
  font-size: var(--cms-type-label-small-size);
  font-weight: var(--cms-type-label-small-weight);
  white-space: nowrap;
  box-shadow: var(--cms-shadow-md);
}

@media (prefers-reduced-motion: no-preference) {
  .overlay__chip,
  .overlay__hover {
    animation: overlay-in 120ms ease-out;
  }
}

@keyframes overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
