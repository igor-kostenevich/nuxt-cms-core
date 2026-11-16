<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, useTemplateRef } from 'vue'
import { useAdminI18n } from '../../admin/useAdminI18n'
import { dropIndex, toBox, type Box } from '../geometry'
import { useEditor } from '../inject'
import type { FieldRegistration } from '../kinds'
import { useEditorUi } from '../ui'

// Controls of one collection item: drag handle, move up / down (the
// single-pointer and keyboard alternative to dragging, WCAG 2.5.7), duplicate,
// delete, and «add after». Delete is immediate with Undo in a toast.
const props = defineProps<{
  item: Extract<FieldRegistration, { kind: 'item' }>
  box: Box
  frame: Box
}>()

const { t } = useAdminI18n()
const { engine, view } = useEditor()
const ui = useEditorUi()
const uid = useId()

const api = computed(() => props.item.api)
const index = computed(() => api.value.index())
const count = computed(() => api.value.count())
const announcement = ref('')
const handle = useTemplateRef<{ $el: HTMLElement }>('handle')

function focusHandle() {
  handle.value?.$el.focus()
}

type ItemField = Extract<FieldRegistration, { kind: 'item' }>

function siblings(): ItemField[] {
  return [...engine.fields.values()]
    .filter((field): field is ItemField => field.kind === 'item'
      && field.api.collectionKey === api.value.collectionKey)
    .sort((a, b) => a.api.index() - b.api.index())
}

async function move(to: number) {
  const target = Math.max(0, Math.min(count.value - 1, to))

  if (target === index.value) {
    return
  }

  engine.moveItem(api.value.collectionKey, api.value.itemId, target)
  announcement.value = t('cms.editor.collection.moved', { position: target + 1, count: count.value })

  // The item re-renders in its new place; keep focus on its handle.
  await nextTick()
  focusHandle()
}

function duplicate() {
  engine.duplicateItem(api.value.collectionKey, api.value.itemId)
}

async function remove() {
  const list = siblings()
  const position = list.findIndex(field => field.id === props.item.id)
  const neighbour = list[position + 1] ?? list[position - 1]
  const collection = engine.fields.get(api.value.collectionId)

  engine.removeItem(api.value.collectionKey, api.value.itemId)
  view.select(null)

  // Focus must not fall to <body>: the next item, else the list (WCAG 2.4.3).
  await nextTick()
  ;(neighbour?.el.isConnected ? neighbour.el : collection?.el)?.focus({ preventScroll: true })

  // The toast undoes this delete only while it is still the last step.
  const step = engine.lastStepId.value
  ui.toast(t('cms.editor.collection.deleted'), {
    action: {
      label: t('cms.editor.collection.undo'),
      run: () => {
        if (engine.lastStepId.value === step) {
          engine.undo()
        } else {
          ui.toast(t('cms.editor.collection.undoGone'))
        }
      },
    },
  })
}

function addAfter() {
  const collection = engine.fields.get(api.value.collectionId)

  if (collection?.kind === 'collection') {
    collection.api.add(api.value.itemId)
  }
}

// ── Drag to reorder ───────────────────────────────────────────────────

const dragging = ref(false)
const target = ref<number | null>(null)
const targetBox = ref<Box | null>(null)

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) {
    return
  }

  event.preventDefault()
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  dragging.value = true
  target.value = index.value
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value) {
    return
  }

  const boxes = siblings().map(field => toBox(field.el.getBoundingClientRect()))
  const next = dropIndex(boxes, { x: event.clientX, y: event.clientY }, index.value)
  target.value = next

  const box = boxes[next]
  targetBox.value = box ? { ...box, x: box.x - props.frame.x, y: box.y - props.frame.y } : null
}

function onPointerUp() {
  const to = target.value
  const moving = dragging.value
  stopDrag()

  if (moving && to !== null) {
    void move(to)
  }
}

function stopDrag() {
  dragging.value = false
  target.value = null
  targetBox.value = null
}

function onHandleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && dragging.value) {
    event.stopPropagation()
    stopDrag()
    return
  }

  if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    event.preventDefault()
    void move(index.value - 1)
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    event.preventDefault()
    void move(index.value + 1)
  }
}

onBeforeUnmount(stopDrag)

// Selected from the keyboard (Enter on the item): its controls are the next stop.
onMounted(() => {
  if (view.selection.value === props.item.id && view.selectionSource.value === 'keyboard') {
    focusHandle()
  }
})

const style = computed(() => ({
  transform: `translate(${props.box.x + props.box.w - 6}px, ${Math.max(props.box.y + 6, 6)}px) translateX(-100%)`,
}))

const addStyle = computed(() => ({
  transform: `translate(${props.box.x + props.box.w / 2}px, ${props.box.y + props.box.h}px) translate(-50%, -50%)`,
}))
</script>

<template>
  <div
    class="item-outline"
    aria-hidden="true"
    :style="{
      transform: `translate(${box.x - 4}px, ${box.y - 4}px)`,
      width: `${box.w + 8}px`,
      height: `${box.h + 8}px`,
    }"
  />

  <div
    v-if="targetBox"
    class="item-target"
    aria-hidden="true"
    :style="{
      transform: `translate(${targetBox.x - 4}px, ${targetBox.y - 4}px)`,
      width: `${targetBox.w + 8}px`,
      height: `${targetBox.h + 8}px`,
    }"
  />

  <div
    class="item-controls"
    role="group"
    data-cms-item-controls
    :aria-label="item.label ?? t('cms.editor.kinds.item')"
    :style="style"
  >
    <AdminButton
      ref="handle"
      variant="ghost"
      size="xs"
      icon-only
      class="item-controls__handle"
      :class="{ 'item-controls__handle--active': dragging }"
      :title="t('cms.editor.collection.drag')"
      :aria-label="t('cms.editor.collection.drag')"
      :aria-describedby="`${uid}-keys`"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="stopDrag"
      @keydown="onHandleKeydown"
    >
      <Icon
        name="lucide:grip-vertical"
        aria-hidden="true"
      />
    </AdminButton>
    <AdminButton
      variant="ghost"
      size="xs"
      icon-only
      :disabled="index === 0"
      :title="t('cms.editor.collection.moveUp')"
      :aria-label="t('cms.editor.collection.moveUp')"
      @click="move(index - 1)"
    >
      <Icon
        name="lucide:arrow-up"
        aria-hidden="true"
      />
    </AdminButton>
    <AdminButton
      variant="ghost"
      size="xs"
      icon-only
      :disabled="index >= count - 1"
      :title="t('cms.editor.collection.moveDown')"
      :aria-label="t('cms.editor.collection.moveDown')"
      @click="move(index + 1)"
    >
      <Icon
        name="lucide:arrow-down"
        aria-hidden="true"
      />
    </AdminButton>
    <span
      class="item-controls__divider"
      aria-hidden="true"
    />
    <AdminButton
      variant="ghost"
      size="xs"
      icon-only
      :disabled="!api.canAdd()"
      :title="t('cms.editor.collection.duplicate')"
      :aria-label="t('cms.editor.collection.duplicate')"
      @click="duplicate"
    >
      <Icon
        name="lucide:copy"
        aria-hidden="true"
      />
    </AdminButton>
    <AdminButton
      variant="ghost"
      size="xs"
      icon-only
      class="item-controls__danger"
      :disabled="!api.canRemove()"
      :title="t('cms.editor.collection.delete')"
      :aria-label="t('cms.editor.collection.delete')"
      @click="remove"
    >
      <Icon
        name="lucide:trash-2"
        aria-hidden="true"
      />
    </AdminButton>
    <span
      :id="`${uid}-keys`"
      class="ed-visually-hidden"
    >{{ t('cms.editor.collection.keys') }}</span>
    <span
      class="ed-visually-hidden"
      role="status"
    >{{ announcement }}</span>
  </div>

  <AdminButton
    v-if="api.canAdd() && !dragging"
    variant="primary"
    size="xs"
    icon-only
    class="item-add"
    :style="addStyle"
    :title="t('cms.editor.collection.addAfter')"
    :aria-label="t('cms.editor.collection.addAfter')"
    @click="addAfter"
  >
    <Icon
      name="lucide:plus"
      aria-hidden="true"
    />
  </AdminButton>
</template>

<style scoped>
.item-outline,
.item-target {
  position: absolute;
  top: 0;
  left: 0;
  border-radius: var(--cms-radius-lg);
  pointer-events: none;
}

.item-outline {
  outline: 1.5px solid color-mix(in srgb, var(--cms-primary) 70%, transparent);
  outline-offset: -1px;
}

.item-target {
  background: color-mix(in srgb, var(--cms-primary) 12%, transparent);
  outline: 2px dashed var(--cms-primary);
  outline-offset: -1px;
}

.item-controls {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-md);
  background: var(--cms-card);
  box-shadow: var(--cms-shadow-md);
  pointer-events: auto;
}

.item-controls__danger {
  color: var(--cms-destructive);
}

.item-controls__handle {
  cursor: grab;
  touch-action: none;
}

.item-controls__handle--active {
  cursor: grabbing;
  background: var(--cms-primary-subtle);
}

.item-controls__divider {
  width: 1px;
  height: 18px;
  margin: 0 2px;
  background: var(--cms-border);
}

.item-add {
  position: absolute;
  top: 0;
  left: 0;
  border: 2px solid var(--cms-card);
  border-radius: var(--cms-radius-full);
  box-shadow: var(--cms-shadow-md);
  pointer-events: auto;
}
</style>
