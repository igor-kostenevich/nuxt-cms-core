import { readonly, shallowRef } from 'vue'
import type { EditorRepository } from './engine'

/** The record a first save created, with its lock already held by this session. */
export interface CreatedDocument {
  id: string
  draftUpdatedAt: string | null
  lockToken: string
}

export interface PendingDocumentOptions {
  /** Repository of the existing documents of the kind (entries by id). */
  repository: EditorRepository
  /** Creates the document with its first draft and takes its lock, atomically. */
  create: (content: Record<string, unknown>, locale: string) => Promise<CreatedDocument>
  /** Language of the original, where a new document starts (read when the Engine loads). */
  defaultLocale: string | (() => string)
  /** An existing document: the facade only forwards. */
  id?: string | null
  /**
   * What a new document starts with (the declared defaults of its fields):
   * its first state, not a change; never applied to an existing document.
   */
  initial?: () => Record<string, unknown>
}

/** Lock token of a document that exists only in memory: nobody else can know it. */
const PENDING_TOKEN = 'pending'

/**
 * A repository for "create on first save" (014, §4.1): the Engine edits a new
 * document as if it existed and held its lock, so its lifecycle (Save, Publish,
 * Undo, validation, leave guards) stays the one of Edit Mode. Until the first
 * Save nothing is stored and there is no lock; that Save creates the document
 * with the draft and the lock in one call, and from then on every call goes to
 * the real repository under the real id and token. Closing before it leaves
 * nothing behind.
 */
export function createPendingDocumentRepository(options: PendingDocumentOptions) {
  const { repository, create } = options
  const defaultLocale = () => (typeof options.defaultLocale === 'function' ? options.defaultLocale() : options.defaultLocale)
  const id = shallowRef<string | null>(options.id ?? null)
  let token: string | null = null
  let creating: Promise<CreatedDocument> | null = null

  function initialContent() {
    const content = options.initial?.() ?? {}
    return Object.keys(content).length > 0 ? content : null
  }

  /** The token the Engine holds may still be the pending one: use the real one. */
  function realToken(held: string): string {
    return held === PENDING_TOKEN ? token ?? held : held
  }

  function existing(): string | null {
    return id.value
  }

  const facade: EditorRepository = {
    async getEditable(key, locale) {
      const current = existing()

      if (current) {
        return repository.getEditable(current, locale)
      }

      // A new document is written in the language of the original.
      return {
        key,
        locale: defaultLocale(),
        defaultLocale: defaultLocale(),
        base: null,
        draft: initialContent(),
        draftUpdatedAt: null,
        published: null,
        publishedAt: null,
        media: {},
      }
    },
    getLocaleStates: () => (existing() ? repository.getLocaleStates(existing()!) : Promise.resolve([])),
    takeOff: async (_key, lockToken) => {
      const current = existing()

      if (current) {
        await repository.takeOff?.(current, realToken(lockToken))
      }
    },
    // A document that was never stored has nothing to delete.
    remove: async (_key, lockToken) => {
      const current = existing()

      if (current) {
        await repository.remove?.(current, realToken(lockToken))
      }
    },
    // Entries have no field registry (C-84): their content is always stored.
    registerFields: async () => undefined,
    async saveDraft(key, locale, content, lockToken) {
      const current = existing()

      if (current) {
        return repository.saveDraft(current, locale, content, realToken(lockToken))
      }

      // Saves are serialized by the Engine, but a Publish right after a Save
      // must not create twice.
      creating ??= create(content, locale)

      try {
        const created = await creating
        token = created.lockToken
        id.value = created.id
        return created.draftUpdatedAt
      } finally {
        creating = null
      }
    },
    publish: (key, locale, lockToken) => repository.publish(require(), locale, realToken(lockToken)),
    restore: (key, locale, revisionId, lockToken, restoreOptions) =>
      repository.restore(require(), locale, revisionId, realToken(lockToken), restoreOptions),
    listRevisions: (key, locale) => (existing() ? repository.listRevisions(existing()!, locale) : Promise.resolve([])),
    getRevision: (revision, key, locale) =>
      existing() ? repository.getRevision(revision, existing()!, locale) : Promise.resolve(null),
    async acquireLock() {
      const current = existing()

      if (!current) {
        return PENDING_TOKEN
      }

      token = await repository.acquireLock(current)
      return token
    },
    heartbeatLock: async (key, lockToken) => {
      const current = existing()

      if (current) {
        await repository.heartbeatLock(current, realToken(lockToken))
      }
    },
    releaseLock: async (key, lockToken) => {
      const current = existing()

      if (current) {
        await repository.releaseLock(current, realToken(lockToken))
      }
    },
    forceUnlock: async () => {
      const current = existing()

      if (current) {
        await repository.forceUnlock(current)
      }
    },
    getLockStatus: () => (existing() ? repository.getLockStatus(existing()!) : Promise.resolve(null)),
    prepareUnloadRelease: () => repository.prepareUnloadRelease(),
    releaseLockOnUnload: (key, lockToken) => {
      const current = existing()

      if (current) {
        repository.releaseLockOnUnload(current, realToken(lockToken))
      }
    },
  }

  function require(): string {
    const current = existing()

    if (!current) {
      throw new Error('The document is not saved yet.')
    }

    return current
  }

  return {
    repository: facade,
    /** Id of the document once it exists; null while it is only in memory. */
    id: readonly(id),
  }
}
