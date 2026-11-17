import { CMS_MEDIA_MAX_SIZE, CMS_MEDIA_TYPES, type CmsMediaUpload } from '../../types/media'
import { sanitizeSvgFile } from './svg'

/** `accept` of a file input for the library. */
export const MEDIA_ACCEPT = Object.keys(CMS_MEDIA_TYPES).join(',')

/** `svg`: the file is not a readable SVG document. */
export type MediaFileProblem = 'type' | 'size' | 'svg'

/**
 * Why a file cannot be uploaded, checked before any request. The bucket and
 * the database check again (C-71, C-75).
 */
export function mediaFileProblem(file: Pick<File, 'type' | 'size'>): MediaFileProblem | null {
  if (!Object.hasOwn(CMS_MEDIA_TYPES, file.type)) {
    return 'type'
  }

  if (file.size > CMS_MEDIA_MAX_SIZE) {
    return 'size'
  }

  return null
}

/**
 * Intrinsic size of an image file, read by the browser. Null for an SVG
 * without width / height, or a file the browser cannot decode.
 */
export function readImageSize(file: Blob): Promise<{ width: number | null, height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    const done = (width: number | null, height: number | null) => {
      URL.revokeObjectURL(url)
      resolve({ width, height })
    }

    image.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = image
      done(width > 0 && height > 0 ? width : null, width > 0 && height > 0 ? height : null)
    }
    image.onerror = () => done(null, null)
    image.src = url
  })
}

/**
 * What goes to Storage: the file checked, an SVG rebuilt from its allow-list
 * (C-75), and its size read. A problem instead when the file is refused.
 */
export async function prepareMediaUpload(file: File): Promise<CmsMediaUpload | MediaFileProblem> {
  const problem = mediaFileProblem(file)

  if (problem) {
    return problem
  }

  const ready = file.type === 'image/svg+xml' ? await sanitizeSvgFile(file) : file

  if (!ready) {
    return 'svg'
  }

  return { file: ready, ...await readImageSize(ready) }
}

/** A refused file, for callers that report problems as errors. */
export class MediaFileError extends Error {
  constructor(readonly problem: MediaFileProblem) {
    super(`The file was refused: ${problem}`)
    this.name = 'MediaFileError'
  }
}

/** `1.2 MB`, `850 KB`: binary units like the upload limit. */
export function formatBytes(bytes: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }

  const digits = unit === 0 || value >= 10 ? 0 : 1
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)} ${units[unit]}`
}

/** Short type label for a card: `SVG`, `PNG`. */
export function mediaTypeLabel(mime: string): string {
  return (CMS_MEDIA_TYPES[mime as keyof typeof CMS_MEDIA_TYPES] ?? mime).toUpperCase()
}
