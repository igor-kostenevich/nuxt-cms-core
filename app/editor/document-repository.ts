import { createEntriesRepository } from '../data/repositories/entries.repository'
import { createPagesRepository } from '../data/repositories/pages.repository'
import type { EditorRepository } from './engine'

/** What the Engine of one Edit Mode session edits: a page, or an entry of a type (014). */
export type EditedDocument =
  | { kind: 'page' }
  | { kind: 'entry', type: string, requireSlug: boolean }

/**
 * The repository of the edited document, behind the one contract the Engine
 * knows (C-60). Edit Mode learns what it edits only when the Client page binds
 * (useCmsPage or useCmsEntry, before the Engine loads), so the target is set
 * then; the key the Engine passes is the page key or the entry id.
 */
export function createDocumentRepository(options: { bootstrapLocale: string }) {
  const pages = createPagesRepository(undefined, options)
  const entries = createEntriesRepository(undefined, options)
  let target: EditedDocument = { kind: 'page' }

  function entry(): { type: string, requireSlug: boolean } | null {
    return target.kind === 'entry' ? target : null
  }

  const repository: EditorRepository = {
    getEditable: (key, locale) => {
      const bound = entry()
      return bound ? entries.getEditable(bound.type, key, locale) : pages.getEditable(key, locale)
    },
    getLocaleStates: (key) => {
      const bound = entry()
      return bound ? entries.getLocaleStates(bound.type, key) : pages.getLocaleStates(key)
    },
    // Entries keep no field registry (C-84): their content is always stored.
    registerFields: (key, editPath, fields, hiddenPrefixes) =>
      entry() ? Promise.resolve() : pages.registerFields(key, editPath, fields, hiddenPrefixes),
    saveDraft: (key, locale, content, lockToken) => {
      const bound = entry()
      return bound ? entries.saveDraft(bound.type, key, locale, content, lockToken) : pages.saveDraft(key, locale, content, lockToken)
    },
    publish: (key, locale, lockToken) => {
      const bound = entry()
      return bound
        ? entries.publish(bound.type, key, locale, lockToken, { requireSlug: bound.requireSlug })
        : pages.publish(key, locale, lockToken)
    },
    restore: (key, locale, revisionId, lockToken, restoreOptions) => {
      const bound = entry()
      return bound
        ? entries.restore(bound.type, key, locale, revisionId, lockToken, restoreOptions)
        : pages.restore(key, locale, revisionId, lockToken, restoreOptions)
    },
    listRevisions: (key, locale) => (entry() ? entries.listRevisions(key, locale) : pages.listRevisions(key, locale)),
    getRevision: (id, key, locale) => (entry() ? entries.getRevision(id, key, locale) : pages.getRevision(id, key, locale)),
    remove: (key, lockToken) => {
      const bound = entry()
      return bound ? entries.remove(bound.type, key, lockToken) : Promise.reject(new Error('A page cannot be deleted'))
    },
    takeOff: (key, lockToken) => {
      const bound = entry()
      return bound ? entries.takeOff(bound.type, key, lockToken) : Promise.reject(new Error('A page cannot be taken off the site'))
    },
    acquireLock: (key) => {
      const bound = entry()
      return bound ? entries.acquireLock(bound.type, key) : pages.acquireLock(key)
    },
    heartbeatLock: (key, lockToken) => {
      const bound = entry()
      return bound ? entries.heartbeatLock(bound.type, key, lockToken) : pages.heartbeatLock(key, lockToken)
    },
    releaseLock: (key, lockToken) => {
      const bound = entry()
      return bound ? entries.releaseLock(bound.type, key, lockToken) : pages.releaseLock(key, lockToken)
    },
    forceUnlock: (key) => {
      const bound = entry()
      return bound ? entries.forceUnlock(bound.type, key) : pages.forceUnlock(key)
    },
    getLockStatus: (key) => {
      const bound = entry()
      return bound ? entries.getLockStatus(bound.type, key) : pages.getLockStatus(key)
    },
    // Prepared in setup, before the page binds: both, so either release works.
    prepareUnloadRelease: async () => {
      await Promise.all([pages.prepareUnloadRelease(), entries.prepareUnloadRelease()])
    },
    releaseLockOnUnload: (key, lockToken) => {
      const bound = entry()

      if (bound) {
        entries.releaseLockOnUnload(bound.type, key, lockToken)
      } else {
        pages.releaseLockOnUnload(key, lockToken)
      }
    },
  }

  return {
    repository,
    entries,
    /** What the session edits; set by the first binding, before the Engine loads. */
    edit(document: EditedDocument) {
      target = document
    },
    edited: (): EditedDocument => target,
  }
}
