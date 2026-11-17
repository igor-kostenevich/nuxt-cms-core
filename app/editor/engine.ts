import { computed, markRaw, ref, shallowReactive, shallowRef } from 'vue'
import { CmsDataError } from '../data/errors'
import { isRichTextDoc } from '../primitives/rich-text'
import type {
  CmsPage,
  CmsPageContent,
  CmsPageDraft,
  CmsPageLockStatus,
  CmsPageRevision,
} from '../types/pages'
import type { CmsMedia, CmsMediaMap } from '../types/media'
import type { CmsCollectionItem } from '../types/primitives'
import type { FieldRegistration } from './kinds'
import {
  cloneDocument,
  createItemId,
  getAt,
  isCollectionItem,
  parseDocument,
  setAt,
  splitPath,
  stableStringify,
  type DocumentNode,
} from './paths'

/**
 * What the editor needs from an entity's repository: the minimal Draftable
 * contract (MASTER_PLAN C-60). Pages implement it today; a collection record
 * with a template page can implement the same methods later.
 */
export interface EditorRepository {
  getByKey(key: string, locale: string): Promise<CmsPage | null>
  getDraft(key: string, locale: string): Promise<CmsPageDraft | null>
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
  locale: string
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

/**
 * Editor Engine (architecture §11): the single owner of the edited document.
 * Primitives never write to the backend; they call `set` and the collection
 * operations, and the Engine keeps dirty state, history, validation, save
 * status and the Content Lock. What the editor shows (selection, hover,
 * Preview) lives in the view (`view.ts`).
 */
export function createEditorEngine(options: EditorEngineOptions) {
  const { repository, locale, historyLimit } = options

  const entity = shallowRef<{ key: string, locale: string } | null>(null)
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

  const current = computed(() => stableStringify(document.value))
  const publishedDocument = computed(() => parseDocument(publishedSnapshot.value))
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
    entity.value = { key, locale }
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
    const [draft, page] = await Promise.all([
      lock.value === 'held' ? repository.getDraft(key, locale) : Promise.resolve(null),
      repository.getByKey(key, locale),
    ])

    const published = toDocument(page?.content)
    const start = draft ? toDocument(draft.content) : published

    addMedia(page?.media, draft?.media)
    publishedSnapshot.value = stableStringify(published)
    publishedAt.value = page?.publishedAt ?? null
    hasDraft.value = Boolean(draft)
    draftSavedAt.value = draft?.updatedAt ?? null
    savedSnapshot.value = stableStringify(start)

    if (!options.keepLocal) {
      document.value = start
      undoStack.splice(0)
      redoStack.splice(0)
    }
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
    const content = cloneDocument(document.value)
    saveStatus.value = 'saving'
    saveError.value = null

    try {
      const savedAt = await repository.saveDraft(requireEntity(), locale, content, lockToken)
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

      publishedAt.value = await repository.publish(requireEntity(), locale, lockToken)
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
    return repository.listRevisions(requireEntity(), locale)
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
      const savedAt = await repository.restore(key, locale, revisionId, lockToken, { replaceDraft: true })
      const draft = savedAt ? await repository.getDraft(key, locale) : null
      const start = draft ? toDocument(draft.content) : cloneDocument(publishedDocument.value)

      addMedia(draft?.media)

      endEdit()
      record(() => {
        document.value = start
      })
      savedSnapshot.value = stableStringify(start)
      hasDraft.value = Boolean(draft)
      draftSavedAt.value = draft?.updatedAt ?? null
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
   * not published yet, the item's code default (`default-N`) stands in for
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
    set(key, publishedValue(key))
  }

  /** The whole page back to the published version (a new local change; Save keeps it). */
  function resetAll() {
    if (readOnly.value) {
      return
    }

    endEdit()
    record(() => {
      document.value = cloneDocument(publishedDocument.value)
    })
  }

  /** Drops unsaved changes: back to the last saved state. */
  function discard() {
    endEdit()
    record(() => {
      document.value = parseDocument(savedSnapshot.value)
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
    document.value = parseDocument(step.snapshot)
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
    document.value = parseDocument(step.snapshot)
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

      if (defaults && getAt(document.value, prefix) == null) {
        setAt(document.value, prefix, cloneDocument(defaults()))
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

    return collectionDefaults.get(key)?.() ?? []
  }

  /** Adds an item after `afterId`, or at the end. Returns the new id. */
  function addItem(key: string, template: Record<string, unknown> = {}, afterId?: string): string | null {
    if (readOnly.value) {
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
    if (readOnly.value || !collectionItems(key).some(item => item.id === id)) {
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
    if (readOnly.value || from < 0 || from === target) {
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

  function requireEntity(): string {
    if (!entity.value) {
      throw new CmsDataError('unknown', 'The editor is not bound to an entity.')
    }

    return entity.value.key
  }

  return {
    // state
    entity,
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

function richTextPlain(node: unknown): string {
  if (typeof node !== 'object' || node === null) {
    return ''
  }

  const { text, content } = node as { text?: unknown, content?: unknown }
  const own = typeof text === 'string' ? text : ''
  const children = Array.isArray(content) ? content.map(richTextPlain).join('') : ''
  return own + children
}
