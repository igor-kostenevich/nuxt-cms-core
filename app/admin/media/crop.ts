import { shallowRef, watch, type ShallowRef } from 'vue'

/**
 * The part of an image the page shows, as fractions of the image (0–1).
 * Where that part sits depends on the focal point: `object-position` puts
 * x% of the image at x% of the box, so the frame's left edge is at
 * (1 − width) × x.
 */
export interface ImageFrame {
  width: number
  height: number
}

interface Size {
  width: number
  height: number
}

/** Below this share of the image hidden, a crop is not worth a focal point. */
const CROP_TOLERANCE = 0.01

/**
 * The visible part of an image in its box, or null when the page shows it
 * whole: only `object-fit: cover` crops, and only when the box and the image
 * have different proportions. Then the focal point changes nothing.
 */
export function visibleFrame(box: Size, natural: Size, fit: string): ImageFrame | null {
  if (fit !== 'cover' || box.width <= 0 || box.height <= 0 || natural.width <= 0 || natural.height <= 0) {
    return null
  }

  const scale = Math.max(box.width / natural.width, box.height / natural.height)
  const width = Math.min(1, box.width / (natural.width * scale))
  const height = Math.min(1, box.height / (natural.height * scale))

  return width > 1 - CROP_TOLERANCE && height > 1 - CROP_TOLERANCE ? null : { width, height }
}

/** Left / top of the frame in percent of the image, for a focal point in percent. */
export function frameOffset(frame: ImageFrame, focal: { x: number, y: number }): { left: number, top: number } {
  return {
    left: (1 - frame.width) * focal.x,
    top: (1 - frame.height) * focal.y,
  }
}

/**
 * The visible part of the image a field renders, kept up to date while the
 * panel is open: on load of a new file and on any resize of the image (the
 * page's CSS may crop it only at some widths). `find` runs after each DOM
 * update that `deps` triggers, so an image that appears late is picked up.
 */
export function useImageCrop(
  find: () => HTMLImageElement | null,
  deps: () => unknown,
): ShallowRef<ImageFrame | null> {
  const frame = shallowRef<ImageFrame | null>(null)

  watch(
    () => [deps(), find()] as const,
    ([, image], _previous, onCleanup) => {
      if (!image) {
        frame.value = null
        return
      }

      const update = () => {
        frame.value = visibleFrame(
          { width: image.clientWidth, height: image.clientHeight },
          { width: image.naturalWidth, height: image.naturalHeight },
          getComputedStyle(image).objectFit,
        )
      }

      const observer = new ResizeObserver(update)
      observer.observe(image)
      image.addEventListener('load', update)
      update()

      onCleanup(() => {
        observer.disconnect()
        image.removeEventListener('load', update)
      })
    },
    { immediate: true, flush: 'post' },
  )

  return frame
}
