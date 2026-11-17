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
 * items in their current order: it takes the place of the item under the
 * pointer, and the items in between shift. Between items, the nearest one
 * wins. Works the same for a column, a row and a grid of any shape.
 */
export function dropIndex(boxes: Box[], point: { x: number, y: number }): number {
  if (boxes.length === 0) {
    return 0
  }

  const under = boxes.findIndex(box => point.x >= box.x && point.x <= box.x + box.w
    && point.y >= box.y && point.y <= box.y + box.h)

  if (under !== -1) {
    return under
  }

  let nearest = 0
  let best = Number.POSITIVE_INFINITY

  boxes.forEach((box, index) => {
    // Distance to the box, not its center: a wide item next to a narrow one
    // must not lose a point that is right at its edge.
    const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.w))
    const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.h))
    const distance = dx ** 2 + dy ** 2

    if (distance < best) {
      best = distance
      nearest = index
    }
  })

  return nearest
}
