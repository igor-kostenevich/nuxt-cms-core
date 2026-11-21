import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runFormSubmittedHook, type CmsFormSubmittedCaller } from '../server/cms/form-submit'

// cms:forms:submitted (C-97): the dispatch of the route, without Nitro. The
// hook is replaced by a list of handlers called through the same caller
// interface hookable's callHookWith uses.

type Handler = (...args: unknown[]) => unknown

const context = Object.freeze({ submissionId: 's1', values: Object.freeze({ email: 'visitor@example.test', message: 'secret plan' }) })

function hookOf(handlers: Handler[]) {
  return (caller: CmsFormSubmittedCaller) => caller(handlers, [context])
}

let errors: ReturnType<typeof vi.spyOn>
let warnings: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function logged(): string {
  return [...errors.mock.calls, ...warnings.mock.calls].flat().join('\n')
}

describe('runFormSubmittedHook', () => {
  it('passes the frozen context to every handler', async () => {
    const received: unknown[] = []
    await runFormSubmittedHook(hookOf([ctx => received.push(ctx), ctx => received.push(ctx)]), 'contact')

    expect(received).toEqual([context, context])
    expect(Object.isFrozen(received[0])).toBe(true)
    expect(errors).not.toHaveBeenCalled()
  })

  it('resolves at once without handlers', async () => {
    vi.useFakeTimers()
    await runFormSubmittedHook(hookOf([]), 'contact')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('isolates a synchronous throw and an async rejection; the others still run', async () => {
    const ran: string[] = []
    await expect(runFormSubmittedHook(hookOf([
      () => {
        throw new TypeError('visitor@example.test is broken')
      },
      async () => {
        throw new Error('secret plan')
      },
      async () => {
        ran.push('third')
      },
    ]), 'contact')).resolves.toBeUndefined()

    expect(ran).toEqual(['third'])
    expect(errors).toHaveBeenCalledTimes(2)
    expect(logged()).toContain('handler 1 failed for form "contact" (TypeError)')
    expect(logged()).toContain('handler 2 failed for form "contact" (Error)')
  })

  it('never logs values or error messages', async () => {
    await runFormSubmittedHook(hookOf([
      () => {
        throw new Error('visitor@example.test: secret plan')
      },
      () => {
        // A non-Error with a value in its "name".
        throw { name: 'visitor@example.test' }
      },
    ]), 'contact')

    expect(logged()).not.toContain('visitor@example.test')
    expect(logged()).not.toContain('secret plan')
  })

  it('logs a failing handler at once while another one hangs, and stops waiting at the limit', async () => {
    vi.useFakeTimers()
    let settled = false
    const run = runFormSubmittedHook(hookOf([
      async () => {
        throw new Error('down')
      },
      () => new Promise(() => undefined),
    ]), 'contact', 3000).then(() => {
      settled = true
    })

    // The failure is in the log before the limit, though the second handler hangs.
    await vi.advanceTimersByTimeAsync(0)
    expect(errors).toHaveBeenCalledTimes(1)
    expect(logged()).toContain('handler 1 failed for form "contact"')
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(2999)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await run
    expect(settled).toBe(true)
    expect(logged()).toContain('did not finish within 3000 ms')
    // The timer is cleared, nothing is left scheduled.
    expect(vi.getTimerCount()).toBe(0)
  })

  it('logs the failure of a handler that ends after the limit', async () => {
    vi.useFakeTimers()
    await Promise.all([
      runFormSubmittedHook(hookOf([
        () => new Promise((_resolve, reject) => setTimeout(() => reject(new RangeError('late')), 5000)),
      ]), 'contact', 3000),
      vi.advanceTimersByTimeAsync(3000),
    ])
    expect(errors).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2000)
    expect(logged()).toContain('handler 1 failed for form "contact" (RangeError)')
  })

  it('does not wait the limit when the handlers finish first, and clears the timer', async () => {
    vi.useFakeTimers()
    const run = runFormSubmittedHook(hookOf([() => new Promise(resolve => setTimeout(resolve, 500))]), 'contact', 3000)
    await vi.advanceTimersByTimeAsync(500)
    await run
    expect(warnings).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('never throws when the dispatch itself fails (building the context, the hook system)', async () => {
    await expect(runFormSubmittedHook(() => {
      throw new Error('visitor@example.test')
    }, 'contact')).resolves.toBeUndefined()
    await expect(runFormSubmittedHook(() => Promise.reject(new Error('boom')), 'contact')).resolves.toBeUndefined()

    expect(errors).toHaveBeenCalledTimes(2)
    expect(logged()).toContain('could not run for form "contact"')
    expect(logged()).not.toContain('visitor@example.test')
  })
})
