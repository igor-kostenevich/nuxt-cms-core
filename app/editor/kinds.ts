import type { CmsFieldValueIssue } from '../../src/content-fields'
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
  /** A text in a form input of a Client entry editor (014): translatable, like `text`. */
  | 'input'
  /** A plain value in a form control (select, number): structure, read-only in a translation (C-78). */
  | 'value'
  /** Choice of entries of a section (014 §7): Automatic / Manual; structure, read-only in a translation. */
  | 'entries'

/**
 * Why a field blocks publishing: empty but required, too long, out of its
 * bounds, not of its format, or a choice no longer offered (014, C-103).
 */
export type FieldIssueKind = CmsFieldValueIssue

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

/** A section of entries (<CmsEntries field-key>). */
export interface EntriesApi {
  /** Type the picker offers. */
  type: () => string
  /** Default number of the newest entries (Automatic). */
  limit: () => number
  max: () => number
  /** Ids of the entries the section shows now (Manual starts from them). */
  shown: () => string[]
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
  input: undefined
  value: undefined
  entries: EntriesApi
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
  /** Bounds of a number field (a form of a Content type, 014). */
  min?: number
  max?: number
  /**
   * A field of a form (Core's form of a Content type, a Client editor): it has
   * no default from code, so no value is an empty field (`required` applies).
   */
  form?: boolean
  /**
   * The whole judgement of the value, for a field of Core's entry form: when
   * set, the Engine asks this instead of its own text rules.
   */
  validate?: (value: unknown) => FieldIssueKind | null
  /** Text the field shows from the page code, for the field registry (C-84). */
  defaultText?: () => string
  /**
   * The value the primitive got does not come from the edited document (014
   * §7): data of another entry rendered outside <CmsEntries>. Such a field is
   * read-only and the Engine refuses writes to an address only it holds.
   */
  foreign?: () => boolean
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
  /** A form control of an entry editor: the control shows focus itself; no selection frame. */
  control?: boolean
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
  // Form controls of an entry editor: the control is the UI, no Overlay outline.
  input: { icon: 'lucide:text-cursor-input', inline: false, linkLike: false, outlined: false, control: true },
  value: { icon: 'lucide:list-checks', inline: false, linkLike: false, outlined: false, control: true },
  entries: { icon: 'lucide:newspaper', inline: false, linkLike: false, outlined: true },
}
