import { describe, expect, it, vi } from 'vitest'
import { ref, shallowRef } from 'vue'
import { createEditorSession } from '../app/editor/session'
import { createEditorUi } from '../app/editor/ui'

// Publish asks first (014 UX): «Changes appear on the site at once», with
// «Don't ask again». The question is the session's, so the toolbar and the
// dialog of Content share it.

function setup(options: { ask?: boolean, issues?: unknown[], readOnly?: boolean, gaps?: () => Promise<{ total: number, items: string[] }> } = {}) {
  const publish = vi.fn(async () => true)
  const save = vi.fn(async () => true)
  const engine = {
    readOnly: ref(options.readOnly ?? false),
    issues: shallowRef(options.issues ?? []),
    endEdit: vi.fn(),
    status: ref('ready'),
    dirty: ref(true),
    save,
    saveStatus: ref('idle'),
    publish,
    publishError: ref(null),
    saveError: ref(null),
    lock: ref('held'),
    fields: new Map(),
    canTakeOff: ref(true),
    takeOff: vi.fn(async () => true),
    takeOffError: ref<unknown>(null),
    removable: ref(true),
    remove: vi.fn(async () => true),
    removeError: ref<unknown>(null),
  }
  const ui = createEditorUi()
  const ask = options.ask === undefined ? undefined : ref(options.ask)
  const session = createEditorSession({
    engine: engine as never,
    view: { select: vi.fn() } as never,
    ui,
    t: key => key,
    navigate: vi.fn(),
    askBeforePublish: ask,
    translationGaps: options.gaps,
  })

  return { session, ui, publish, ask, engine, save }
}

describe('publish confirmation', () => {
  it('does not ask when the preference is not given or off', async () => {
    for (const ask of [undefined, false]) {
      const { session, ui, publish } = setup({ ask })

      await expect(session.publish()).resolves.toBe(true)
      expect(ui.state.dialog).toBeNull()
      expect(publish).toHaveBeenCalledTimes(1)
    }
  })

  it('asks first, and publishes only when confirmed', async () => {
    const { session, ui, publish } = setup({ ask: true })
    const result = session.publish()

    await vi.waitFor(() => expect(ui.state.dialog).not.toBeNull())
    expect(publish).not.toHaveBeenCalled()
    expect(ui.state.dialog).toMatchObject({ title: 'cms.editor.publish.title', checkbox: 'cms.editor.publish.dontAsk', focusCancel: true })

    ui.state.dialog!.resolve('confirm')
    await expect(result).resolves.toBe(true)
    expect(publish).toHaveBeenCalledTimes(1)
  })

  it('cancelling publishes nothing and keeps asking', async () => {
    const { session, ui, publish, ask } = setup({ ask: true })
    const result = session.publish()

    await vi.waitFor(() => expect(ui.state.dialog).not.toBeNull())
    ui.state.dialog!.checked = true
    ui.state.dialog!.resolve('cancel')

    await expect(result).resolves.toBe(false)
    expect(publish).not.toHaveBeenCalled()
    expect(ask?.value).toBe(true)
  })

  it('"Don\'t ask again" turns the question off after the publish it confirmed', async () => {
    const { session, ui, publish, ask } = setup({ ask: true })
    const first = session.publish()

    await vi.waitFor(() => expect(ui.state.dialog).not.toBeNull())
    ui.state.dialog!.checked = true
    ui.state.dialog!.resolve('confirm')
    await first

    expect(ask?.value).toBe(false)

    await session.publish()
    expect(ui.state.dialog).toBeNull()
    expect(publish).toHaveBeenCalledTimes(2)
  })

  it('confirming without the checkbox keeps asking', async () => {
    const { session, ui, ask } = setup({ ask: true })
    const result = session.publish()

    await vi.waitFor(() => expect(ui.state.dialog).not.toBeNull())
    ui.state.dialog!.resolve('confirm')
    await result

    expect(ask?.value).toBe(true)
  })

  it('goes to the first issue before asking', async () => {
    const { session, ui, publish } = setup({ ask: true, issues: [{ fieldId: 'f', key: 'title', kind: 'required', label: 'Title' }] })

    await expect(session.publish()).resolves.toBe(false)
    expect(ui.state.dialog).toBeNull()
    expect(publish).not.toHaveBeenCalled()
  })

  it('a page that became read-only while the question was open is not published', async () => {
    const { session, ui, publish, engine } = setup({ ask: true })
    const result = session.publish()

    await vi.waitFor(() => expect(ui.state.dialog).not.toBeNull())
    engine.readOnly.value = true
    ui.state.dialog!.resolve('confirm')

    await expect(result).resolves.toBe(false)
    expect(publish).not.toHaveBeenCalled()
  })
})

describe('publish confirmation: translations', () => {
  it('names the languages that lack translated texts', async () => {
    const { session, ui } = setup({ ask: true, gaps: async () => ({ total: 4, items: ['Ukrainian (3 fields)', 'German (1 field)'] }) })
    const result = session.publish()

    await vi.waitFor(() => expect(ui.state.dialog).not.toBeNull())
    expect(ui.state.dialog!.notice).toBe('cms.editor.publish.untranslated')
    ui.state.dialog!.resolve('confirm')
    await result
  })

  it('no notice when nothing is missing', async () => {
    const { session, ui } = setup({ ask: true, gaps: async () => ({ total: 4, items: [] }) })
    const result = session.publish()

    await vi.waitFor(() => expect(ui.state.dialog).not.toBeNull())
    expect(ui.state.dialog!.notice).toBeUndefined()
    ui.state.dialog!.resolve('confirm')
    await result
  })

  it('more than three languages are counted, not listed in the line, and listed on request', async () => {
    const items = ['A (1 field)', 'B (1 field)', 'C (1 field)', 'D (2 fields)', 'E (1 field)']
    const { session, ui } = setup({ ask: true, gaps: async () => ({ total: 10, items }) })
    const result = session.publish()

    await vi.waitFor(() => expect(ui.state.dialog).not.toBeNull())
    expect(ui.state.dialog!.notice).toBe('cms.editor.publish.untranslatedMany')
    expect(ui.state.dialog!.noticeItems).toEqual(items)
    ui.state.dialog!.resolve('confirm')
    await result
  })

  it('up to three languages are named in the line itself, with no folded list', async () => {
    const { session, ui } = setup({ ask: true, gaps: async () => ({ total: 10, items: ['A (1 field)', 'B (1 field)', 'C (1 field)'] }) })
    const result = session.publish()

    await vi.waitFor(() => expect(ui.state.dialog).not.toBeNull())
    expect(ui.state.dialog!.notice).toBe('cms.editor.publish.untranslated')
    expect(ui.state.dialog!.noticeItems).toBeUndefined()
    ui.state.dialog!.resolve('confirm')
    await result
  })

  it('the toast after Publish only counts when there are many', async () => {
    const { session } = setup({ ask: false, gaps: async () => ({ total: 10, items: ['A (1)', 'B (1)', 'C (1)', 'D (1)'] }) })

    await session.publish()
    expect(session.publishedText.value).toBe('cms.editor.toasts.publishedUntranslatedMany')
  })

  it('a failed check does not stop the question or the publish', async () => {
    const { session, ui, publish } = setup({ ask: true, gaps: async () => { throw new Error('boom') } })
    const result = session.publish()

    await vi.waitFor(() => expect(ui.state.dialog).not.toBeNull())
    expect(ui.state.dialog!.notice).toBeUndefined()
    ui.state.dialog!.resolve('confirm')

    await expect(result).resolves.toBe(true)
    expect(publish).toHaveBeenCalledTimes(1)
  })

  it('when the question is off, the untranslated languages are named in the toast after Publish', async () => {
    const { session, ui } = setup({ ask: false, gaps: async () => ({ total: 4, items: ['Ukrainian (3 fields)'] }) })

    await expect(session.publish()).resolves.toBe(true)
    expect(ui.state.dialog).toBeNull()
    expect(session.publishedText.value).toBe('cms.editor.toasts.publishedUntranslated')
    expect(ui.toasts.some(toast => toast.message === 'cms.editor.toasts.publishedUntranslated')).toBe(true)
  })

  it('the plain toast when nothing is missing or the check fails', async () => {
    for (const gaps of [async () => ({ total: 4, items: [] }), async () => { throw new Error('boom') }]) {
      const { session } = setup({ ask: false, gaps })

      await session.publish()
      expect(session.publishedText.value).toBe('cms.editor.toasts.published')
    }
  })

  it('a publish that was asked about does not repeat the languages in its toast', async () => {
    const { session, ui } = setup({ ask: true, gaps: async () => ({ total: 4, items: ['Ukrainian (3 fields)'] }) })
    const result = session.publish()

    await vi.waitFor(() => expect(ui.state.dialog).not.toBeNull())
    ui.state.dialog!.resolve('confirm')
    await result

    expect(session.publishedText.value).toBe('cms.editor.toasts.published')
  })
})

describe('saving a draft', () => {
  const issue = (kind: string) => ({ fieldId: 'f', key: 'author', kind, label: 'Author' })

  it('stores an unfinished draft: an empty required field does not block it', async () => {
    const { session, save } = setup({ issues: [issue('required')] })

    await expect(session.save()).resolves.toBe(true)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('a quiet save says nothing when it succeeds, a normal one does', async () => {
    const quiet = setup({})
    await expect(quiet.session.save({ quiet: true })).resolves.toBe(true)
    expect(quiet.ui.toasts).toHaveLength(0)

    const loud = setup({})
    await expect(loud.session.save()).resolves.toBe(true)
    expect(loud.ui.toasts.some(toast => toast.message === 'cms.editor.toasts.saved')).toBe(true)
  })

  it('does not store a wrong value: over the limit, bad format, out of range, unknown option', async () => {
    for (const kind of ['maxLength', 'format', 'range', 'option']) {
      const { session, save, ui } = setup({ issues: [issue(kind)] })

      await expect(session.save()).resolves.toBe(false)
      expect(save).not.toHaveBeenCalled()
      expect(ui.toasts.some(toast => toast.message === 'cms.editor.status.saveIssues')).toBe(true)
    }
  })
})

describe('deleting for good', () => {
  it('asks first, destructively, and deletes only when confirmed', async () => {
    const { session, ui, engine } = setup({})
    const result = session.remove('Spam')

    await vi.waitFor(() => expect(ui.state.dialog).not.toBeNull())
    expect(ui.state.dialog).toMatchObject({ title: 'cms.editor.remove.title', destructive: true })
    expect(engine.remove).not.toHaveBeenCalled()

    ui.state.dialog!.resolve('confirm')
    await expect(result).resolves.toBe(true)
    expect(engine.remove).toHaveBeenCalledTimes(1)
  })

  it('cancelling deletes nothing', async () => {
    const { session, ui, engine } = setup({})
    const result = session.remove('Spam')

    await vi.waitFor(() => expect(ui.state.dialog).not.toBeNull())
    ui.state.dialog!.resolve('cancel')

    await expect(result).resolves.toBe(false)
    expect(engine.remove).not.toHaveBeenCalled()
  })

  it('does not even ask when the entry cannot be deleted from here', async () => {
    const { session, ui, engine } = setup({})
    engine.removable.value = false

    await expect(session.remove('Spam')).resolves.toBe(false)
    expect(ui.state.dialog).toBeNull()
  })

  it('says so when the server refuses', async () => {
    const { session, ui, engine } = setup({})
    engine.remove.mockResolvedValueOnce(false)
    const result = session.remove('Spam')

    await vi.waitFor(() => expect(ui.state.dialog).not.toBeNull())
    ui.state.dialog!.resolve('confirm')

    await expect(result).resolves.toBe(false)
    expect(ui.toasts.some(toast => toast.tone === 'error' && toast.message.startsWith('cms.editor.remove.failed'))).toBe(true)
  })
})

describe('taking off the site', () => {
  it('takes the entry off and says nothing itself on success (the host does)', async () => {
    const { session, engine } = setup({})

    await expect(session.takeOff()).resolves.toBe(true)
    expect(engine.takeOff).toHaveBeenCalledTimes(1)
  })

  it('does nothing where it is not offered', async () => {
    const { session, engine } = setup({})
    engine.canTakeOff.value = false

    await expect(session.takeOff()).resolves.toBe(false)
    expect(engine.takeOff).not.toHaveBeenCalled()
  })

  it('says so when it fails', async () => {
    const { session, ui, engine } = setup({})
    engine.takeOff.mockResolvedValueOnce(false)

    await expect(session.takeOff()).resolves.toBe(false)
    expect(ui.toasts.some(toast => toast.tone === 'error' && toast.message.startsWith('cms.editor.takeOff.failed'))).toBe(true)
  })
})
