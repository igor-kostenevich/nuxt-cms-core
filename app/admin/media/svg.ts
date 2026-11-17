/**
 * SVG clean-up before upload (MASTER_PLAN C-75).
 *
 * An SVG is a document: opened by its Storage URL, it runs its scripts. The
 * site renders SVG only through <img>, where scripts never run, but the file
 * itself is public. So the browser rebuilds every SVG from an allow-list before
 * it goes to Storage: scripts, event handlers, foreign content, animations
 * that can rewrite attributes, and links out of the document are dropped.
 *
 * This guards against a hostile file picked up by accident, the realistic case.
 * It is not a security boundary: upload goes straight to Storage (C-71), so a
 * CMS user calling the API directly bypasses it. Server-side validation is a
 * TODO (MASTER_PLAN §3).
 *
 * Browser only: needs DOMParser and XMLSerializer.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Drawing elements; anything else is removed with its content. */
const ELEMENTS = new Set([
  'svg', 'g', 'defs', 'symbol', 'use', 'title', 'desc', 'style',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'textpath',
  'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'pattern', 'marker',
  'filter', 'feblend', 'fecolormatrix', 'fecomponenttransfer', 'fecomposite', 'fedropshadow',
  'feflood', 'fefunca', 'fefuncb', 'fefuncg', 'fefuncr', 'fegaussianblur', 'femerge',
  'femergenode', 'femorphology', 'feoffset',
])

/** Links: kept as their content, the link itself goes. */
const UNWRAP = new Set(['a'])

const REFERENCE_ATTRIBUTES = new Set(['href', 'xlink:href'])
// Control characters and spaces are ignored by URL parsers: `java\tscript:`.
// eslint-disable-next-line no-control-regex
const IGNORED_IN_URLS = /[\u0000- ]/g
/** `url(...)` pointing anywhere but a fragment of this document. */
const EXTERNAL_URL = /url\s*\(\s*['"]?\s*(?!#)/i
const DANGEROUS_CSS = /@import|expression\s*\(|javascript:|behavior\s*:|-moz-binding/i

function isLocalReference(value: string): boolean {
  return value.replace(IGNORED_IN_URLS, '').startsWith('#')
}

function isSafeCss(css: string): boolean {
  const compact = css.replace(IGNORED_IN_URLS, '')
  return !DANGEROUS_CSS.test(compact) && !EXTERNAL_URL.test(css)
}

function cleanAttributes(element: Element) {
  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase()
    const value = attribute.value

    const drop = name.startsWith('on')
      || (REFERENCE_ATTRIBUTES.has(name) && !isLocalReference(value))
      || (name === 'style' && !isSafeCss(value))
      || /javascript:|data:/i.test(value.replace(IGNORED_IN_URLS, ''))

    if (drop) {
      element.removeAttributeNode(attribute)
    }
  }
}

function cleanTree(element: Element) {
  for (const child of [...element.children]) {
    const name = child.localName.toLowerCase()

    if (child.namespaceURI !== SVG_NS) {
      child.remove()
      continue
    }

    if (UNWRAP.has(name)) {
      cleanTree(child)
      child.replaceWith(...child.childNodes)
      continue
    }

    if (!ELEMENTS.has(name) || (name === 'style' && !isSafeCss(child.textContent ?? ''))) {
      child.remove()
      continue
    }

    cleanAttributes(child)
    cleanTree(child)
  }
}

/**
 * The SVG rebuilt from the allow-list, or null when the text is not an SVG
 * document. Comments, processing instructions and the doctype are dropped:
 * only the root element is serialized.
 */
export function sanitizeSvg(text: string): string | null {
  const document = new DOMParser().parseFromString(text, 'image/svg+xml')
  const root = document.documentElement

  if (
    document.getElementsByTagName('parsererror').length > 0
    || root.namespaceURI !== SVG_NS
    || root.localName !== 'svg'
  ) {
    return null
  }

  cleanAttributes(root)
  cleanTree(root)

  // The serializer declares the namespaces the remaining nodes use.
  return new XMLSerializer().serializeToString(root)
}

/** A cleaned copy of an SVG file under the same name, or null when it is not an SVG. */
export async function sanitizeSvgFile(file: File): Promise<File | null> {
  const clean = sanitizeSvg(await file.text())
  return clean === null ? null : new File([clean], file.name, { type: file.type, lastModified: file.lastModified })
}
