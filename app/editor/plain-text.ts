const BLOCK_TAGS = new Set(['DIV', 'P', 'LI'])

/**
 * Text a contenteditable holds, as typed. Not `innerText`: that applies CSS
 * (`text-transform: uppercase` would store "CREATIVE STUDIO" for "Creative
 * studio") and depends on layout. Line breaks the browser inserts as `<br>`
 * or block elements become `\n`; a trailing one is not content.
 */
export function plainTextOf(root: Node): string {
  let text = ''

  function walk(node: Node) {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.nodeValue ?? ''
      } else if (child.nodeName === 'BR') {
        text += '\n'
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (BLOCK_TAGS.has(child.nodeName) && text !== '' && !text.endsWith('\n')) {
          text += '\n'
        }

        walk(child)
      }
    }
  }

  walk(root)
  return text.replace(/\n$/, '')
}
