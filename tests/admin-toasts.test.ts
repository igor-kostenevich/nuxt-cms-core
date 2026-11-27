import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createToasts } from '../app/admin/toasts'

describe('createToasts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the same message once and gives it its full time again', () => {
    const { toasts, toast } = createToasts()

    const first = toast('Draft saved', { tone: 'success' })
    vi.advanceTimersByTime(4000)
    const second = toast('Draft saved', { tone: 'success' })

    expect(second).toBe(first)
    expect(toasts).toHaveLength(1)

    vi.advanceTimersByTime(4000)
    expect(toasts).toHaveLength(1)

    vi.advanceTimersByTime(1500)
    expect(toasts).toHaveLength(0)
  })

  it('keeps different messages, tones and toasts with an action apart', () => {
    const { toasts, toast } = createToasts()

    toast('Draft saved', { tone: 'success' })
    toast('Issues blocking publish: 1', { tone: 'error' })
    toast('Draft saved', { tone: 'neutral' })
    toast('Archived', { action: { label: 'Undo', run: () => {} } })
    toast('Archived', { action: { label: 'Undo', run: () => {} } })

    expect(toasts.map(item => item.message)).toEqual([
      'Draft saved',
      'Issues blocking publish: 1',
      'Draft saved',
      'Archived',
      'Archived',
    ])
  })

  it('leaves a hovered toast paused when the message repeats', () => {
    const { toasts, toast, pause } = createToasts()

    const id = toast('Draft saved')
    pause(id)
    toast('Draft saved')
    vi.advanceTimersByTime(20_000)

    expect(toasts).toHaveLength(1)
  })
})
