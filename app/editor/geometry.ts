export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export function toBox(rect: DOMRect): Box {
  return { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
}

export function sameBox(a: Box | undefined, b: Box | undefined): boolean {
  return Boolean(a && b)
    && Math.abs(a!.x - b!.x) < 0.5
    && Math.abs(a!.y - b!.y) < 0.5
    && Math.abs(a!.w - b!.w) < 0.5
    && Math.abs(a!.h - b!.h) < 0.5
}

/**
 * Index an item dragged to `point` should move to, given the boxes of the
 * items in their current order. Works for rows, columns and grids: the
 * nearest item center wins, and the side of that center decides before/after.
 */
export function dropIndex(boxes: Box[], point: { x: number, y: number }, fromIndex: number): number {
  if (boxes.length === 0) {
    return 0
  }

  let nearest = 0
  let best = Number.POSITIVE_INFINITY

  boxes.forEach((box, index) => {
    const cx = box.x + box.w / 2
    const cy = box.y + box.h / 2
    const distance = (point.x - cx) ** 2 + (point.y - cy) ** 2

    if (distance < best) {
      best = distance
      nearest = index
    }
  })

  const box = boxes[nearest]!
  const horizontal = boxes.length > 1 && Math.abs(boxes[1]!.y - boxes[0]!.y) < boxes[0]!.h / 2
  const after = horizontal
    ? point.x > box.x + box.w / 2
    : point.y > box.y + box.h / 2

  let target = after ? nearest + 1 : nearest

  // Removing the item first shifts every later index down by one.
  if (target > fromIndex) {
    target -= 1
  }

  return Math.max(0, Math.min(boxes.length - 1, target))
}
