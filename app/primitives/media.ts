/** Focal point in percent of the image, 0–100 on each axis. */
export interface CmsFocalPoint {
  x: number
  y: number
}

/** CSS `object-position` for a focal point; undefined keeps the browser default. */
export function focalPosition(focal: CmsFocalPoint | undefined | null, fallback?: string): string | undefined {
  return focal ? `${focal.x}% ${focal.y}%` : fallback
}
