import type { Editor } from '@tiptap/vue-3'

/**
 * Field kinds of Edit Mode and the contract between an editable primitive
 * (which registers a field) and the Overlay / panels (which use it). Each
 * kind declares its own `api`, so a panel gets a typed handle instead of a cast.
 */

export type FieldKind =
  | 'text'
  | 'richText'
  | 'link'
  | 'button'
  | 'image'
  | 'background'
  | 'collection'
  | 'item'
  | 'optional'

export interface RichTextApi {
  readonly editor: Editor | null
}

/** Link and button: the code defaults the panel shows until they are changed. */
export interface LinkApi {
  defaultLabel: () => string
  defaultHref: () => string | undefined
}

/** Image and background. */
export interface ImageApi {
  defaultSrc: () => string | undefined
  defaultAlt: () => string
  decorative: () => boolean
}

export interface CollectionApi {
  readonly key: string
  count: () => number
  max: () => number | undefined
  canAdd: () => boolean
  add: (afterId?: string) => string | null
}

export interface ItemApi {
  collectionKey: string
  /** Field id of the owning collection. */
  collectionId: string
  itemId: string
  index: () => number
  count: () => number
  canRemove: () => boolean
  canAdd: () => boolean
}

export interface OptionalApi {
  hidden: () => boolean
  toggle: () => void
}

export interface FieldApis {
  text: undefined
  richText: RichTextApi
  link: LinkApi
  button: LinkApi
  image: ImageApi
  background: ImageApi
  collection: CollectionApi
  item: ItemApi
  optional: OptionalApi
}

interface FieldOf<K extends FieldKind> {
  /** Unique per mounted field; one address can be rendered more than once. */
  id: string
  /** Full address in the document, collection scope included. */
  key: string
  kind: K
  el: HTMLElement
  label?: string
  required?: boolean
  maxLength?: number
  /** Text the field shows from the page code, for the field registry (C-84). */
  defaultText?: () => string
  api: FieldApis[K]
}

/** A registered field; `kind` narrows `api`. */
export type FieldRegistration = { [K in FieldKind]: FieldOf<K> }[FieldKind]

export interface KindTraits {
  icon: string
  /** Edited in place (contenteditable / Tiptap): a click goes to the text, any other kind is selected. */
  inline: boolean
  /** Has a link: a click must not navigate. */
  linkLike: boolean
  /** Takes part in the dimming holes and outlines (items are covered by their list). */
  outlined: boolean
}

/** One table for every place that branches on the kind. */
export const KIND_TRAITS: Record<FieldKind, KindTraits> = {
  text: { icon: 'lucide:type', inline: true, linkLike: false, outlined: true },
  richText: { icon: 'lucide:pilcrow', inline: true, linkLike: false, outlined: true },
  link: { icon: 'lucide:link', inline: false, linkLike: true, outlined: true },
  button: { icon: 'lucide:mouse-pointer-click', inline: false, linkLike: true, outlined: true },
  image: { icon: 'lucide:image', inline: false, linkLike: false, outlined: true },
  background: { icon: 'lucide:wallpaper', inline: false, linkLike: false, outlined: true },
  collection: { icon: 'lucide:list', inline: false, linkLike: false, outlined: true },
  item: { icon: 'lucide:square-stack', inline: false, linkLike: false, outlined: false },
  optional: { icon: 'lucide:eye-off', inline: false, linkLike: false, outlined: true },
}
