import { computed, markRaw, ref, shallowReactive, shallowRef } from 'vue'
import { CmsDataError } from '../data/errors'
import { isRichTextDoc } from '../primitives/rich-text'
import { richTextPlain } from './plain-text'
import type {
  CmsPageContent,
  CmsPageEditable,
  CmsPageLocaleState,
  CmsPageLockStatus,
  CmsPageRevision,
} from '../types/pages'
import type { CmsImageValue, CmsMedia, CmsMediaMap } from '../types/media'
import type { CmsCollectionItem } from '../types/primitives'
import { withOverrides } from '../primitives/collection'
import { applyTranslation, pruneTranslation, translationLeaf, type CmsTranslation } from '../primitives/translation'
import type { CmsPageFieldRegistration } from '../data/repositories/pages.repository'
import type { FieldKind, FieldRegistration } from './kinds'
import {
  canSetAt,
  cloneDocument,
  createItemId,
  getAt,
  isCollectionItem,
  parseDocument,
  setAt,
  splitPath,
  stableStringify,
  type DocumentNode,
} from '../primitives/paths'

/**
 * What the editor needs from an entity's repository: the minimal Draftable
 * contract (MASTER_PLAN C-60). Pages implement it today; a collection record
 * with a template page can implement the same methods later.
 */
export interface EditorRepository {
  /** Draft and Published of a locale, and for a translation its base (C-78). */
  getEditable(key: string, locale: string | null): Promise<CmsPageEditable>
  getLocaleStates(key: string): Promise<CmsPageLocaleState[]>
  /** Records the translatable fields of the page for the Texts screen (C-84). */
  registerFields(key: string, editPath: string, fields: CmsPageFieldRegistration[], hiddenPrefixes: string[]): Promise<void>
  saveDraft(key: string, locale: string, content: CmsPageContent, lockToken: string): Promise<string | null>
  publish(key: string, locale: string, lockToken: string): Promise<string>
  restore(
    key: string,
    locale: string,
    revisionId: string,
    lockToken: string,
    options?: { replaceDraft?: boolean },
  ): Promise<string | null>
  listRevisions(key: string, locale: string): Promise<CmsPageRevision[]>
  acquireLock(key: string): Promise<string>
  heartbeatLock(key: string, lockToken: string): Promise<void>
  releaseLock(key: string, lockToken: string): Promise<void>
  forceUnlock(key: string): Promise<void>
  getLockStatus(key: string): Promise<CmsPageLockStatus | null>
  /** Gets ready to release a lock while the tab closes; call it ahead of time. */
  prepareUnloadRelease(): Promise<void>
  /** Starts the release synchronously, so it survives the tab closing. */
  releaseLockOnUnload(key: string, lockToken: string): void
}

export interface ValidationIssue {
  fieldId: string
  key: string
  kind: 'required' | 'maxLength'
  label?: string
}

export type LockState = 'none' | 'held' | 'locked' | 'lost'
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface EditorEngineOptions {
  repository: EditorRepository
  /** Locale to edit; null: the default locale of the site. */
  locale: string | null
  /** Size of the Undo stack: `editor.historyLimit` in cms.config (MASTER_PLAN C-12). */
  historyLimit: number
}

interface UndoStep {
  /** Increasing step id, so a toast can tell whether its step is still the last one. */
  id: number
  snapshot: string
}

function toDocument(content: CmsPageContent | null | undefined): DocumentNode {
  return cloneDocument(content ?? {}) as DocumentNode
}

/** Blocks a field can sit in; `data-cms-section` names one explicitly. */
const SECTION_SELECTOR = '[data-cms-section], section, header, footer, article, aside, nav'

function squeeze(text: string | null | undefined, max = 80): string | undefined {
  const line = text?.replace(/\s+/g, ' ').trim()
  return line ? (line.length > max ? `${line.slice(0, max - 1)}…` : line) : undefined
}

/**
 * Name of the block of the page a field is in, as a person sees it: a name
 * given with `data-cms-section` or `aria-label`, else the block's first
 * heading, else its id.
 */
function sectionOf(el: HTMLElement): string | undefined {
  const block = typeof el.closest === 'function' ? el.closest<HTMLElement>(SECTION_SELECTOR) : null

  if (!block) {
    return undefined
  }

  const named = block.dataset.cmsSection || block.getAttribute('aria-label')

  if (named) {
    return squeeze(named)
  }

  const heading = block.querySelector('h1, h2, h3, h4')
  return squeeze(heading?.textContent) ?? squeeze(block.id?.replace(/[-_]+/g, ' '))
}

/**
 * Number of the collection item the element is in (1-based), as the page
 * shows it, so the Texts screen can say "Heading · item 2" whatever the id.
 */
function itemOf(el: HTMLElement): number | undefined {
  const item = typeof el.closest === 'function' ? el.closest<HTMLElement>('[data-cms-item]') : null
  const list = item?.parentElement

  if (!item || !list) {
    return undefined
  }

  const index = [...list.children].filter(child => child.hasAttribute('data-cms-item')).indexOf(item)
  return index >= 0 ? index + 1 : undefined
}

/** Document order of two elements; fake elements in tests keep their order. */
function byDocumentOrder(a: HTMLElement, b: HTMLElement): number {
  if (typeof a.compareDocumentPosition !== 'function' || a === b) {
    return 0
  }

  return a.compareDocumentPosition(b) & 4 /* FOLLOWING */ ? -1 : 1
}

/**
 * What the field registry (C-84) records of the mounted fields: the
 * translatable ones with their texts from code, where they are on the page
 * (block and order), and the hidden optional blocks whose fields are not
 * mounted but still exist.
 */
export function registryEntries(fields: Iterable<FieldRegistration>) {
  const entries = new Map<string, CmsPageFieldRegistration>()
  const hiddenPrefixes: string[] = []
  const ordered = [...fields].sort((a, b) => byDocumentOrder(a.el, b.el))

  for (const field of ordered) {
    if (field.kind === 'optional' && field.api.hidden()) {
      hiddenPrefixes.push(field.key)
      continue
    }

    if (field.kind === 'image' && field.api.decorative()) {
      continue
    }

    if (field.kind !== 'text' && field.kind !== 'richText' && field.kind !== 'link' && field.kind !== 'button' && field.kind !== 'image') {
      continue
    }

    if (entries.has(field.key)) {
      continue
    }

    const item = itemOf(field.el)
    const fromCode = field.defaultText?.()
      ?? (field.kind === 'link' || field.kind === 'button' ? field.api.defaultLabel() : undefined)
      ?? (field.kind === 'image' ? field.api.defaultAlt() : undefined)
    const tag = typeof field.el.tagName === 'string' ? field.el.tagName.toLowerCase() : undefined

    entries.set(field.key, {
      address: field.key,
      kind: field.kind,
      label: field.label || undefined,
      defaultText: fromCode?.trim() || undefined,
      section: sectionOf(field.el),
      position: entries.size,
      tag: tag && /^[a-z][a-z0-9]{0,9}$/.test(tag) ? tag : undefined,
      item,
    })
  }

  return { fields: [...entries.values()], hiddenPrefixes }
}

/**
 * Editor Engine (architecture §11): the single owner of the edited document.
 * Primitives never write to the backend; they call `set` and the collection
 * operations, and the Engine keeps dirty state, history, validation, save
 * status and the Content Lock. What the editor shows (selection, hover,
 * Preview) lives in the view (`view.ts`).
 */
export function createEditorEngine(options: EditorEngineOptions) {
  const { repository, historyLimit } = options

  const entity = shallowRef<{ key: string, locale: string } | null>(null)
  /** Edited locale; null until the first load tells the default. */
  const locale = ref<string | null>(options.locale)
  const defaultLocale = ref<string | null>(null)
  /** The default locale as shown in notes and chips (`UK`). */
  const defaultLocaleLabel = computed(() => (defaultLocale.value ?? '').toUpperCase())
  /**
   * The edited locale is not the default: the Engine edits its translation,
   * and the structure (collections, media, hrefs, switches) is read-only (C-78).
   */
  const translating = computed(() => Boolean(locale.value && defaultLocale.value && locale.value !== defaultLocale.value))
  /** Content of the default locale a translation applies to (Draft ?? Published). */
  const base = shallowRef<DocumentNode>({})
  /** The edited translation: translated leaves by address. */
  const translation = ref<CmsTranslation>({})
  /** What the page shows: the document, or the base with the translation applied. */
  const document = ref<DocumentNode>({})
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const loadError = shallowRef<unknown>(null)

  const savedSnapshot = ref(stableStringify({}))
  const publishedSnapshot = ref(stableStringify({}))
  const hasDraft = ref(false)
  const draftSavedAt = ref<string | null>(null)
  const publishedAt = ref<string | null>(null)

  const saveStatus = ref<SaveStatus>('idle')
  const saveError = shallowRef<unknown>(null)
  const publishing = ref(false)
  const publishError = shallowRef<unknown>(null)

  const lock = ref<LockState>('none')
  const lockHolder = shallowRef<CmsPageLockStatus | null>(null)
  let lockToken: string | null = null
  let disposed = false
  let saving: Promise<boolean> = Promise.resolve(true)

  const undoStack = shallowReactive<UndoStep[]>([])
  const redoStack = shallowReactive<UndoStep[]>([])
  let nextStepId = 1
  let editSession: { key: string, before: string } | null = null

  /**
   * Media the document may reference: from the reads and from the Picker.
   * It only grows: Undo can bring back an image chosen earlier in the session.
   */
  const media = shallowRef<CmsMediaMap>({})

  const fields = shallowReactive(new Map<string, FieldRegistration>())
  const collectionDefaults = new Map<string, () => CmsCollectionItem[]>()

  // Snapshots, dirty state and Undo track what is stored: the document, or
  // the translation. The document of a translation follows from it.
  const current = computed(() => stableStringify(translating.value ? translation.value : document.value))
  const publishedDocument = computed(() => translating.value
    ? applyTranslation(base.value, parseDocument(publishedSnapshot.value))
    : parseDocument(publishedSnapshot.value))
  const dirty = computed(() => current.value !== savedSnapshot.value)
  const readOnly = computed(() => lock.value !== 'held')
  const canUndo = computed(() => undoStack.length > 0 && !readOnly.value)
  const canRedo = computed(() => redoStack.length > 0 && !readOnly.value)
  /** Id of the last Undo step; 0 when there is none. */
  const lastStepId = computed(() => undoStack.at(-1)?.id ?? 0)
  /** Something differs from Published: a saved Draft or local changes. */
  const hasUnpublished = computed(() => hasDraft.value || current.value !== publishedSnapshot.value)

  const issues = computed<ValidationIssue[]>(() => {
    const result: ValidationIssue[] = []

    for (const field of fields.values()) {
      const text = textOf(getAt(document.value, field.key))

      if (text === null) {
        continue
      }

      if (field.required && text.trim() === '') {
        result.push({ fieldId: field.id, key: field.key, kind: 'required', label: field.label })
      }

      if (field.maxLength && text.length > field.maxLength) {
        result.push({ fieldId: field.id, key: field.key, kind: 'maxLength', label: field.label })
      }
    }

    return result
  })

  // ── Loading and the lock ─────────────────────────────────────────────

  /**
   * Binds the engine to an entity: takes the lock, then loads Draft ?? Published.
   * The content loads even when the lock is held by someone else: the page is
   * then shown read-only.
   */
  async function load(key: string) {
    entity.value = { key, locale: locale.value ?? '' }
    status.value = 'loading'
    loadError.value = null

    try {
      await acquire()
      await loadContent({ keepLocal: false })
      status.value = 'ready'
    } catch (error) {
      loadError.value = error
      status.value = 'error'
    }
  }

  /**
   * Re-reads the server state without touching the lock. Unsaved local
   * changes stay; only the state they are compared to is refreshed.
   */
  async function reload() {
    await saving
    await loadContent({ keepLocal: dirty.value })
  }

  /**
   * Reads Draft and Published. With `keepLocal`, the document stays as it is.
   * A read-only viewer reads Published only: the Draft is the work in progress
   * of the session that holds the lock.
   */
  async function loadContent(options: { keepLocal: boolean }) {
    const key = requireEntity()
    const editable = await repository.getEditable(key, locale.value)
    const draft = lock.value === 'held' ? editable.draft : null

    defaultLocale.value = editable.defaultLocale
    locale.value = editable.locale
    entity.value = { key, locale: editable.locale }

    const published = toDocument(editable.published)
    const start = draft ? toDocument(draft) : published

    base.value = toDocument(editable.base)
    addMedia(editable.media)
    publishedSnapshot.value = stableStringify(published)
    publishedAt.value = editable.publishedAt
    hasDraft.value = Boolean(draft)
    draftSavedAt.value = draft ? editable.draftUpdatedAt : null
    savedSnapshot.value = stableStringify(start)

    if (!options.keepLocal) {
      setState(start)
      undoStack.splice(0)
      redoStack.splice(0)
    } else if (translating.value) {
      // The base may have changed meanwhile: show the kept translation on it.
      refreshDocument()
    }
  }

  /** Replaces what is stored (document or translation) with a snapshot. */
  function setState(state: DocumentNode) {
    if (translating.value) {
      translation.value = state
      refreshDocument()
    } else {
      document.value = state
    }
  }

  function refreshDocument() {
    document.value = applyTranslation(base.value, translation.value)
  }

  /**
   * Switches the edited locale. The lock stays: it is one per page. Unsaved
   * changes are dropped; the caller asks first (session.confirmLeave).
   */
  async function setLocale(next: string) {
    if (next === locale.value || status.value !== 'ready') {
      return
    }

    await saving
    endEdit()
    const previous = locale.value
    locale.value = next
    status.value = 'loading'

    try {
      await loadContent({ keepLocal: false })
      status.value = 'ready'
    } catch (error) {
      locale.value = previous
      loadError.value = error
      status.value = 'error'
    }
  }

  function listLocaleStates() {
    return repository.getLocaleStates(requireEntity())
  }

  async function acquire() {
    const key = requireEntity()
    const before = lock.value

    try {
      const token = await repository.acquireLock(key)

      // The editor closed while the request was in flight: give the lock back
      // instead of leaving it to block others until the TTL.
      if (disposed) {
        await repository.releaseLock(key, token).catch(() => undefined)
        return
      }

      lockToken = token
      lock.value = 'held'
      lockHolder.value = null
    } catch (error) {
      if (!(error instanceof CmsDataError) || error.code !== 'locked') {
        throw error
      }

      lockToken = null
      lockHolder.value = await repository.getLockStatus(key).catch(() => null)
      // A tab that lost its lock keeps unsaved work; it stays "lost", so the
      // leave guards keep protecting that work, until the lock comes back.
      lock.value = before === 'lost' ? 'lost' : 'locked'
    }
  }

  async function heartbeat() {
    if (lock.value !== 'held' || !lockToken) {
      return
    }

    try {
      await repository.heartbeatLock(requireEntity(), lockToken)
    } catch (error) {
      handleLockError(error)
    }
  }

  /**
   * Takes the lock back after it was lost or freed. Someone else may have
   * saved or published meanwhile, so the server state is read again: without
   * local changes the document is replaced (and Undo cleared, its snapshots
   * predate those changes); with local changes they stay, and only the state
   * they are compared to is refreshed. A Save after this uses the new token.
   */
  async function takeOver() {
    await saving
    await acquire()

    if (lock.value === 'held' && status.value === 'ready') {
      await loadContent({ keepLocal: dirty.value })
    }
  }

  /** Re-reads who holds the lock while the page is read-only (the holder may go stale). */
  async function refreshLockStatus() {
    if (lock.value === 'locked' || lock.value === 'lost') {
      lockHolder.value = await repository.getLockStatus(requireEntity()).catch(() => lockHolder.value)
    }
  }

  async function forceUnlock() {
    await repository.forceUnlock(requireEntity())
    await takeOver()
  }

  /** The editor is gone: release the lock now and refuse any still in flight. */
  async function dispose() {
    disposed = true
    const key = entity.value?.key
    const token = lockToken

    lockToken = null

    if (lock.value === 'held') {
      lock.value = 'none'
    }

    if (key && token) {
      await repository.releaseLock(key, token).catch(() => undefined)
    }
  }

  function prepareUnloadRelease() {
    return repository.prepareUnloadRelease()
  }

  /** Synchronous lock release for `pagehide` (MASTER_PLAN R-18). */
  function releaseOnUnload() {
    const key = entity.value?.key

    if (key && lockToken) {
      repository.releaseLockOnUnload(key, lockToken)
    }
  }

  function handleLockError(error: unknown) {
    if (error instanceof CmsDataError && (error.code === 'lock_lost' || error.code === 'locked')) {
      lockToken = null
      lock.value = 'lost'
      return true
    }

    return false
  }

  // ── Save and Publish ─────────────────────────────────────────────────

  /**
   * Saves are serialized: a second Save (Cmd+S held down) waits for the first,
   * so responses cannot arrive out of order and leave `dirty` wrong. The
   * document is read when the save runs, so the latest state is saved.
   */
  function save(): Promise<boolean> {
    const next = saving.then(saveNow, saveNow)
    saving = next
    return next
  }

  async function saveNow(): Promise<boolean> {
    if (readOnly.value || !lockToken) {
      return false
    }

    if (!dirty.value) {
      return true
    }

    endEdit()

    // A translation keeps only leaves its base can still hold (deleted items go).
    if (translating.value) {
      translation.value = pruneTranslation(base.value, translation.value)
      refreshDocument()
    }

    const content = cloneDocument(translating.value ? translation.value : document.value)
    saveStatus.value = 'saving'
    saveError.value = null

    try {
      const savedAt = await repository.saveDraft(requireEntity(), requireLocale(), content, lockToken)
      savedSnapshot.value = stableStringify(content)
      hasDraft.value = savedAt !== null
      draftSavedAt.value = savedAt
      saveStatus.value = 'saved'
      return true
    } catch (error) {
      handleLockError(error)
      saveError.value = error
      saveStatus.value = 'error'
      return false
    }
  }

  /**
   * Publish promotes the saved Draft: only saved content goes live (MASTER_PLAN
   * C-61). Unsaved changes are saved first, so one click publishes what the
   * editor sees.
   */
  async function publish(): Promise<boolean> {
    if (readOnly.value || !lockToken || issues.value.length > 0) {
      return false
    }

    publishing.value = true
    publishError.value = null

    try {
      if (!await save()) {
        return false
      }

      if (!hasDraft.value || !lockToken) {
        return true
      }

      publishedAt.value = await repository.publish(requireEntity(), requireLocale(), lockToken)
      publishedSnapshot.value = savedSnapshot.value
      hasDraft.value = false
      draftSavedAt.value = null
      // Undo must not step back past what is now live (C-64).
      undoStack.splice(0)
      redoStack.splice(0)
      return true
    } catch (error) {
      handleLockError(error)
      publishError.value = error
      return false
    } finally {
      publishing.value = false
    }
  }

  async function listRevisions() {
    return repository.listRevisions(requireEntity(), requireLocale())
  }

  /**
   * Restores a revision into the Draft. Local unsaved changes are dropped:
   * the caller confirms that first. Resolves false when it did not happen.
   */
  async function restore(revisionId: string): Promise<boolean> {
    await saving

    if (readOnly.value || !lockToken) {
      return false
    }

    const key = requireEntity()

    try {
      const savedAt = await repository.restore(key, requireLocale(), revisionId, lockToken, { replaceDraft: true })
      const editable = await repository.getEditable(key, requireLocale())
      const draft = savedAt ? editable.draft : null
      const start = draft ? toDocument(draft) : parseDocument(publishedSnapshot.value)

      addMedia(editable.media)

      endEdit()
      record(() => {
        setState(start)
      })
      savedSnapshot.value = stableStringify(start)
      hasDraft.value = Boolean(draft)
      draftSavedAt.value = draft ? editable.draftUpdatedAt : null
      return true
    } catch (error) {
      handleLockError(error)
      throw error
    }
  }

  /** Makes media known to the editor: a Picker choice, or what a read returned. */
  function addMedia(...sources: (CmsMediaMap | CmsMedia[] | null | undefined)[]) {
    const next = { ...media.value }

    for (const source of sources) {
      for (const item of Array.isArray(source) ? source : Object.values(source ?? {})) {
        next[item.id] = item
      }
    }

    media.value = next
  }

  // ── Editing ──────────────────────────────────────────────────────────

  function get(key: string): unknown {
    return getAt(document.value, key)
  }

  /** Writes a value. Inside an edit session the change joins one Undo step. */
  function set(key: string, value: unknown) {
    if (readOnly.value) {
      return
    }

    if (translating.value) {
      setTranslated(key, value)
      return
    }

    const write = () => {
      materialize(key)
      setAt(document.value, key, cloneDocument(value))
    }

    if (editSession) {
      write()
      return
    }

    record(write)
  }

  /**
   * In a translation, a field writes only its translated leaves (text, label,
   * alt), and only where the base can hold them. Other changes are ignored:
   * the structure belongs to the default locale.
   */
  function setTranslated(key: string, value: unknown) {
    const kind = fieldKind(key)

    if (!kind || !canTranslate(key)) {
      return
    }

    // What a translation stores of the field (C-78): the text itself, the
    // label of a link or button, the alt of an image. The rest of the value
    // belongs to the default locale.
    const address = translationLeaf(kind, key)

    if (!address) {
      return
    }

    const leaf = address === key
      ? value
      : (value as Record<string, unknown> | null | undefined)?.[address.slice(key.length + 1)]
    // Only the changed leaf is written into the shown document, as in the
    // default locale: rebuilding it from the base on every keystroke
    // re-rendered the whole page and made typing lag.
    const write = () => {
      const next = { ...translation.value }

      if (leaf === undefined || leaf === null) {
        Reflect.deleteProperty(next, address)
        // Back to what the default locale says, or to the code default.
        setAt(document.value, address, cloneDocument(getAt(base.value, address)))
      } else {
        next[address] = cloneDocument(leaf)
        setAt(document.value, address, cloneDocument(leaf))
      }

      translation.value = next
    }

    if (editSession) {
      write()
      return
    }

    record(write)
  }

  /** Kind of a mounted field at this address. */
  function fieldKind(key: string): FieldKind | null {
    for (const field of fields.values()) {
      if (field.key === key) {
        return field.kind
      }
    }

    return null
  }

  /**
   * The field can be translated: the base holds its address. An item that
   * exists only as a code default cannot be: its id is not stored yet.
   */
  function canTranslate(key: string): boolean {
    if (!translating.value) {
      return true
    }

    // A collection the base does not hold is still the code defaults: its
    // items are translated by their id from code (C-88), which CmsCollection
    // lays over the defaults (withOverrides). A stored list without the item means
    // the item was deleted: canSetAt refuses that.
    return canSetAt(base.value, key)
  }

  /** The field has its own text in the edited translation. */
  function isTranslated(key: string, kind: FieldKind): boolean {
    const address = translationLeaf(kind, key)
    return address !== null && Object.hasOwn(translation.value, address)
  }

  /**
   * In a translation: the field has text to translate and no translation yet.
   * Backgrounds and decorative images have no alt to translate; an item that
   * exists only as a code default cannot be translated (canTranslate).
   */
  function isUntranslated(field: FieldRegistration): boolean {
    if (!translating.value || field.kind === 'background' || translationLeaf(field.kind, field.key) === null) {
      return false
    }

    if (field.kind === 'image'
      && (field.api.decorative() || (getAt(document.value, field.key) as CmsImageValue | undefined)?.decorative)) {
      return false
    }

    return canTranslate(field.key) && !isTranslated(field.key, field.kind)
  }

  /** Addresses of the mounted fields still to translate; one address can render twice. */
  const untranslated = computed(() => {
    const keys = new Set<string>()

    for (const field of fields.values()) {
      if (isUntranslated(field)) {
        keys.add(field.key)
      }
    }

    return keys
  })

  /** Value of a field in the default locale, for "Original" hints in a translation. */
  function baseValue(key: string): unknown {
    return getAt(base.value, key)
  }

  /** Starts typing in a field: everything until `endEdit` is one Undo step. Idempotent. */
  function beginEdit(key: string) {
    if (editSession?.key === key) {
      return
    }

    endEdit()
    editSession = { key, before: current.value }
  }

  function endEdit() {
    if (!editSession) {
      return
    }

    const { before } = editSession
    editSession = null

    if (before !== current.value) {
      pushUndo(before)
    }
  }

  /**
   * Value of a field in the published version. Inside a collection that is
   * not published yet, the item's code default (by its id) stands in for
   * it, so Reset does not empty a default item. Undefined: the slot default.
   */
  function publishedValue(key: string): unknown {
    const value = getAt(publishedDocument.value, key)

    if (value !== undefined) {
      return value
    }

    const segments = splitPath(key)

    for (let index = segments.length - 1; index > 0; index--) {
      const prefix = segments.slice(0, index).join('.')
      const defaults = collectionDefaults.get(prefix)

      if (defaults && getAt(publishedDocument.value, prefix) === undefined) {
        return getAt(defaults(), segments.slice(index).join('.'))
      }
    }

    return undefined
  }

  /** The field differs from the published version. */
  function changed(key: string): boolean {
    return stableStringify(getAt(document.value, key)) !== stableStringify(publishedValue(key))
  }

  /** Back to the published value of one field. */
  function reset(key: string) {
    if (!translating.value) {
      set(key, publishedValue(key))
      return
    }

    // A translation goes back to its published leaves, or to none.
    const kind = fieldKind(key)

    if (readOnly.value || !kind) {
      return
    }

    const published = parseDocument(publishedSnapshot.value)
    endEdit()
    record(() => {
      const next = { ...translation.value }

      const address = translationLeaf(kind, key)

      if (address && Object.hasOwn(published, address)) {
        next[address] = published[address]
      } else if (address) {
        Reflect.deleteProperty(next, address)
      }

      translation.value = next
      refreshDocument()
    })
  }

  /** The whole page back to the published version (a new local change; Save keeps it). */
  function resetAll() {
    if (readOnly.value) {
      return
    }

    endEdit()
    record(() => {
      setState(parseDocument(publishedSnapshot.value))
    })
  }

  /** Drops unsaved changes: back to the last saved state. */
  function discard() {
    endEdit()
    record(() => {
      setState(parseDocument(savedSnapshot.value))
    })
  }

  function undo() {
    endEdit()

    if (readOnly.value) {
      return
    }

    const step = undoStack.pop()

    if (!step) {
      return
    }

    redoStack.push({ id: step.id, snapshot: current.value })
    setState(parseDocument(step.snapshot))
  }

  function redo() {
    endEdit()

    if (readOnly.value) {
      return
    }

    const step = redoStack.pop()

    if (!step) {
      return
    }

    undoStack.push({ id: step.id, snapshot: current.value })
    setState(parseDocument(step.snapshot))
  }

  function record(change: () => void) {
    const before = current.value
    change()

    if (before !== current.value) {
      pushUndo(before)
    }
  }

  function pushUndo(snapshot: string) {
    undoStack.push({ id: nextStepId++, snapshot })
    redoStack.splice(0)

    if (undoStack.length > historyLimit) {
      undoStack.splice(0, undoStack.length - historyLimit)
    }
  }

  // ── Collections ──────────────────────────────────────────────────────

  /**
   * Items from code, used while the collection has no stored value. The first
   * change copies them into the document with their ids.
   */
  function registerCollectionDefaults(key: string, defaults: () => CmsCollectionItem[]) {
    collectionDefaults.set(key, defaults)
    return () => {
      if (collectionDefaults.get(key) === defaults) {
        collectionDefaults.delete(key)
      }
    }
  }

  /** Copies code defaults into the document for every collection on the way to `key`. */
  function materialize(key: string) {
    const segments = splitPath(key)

    for (let index = 1; index <= segments.length; index++) {
      const prefix = segments.slice(0, index).join('.')
      const defaults = collectionDefaults.get(prefix)

      const stored = getAt(document.value, prefix)

      // Not stored yet; an object is a translation of the code defaults.
      if (defaults && !Array.isArray(stored)) {
        setAt(document.value, prefix, cloneDocument(withOverrides(defaults(), stored)))
      }
    }
  }

  /** The stored list, created from defaults (or empty) first: only for writes. */
  function ensureMutableItems(key: string): CmsCollectionItem[] {
    materialize(key)

    if (!Array.isArray(getAt(document.value, key))) {
      setAt(document.value, key, [])
    }

    return getAt(document.value, key) as CmsCollectionItem[]
  }

  /** Items as shown: stored, or the code defaults. Read-only. */
  function collectionItems(key: string): CmsCollectionItem[] {
    const value = getAt(document.value, key)

    if (Array.isArray(value)) {
      return value.filter(isCollectionItem)
    }

    return withOverrides(collectionDefaults.get(key)?.() ?? [], value)
  }

  /** Adds an item after `afterId`, or at the end. Returns the new id. */
  function addItem(key: string, template: Record<string, unknown> = {}, afterId?: string): string | null {
    if (readOnly.value || translating.value) {
      return null
    }

    const id = createItemId(collectionItems(key).map(item => item.id))

    endEdit()
    record(() => {
      const list = ensureMutableItems(key)
      const after = afterId ? list.findIndex(item => item.id === afterId) : -1
      list.splice(after >= 0 ? after + 1 : list.length, 0, { ...cloneDocument(template), id })
    })

    return id
  }

  function duplicateItem(key: string, id: string): string | null {
    const source = collectionItems(key).find(item => item.id === id)

    if (!source) {
      return null
    }

    const { id: _id, ...rest } = source
    return addItem(key, rest, id)
  }

  function removeItem(key: string, id: string) {
    // A stale or missing item is not a change: no Undo step, no copied defaults.
    if (readOnly.value || translating.value || !collectionItems(key).some(item => item.id === id)) {
      return
    }

    endEdit()
    record(() => {
      const list = ensureMutableItems(key)
      list.splice(list.findIndex(item => item.id === id), 1)
    })
  }

  function moveItem(key: string, id: string, toIndex: number) {
    const items = collectionItems(key)
    const from = items.findIndex(item => item.id === id)
    const target = Math.max(0, Math.min(items.length - 1, toIndex))

    // Up on the first item, down on the last: nothing to record.
    if (readOnly.value || translating.value || from < 0 || from === target) {
      return
    }

    endEdit()
    record(() => {
      const list = ensureMutableItems(key)
      const [item] = list.splice(list.findIndex(entry => entry.id === id), 1)
      list.splice(target, 0, item!)
    })
  }

  // ── Fields ───────────────────────────────────────────────────────────

  function registerField(field: FieldRegistration) {
    fields.set(field.id, markField(field))

    return () => {
      fields.delete(field.id)
    }
  }

  function updateField(id: string, patch: Partial<Pick<FieldRegistration, 'key' | 'el' | 'label' | 'required' | 'maxLength'>>) {
    const field = fields.get(id)

    if (field) {
      fields.set(id, markField({ ...field, ...patch } as FieldRegistration))
    }
  }

  function requireLocale(): string {
    if (!locale.value) {
      throw new CmsDataError('unknown', 'The editor has no locale yet.')
    }

    return locale.value
  }

  function requireEntity(): string {
    if (!entity.value) {
      throw new CmsDataError('unknown', 'The editor is not bound to an entity.')
    }

    return entity.value.key
  }

  return {
    // state
    entity,
    locale,
    defaultLocale,
    defaultLocaleLabel,
    translating,
    document,
    status,
    loadError,
    dirty,
    readOnly,
    hasDraft,
    hasUnpublished,
    draftSavedAt,
    publishedAt,
    saveStatus,
    saveError,
    publishing,
    publishError,
    lock,
    lockHolder,
    issues,
    canUndo,
    canRedo,
    lastStepId,
    fields,
    media,
    // lifecycle
    load,
    setLocale,
    listLocaleStates,
    reload,
    heartbeat,
    takeOver,
    refreshLockStatus,
    forceUnlock,
    dispose,
    prepareUnloadRelease,
    releaseOnUnload,
    // persistence
    save,
    publish,
    listRevisions,
    restore,
    // editing
    get,
    set,
    canTranslate,
    isTranslated,
    isUntranslated,
    untranslated,
    baseValue,
    publishedValue,
    changed,
    beginEdit,
    endEdit,
    reset,
    resetAll,
    discard,
    undo,
    redo,
    registerCollectionDefaults,
    collectionItems,
    addItem,
    duplicateItem,
    removeItem,
    moveItem,
    registerField,
    updateField,
    addMedia,
  }
}

export type EditorEngine = ReturnType<typeof createEditorEngine>

/** DOM nodes and component handles are not state: keep Vue from proxying them. */
function markField<T extends FieldRegistration>(field: T): T {
  return {
    ...field,
    el: markRaw(field.el),
    api: field.api ? markRaw(field.api as object) : field.api,
  }
}

/** Plain text of a value for required / maxLength checks; null when not text. */
function textOf(value: unknown): string | null {
  if (typeof value === 'string') {
    return value
  }

  if (isRichTextDoc(value)) {
    return richTextPlain(value)
  }

  return null
}
