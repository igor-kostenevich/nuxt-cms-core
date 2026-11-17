import { describe, expect, it } from 'vitest'
import { frameOffset, visibleFrame } from '../app/admin/media/crop'
import { formatBytes, mediaFileProblem } from '../app/admin/media/files'
import { usageLabels } from '../app/admin/media/usage'
import { resolveImage, toImageValue } from '../app/primitives/media'
import type { CmsMedia, CmsMediaMap } from '../app/types/media'

const hero: CmsMedia = {
  id: 'hero-id',
  name: 'hero.jpg',
  url: 'https://storage.test/cms-media/hero.jpg',
  mime: 'image/jpeg',
  size: 1024,
  width: 1600,
  height: 900,
  defaultAlt: 'Studio from the library',
  defaultFocal: { x: 30, y: 70 },
  createdAt: '2026-11-17T10:00:00+00:00',
  updatedAt: '2026-11-17T10:00:00+00:00',
}

const media: CmsMediaMap = { [hero.id]: hero }
const code = { src: '/media/default.svg', alt: 'Alt from code' }

describe('resolveImage (C-74)', () => {
  it('renders the code default without a value', () => {
    expect(resolveImage(undefined, media, code)).toEqual({
      src: '/media/default.svg',
      alt: 'Alt from code',
      width: undefined,
      height: undefined,
      objectPosition: undefined,
      media: null,
    })
  })

  // A deleted media item is absent from the map: the site falls back to code.
  it('renders the code default when the media is deleted or unknown', () => {
    const image = resolveImage({ mediaId: 'deleted-id', alt: 'Override' }, media, code)
    expect(image.src).toBe('/media/default.svg')
    expect(image.alt).toBe('Alt from code')
    expect(image.media).toBeNull()
  })

  it('renders the media with its size and default alt and focal point', () => {
    expect(resolveImage({ mediaId: hero.id }, media, code)).toEqual({
      src: hero.url,
      alt: 'Studio from the library',
      width: 1600,
      height: 900,
      objectPosition: '30% 70%',
      media: hero,
    })
  })

  it('prefers the usage override for alt and focal point', () => {
    const image = resolveImage({ mediaId: hero.id, alt: 'Override', focal: { x: 10, y: 20 } }, media, code)
    expect(image.alt).toBe('Override')
    expect(image.objectPosition).toBe('10% 20%')
  })

  it('falls back to the code alt when the media has none, and treats an empty override as unset', () => {
    const noAlt: CmsMediaMap = { [hero.id]: { ...hero, defaultAlt: '' } }
    expect(resolveImage({ mediaId: hero.id, alt: '' }, noAlt, code).alt).toBe('Alt from code')
  })

  it('renders an empty alt for a decorative image, set in content or in code', () => {
    expect(resolveImage({ mediaId: hero.id, alt: 'Override', decorative: true }, media, code).alt).toBe('')
    expect(resolveImage({ mediaId: hero.id }, media, { ...code, decorative: true }).alt).toBe('')
    expect(resolveImage(null, media, { ...code, decorative: true }).alt).toBe('')
  })

  // Content is untrusted: a string in focal must not reach the style attribute.
  it('drops a focal point that is not two numbers in 0–100', () => {
    const injected = { mediaId: hero.id, focal: { x: '0; position:fixed; inset:0', y: 0 } }
    expect(resolveImage(injected, media, code).objectPosition).toBe('30% 70%')
    expect(resolveImage({ mediaId: hero.id, focal: { x: 150, y: 10 } }, media, code).objectPosition).toBe('30% 70%')
    expect(resolveImage({ mediaId: hero.id, focal: { x: Number.NaN, y: 10 } }, media, code).objectPosition).toBe('30% 70%')
  })

  it('ignores decorative from a value whose media is gone', () => {
    expect(resolveImage({ mediaId: 'deleted-id', decorative: true }, media, code).alt).toBe('Alt from code')
  })

  it('keeps the code position when no focal point applies', () => {
    const noFocal: CmsMediaMap = { [hero.id]: { ...hero, defaultFocal: null } }
    expect(resolveImage({ mediaId: hero.id }, noFocal, { ...code, position: '50% 0%' }).objectPosition).toBe('50% 0%')
  })
})

describe('toImageValue', () => {
  it('accepts an object with a media id only', () => {
    expect(toImageValue({ mediaId: 'id', alt: 'A' })).toEqual({ mediaId: 'id', alt: 'A' })
    expect(toImageValue({ mediaId: 'id', alt: 5, decorative: 'yes', focal: { x: 1 }, extra: 1 })).toEqual({ mediaId: 'id' })
    expect(toImageValue('/media/cover.svg')).toBeNull()
    expect(toImageValue({ mediaId: '' })).toBeNull()
    expect(toImageValue([{ mediaId: 'id' }])).toBeNull()
    expect(toImageValue(null)).toBeNull()
  })
})

describe('mediaFileProblem (C-75)', () => {
  it('accepts JPG, PNG, WebP and SVG up to 5 MB', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']) {
      expect(mediaFileProblem({ type, size: 5 * 1024 * 1024 })).toBeNull()
    }
  })

  it('rejects other types and larger files', () => {
    expect(mediaFileProblem({ type: 'image/gif', size: 10 })).toBe('type')
    expect(mediaFileProblem({ type: 'application/pdf', size: 10 })).toBe('type')
    expect(mediaFileProblem({ type: '', size: 10 })).toBe('type')
    expect(mediaFileProblem({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toBe('size')
  })
})

describe('formatBytes', () => {
  it('uses binary units like the upload limit', () => {
    expect(formatBytes(850, 'en')).toBe('850 B')
    expect(formatBytes(1.2 * 1024 * 1024, 'en')).toBe('1.2 MB')
    expect(formatBytes(120 * 1024, 'en')).toBe('120 KB')
  })
})

describe('usageLabels', () => {
  const t = (key: string, params?: Record<string, string | number>) => (params ? `${key}:${params.page}` : key)

  it('lists each page once and marks pages that use the media only in a draft', () => {
    expect(usageLabels([
      { kind: 'page', pageKey: 'home', locale: 'en', draft: false },
      { kind: 'page', pageKey: 'home', locale: 'en', draft: true },
      { kind: 'page', pageKey: 'about', locale: 'en', draft: true },
      { kind: 'brand', slot: 'logo' },
    ], t)).toEqual(['home', 'cms.media.usage.draft:about', 'cms.media.usage.logo'])
  })
})

describe('visibleFrame (focal point preview)', () => {
  it('is null when the page shows the image whole', () => {
    expect(visibleFrame({ width: 400, height: 300 }, { width: 1600, height: 1200 }, 'cover')).toBeNull()
    expect(visibleFrame({ width: 400, height: 200 }, { width: 1600, height: 1200 }, 'fill')).toBeNull()
    expect(visibleFrame({ width: 400, height: 200 }, { width: 0, height: 0 }, 'cover')).toBeNull()
  })

  it('crops the sides of a wide image in a square box', () => {
    expect(visibleFrame({ width: 300, height: 300 }, { width: 1200, height: 600 }, 'cover')).toEqual({ width: 0.5, height: 1 })
  })

  it('crops top and bottom of a portrait image in a landscape box', () => {
    const frame = visibleFrame({ width: 1000, height: 700 }, { width: 600, height: 800 }, 'cover')
    expect(frame?.width).toBe(1)
    expect(frame?.height).toBeCloseTo(0.525)
  })

  it('places the frame like object-position does', () => {
    const frame = { width: 0.5, height: 1 }
    expect(frameOffset(frame, { x: 0, y: 50 })).toEqual({ left: 0, top: 0 })
    expect(frameOffset(frame, { x: 50, y: 50 })).toEqual({ left: 25, top: 0 })
    expect(frameOffset(frame, { x: 100, y: 50 })).toEqual({ left: 50, top: 0 })
  })
})
