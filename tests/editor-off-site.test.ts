import { describe, expect, it, vi } from 'vitest'
import { createEditorEngine, type EditorRepository } from '../app/editor/engine'

// An entry taken off the site is a draft to the editor, and Publish of the
// original puts it back even without a pending draft (014 UX).

function repository(options: { offSite: boolean, draft?: Record<string, unknown> | null, basePublished?: boolean }): EditorRepository {
  const published = { title: 'Taken off' }

  return {
    getEditable: vi.fn(async (key: string, locale: string | null) => ({
      key,
      locale: locale ?? 'en',
      defaultLocale: 'en',
      base: (locale ?? 'en') === 'en' ? null : published,
      draft: (locale ?? 'en') === 'en' ? options.draft ?? null : null,
      draftUpdatedAt: options.draft ? '2026-11-24T11:00:00Z' : null,
      published: (locale ?? 'en') === 'en' ? published : {},
      publishedAt: '2026-11-24T10:00:00Z',
      media: {},
      offSite: options.offSite,
      basePublished: options.basePublished ?? true,
    })),
    getLocaleStates: vi.fn(async () => []),
    registerFields: vi.fn(async () => undefined),
    saveDraft: vi.fn(async () => '2026-11-24T11:00:00Z'),
    publish: vi.fn(async () => '2026-11-27T12:00:00Z'),
    restore: vi.fn(async () => null),
    listRevisions: vi.fn(async () => []),
    getRevision: vi.fn(async () => null),
    acquireLock: vi.fn(async () => 'token'),
    heartbeatLock: vi.fn(async () => undefined),
    releaseLock: vi.fn(async () => undefined),
    forceUnlock: vi.fn(async () => undefined),
    getLockStatus: vi.fn(async () => null),
    prepareUnloadRelease: vi.fn(async () => undefined),
    releaseLockOnUnload: vi.fn(),
  }
}

async function engineOf(repo: EditorRepository) {
  const engine = createEditorEngine({ repository: repo, locale: null, historyLimit: 20 })
  await engine.load('entry-1')
  return engine
}

describe('an entry off the site', () => {
  it('has something to publish without a draft, and Publish puts it back', async () => {
    const repo = repository({ offSite: true })
    const engine = await engineOf(repo)

    expect(engine.offSite.value).toBe(true)
    expect(engine.hasUnpublished.value).toBe(true)

    await expect(engine.publish()).resolves.toBe(true)
    expect(repo.publish).toHaveBeenCalledTimes(1)
    expect(engine.offSite.value).toBe(false)
    expect(engine.hasUnpublished.value).toBe(false)
  })

  it('with a draft, Publish publishes it (and the server puts the entry back)', async () => {
    const repo = repository({ offSite: true, draft: { title: 'Newer' } })
    const engine = await engineOf(repo)

    await expect(engine.publish()).resolves.toBe(true)
    expect(repo.publish).toHaveBeenCalledTimes(1)
    expect(engine.offSite.value).toBe(false)
  })

  it('an entry on the site with nothing pending publishes nothing', async () => {
    const repo = repository({ offSite: false })
    const engine = await engineOf(repo)

    expect(engine.hasUnpublished.value).toBe(false)
    await expect(engine.publish()).resolves.toBe(true)
    expect(repo.publish).not.toHaveBeenCalled()
  })

  it('a translation is not put back by Publish: only the original is', async () => {
    const repo = repository({ offSite: true })
    const engine = await engineOf(repo)
    await engine.setLocale('uk')

    expect(engine.hasUnpublished.value).toBe(false)
    await expect(engine.publish()).resolves.toBe(true)
    expect(repo.publish).not.toHaveBeenCalled()
  })
})

describe('deleting an entry for good', () => {
  function withRemove(repo: EditorRepository) {
    const remove = vi.fn(async () => undefined)
    return Object.assign(repo, { remove }) as EditorRepository & { remove: ReturnType<typeof vi.fn> }
  }

  it('is offered for a draft and for an entry off the site, not for one on the site', async () => {
    const draft = await engineOf(withRemove(repository({ offSite: false, draft: { title: 'Draft' } })))
    // A published entry with only a draft on top is on the site.
    expect(draft.removable.value).toBe(false)

    const off = await engineOf(withRemove(repository({ offSite: true })))
    expect(off.removable.value).toBe(true)

    const never = withRemove(repository({ offSite: false, draft: { title: 'Draft' } }))
    never.getEditable = vi.fn(async (key: string) => ({
      key, locale: 'en', defaultLocale: 'en', base: null, draft: { title: 'Draft' }, draftUpdatedAt: 'x', published: null, publishedAt: null, media: {}, offSite: false,
    })) as never
    expect((await engineOf(never)).removable.value).toBe(true)
  })

  it('in a translation, follows the original: not while it is on the site', async () => {
    async function translation(repo: EditorRepository) {
      const engine = createEditorEngine({ repository: repo, locale: 'uk', historyLimit: 20 })
      await engine.load('entry-1')
      return engine
    }

    // The translation itself is published; the original is too: on the site.
    expect((await translation(withRemove(repository({ offSite: false })))).removable.value).toBe(false)
    // The original was never published: not on the site, whatever the translation.
    expect((await translation(withRemove(repository({ offSite: false, basePublished: false })))).removable.value).toBe(true)
    // Taken off the site.
    expect((await translation(withRemove(repository({ offSite: true })))).removable.value).toBe(true)
  })

  it('is not offered where the repository cannot delete (a page)', async () => {
    const page = repository({ offSite: true })
    expect((await engineOf(page)).removable.value).toBe(false)
  })

  it('deletes with the lock, leaves nothing unsaved and nothing to release', async () => {
    const repo = withRemove(repository({ offSite: true }))
    const engine = await engineOf(repo)

    await expect(engine.remove()).resolves.toBe(true)
    expect(repo.remove).toHaveBeenCalledWith('entry-1', 'token')
    expect(engine.dirty.value).toBe(false)
    expect(engine.lock.value).toBe('none')
    expect(engine.removable.value).toBe(false)
  })

  it('a refusal (an entry on the site) is kept for the message', async () => {
    const repo = withRemove(repository({ offSite: true }))
    const refusal = new Error('live')
    repo.remove.mockRejectedValueOnce(refusal)
    const engine = await engineOf(repo)

    await expect(engine.remove()).resolves.toBe(false)
    expect(engine.removeError.value).toBe(refusal)
    expect(engine.lock.value).toBe('held')
  })
})

describe('taking an entry off the site from its editor', () => {
  function withTakeOff(repo: EditorRepository) {
    const takeOff = vi.fn(async () => undefined)
    return Object.assign(repo, { takeOff }) as EditorRepository & { takeOff: ReturnType<typeof vi.fn> }
  }

  it('is offered for an entry on the site with nothing newer to publish, instead of Publish', async () => {
    const engine = await engineOf(withTakeOff(repository({ offSite: false })))

    expect(engine.hasUnpublished.value).toBe(false)
    expect(engine.canTakeOff.value).toBe(true)
  })

  it('is not offered with a pending draft (Publish is the action), off the site, or for a page', async () => {
    expect((await engineOf(withTakeOff(repository({ offSite: false, draft: { title: 'Newer' } })))).canTakeOff.value).toBe(false)
    expect((await engineOf(withTakeOff(repository({ offSite: true })))).canTakeOff.value).toBe(false)
    expect((await engineOf(repository({ offSite: false }))).canTakeOff.value).toBe(false)
  })

  it('is not offered in a translation: only the original is taken off', async () => {
    const engine = await engineOf(withTakeOff(repository({ offSite: false })))
    await engine.setLocale('uk')

    expect(engine.canTakeOff.value).toBe(false)
  })

  it('takes it off with the lock, and it is then a draft to the editor, Publish to put it back', async () => {
    const repo = withTakeOff(repository({ offSite: false }))
    const engine = await engineOf(repo)

    await expect(engine.takeOff()).resolves.toBe(true)
    expect(repo.takeOff).toHaveBeenCalledWith('entry-1', 'token')
    expect(engine.offSite.value).toBe(true)
    expect(engine.canTakeOff.value).toBe(false)
    expect(engine.hasUnpublished.value).toBe(true)
  })

  it('a refusal is kept and the entry stays on the site', async () => {
    const repo = withTakeOff(repository({ offSite: false }))
    const refusal = new Error('no')
    repo.takeOff.mockRejectedValueOnce(refusal)
    const engine = await engineOf(repo)

    await expect(engine.takeOff()).resolves.toBe(false)
    expect(engine.takeOffError.value).toBe(refusal)
    expect(engine.offSite.value).toBe(false)
  })
})
