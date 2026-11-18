import { describe, expect, it } from 'vitest'
import { createWriteQueue } from '../app/admin/write-queue'

function deferred() {
  let resolve!: () => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<void>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('writes of the Texts screen (C-89)', () => {
  it('runs writes of one text in order: a later change waits for the earlier one', async () => {
    const queue = createWriteQueue()
    const order: string[] = []
    const first = deferred()

    const a = queue.run('hero.title', async () => {
      await first.promise
      order.push('first')
    })
    const b = queue.run('hero.title', async () => {
      order.push('second')
    })

    await Promise.resolve()
    expect(order).toEqual([])
    first.resolve()
    await Promise.all([a, b])
    expect(order).toEqual(['first', 'second'])
  })

  it('does not hold up writes of other texts', async () => {
    const queue = createWriteQueue()
    const slow = deferred()
    const done: string[] = []

    void queue.run('a', async () => {
      await slow.promise
      done.push('a')
    })
    await queue.run('b', async () => {
      done.push('b')
    })

    expect(done).toEqual(['b'])
    slow.resolve()
  })

  it('settles only when every write has landed, and counts what is pending', async () => {
    const queue = createWriteQueue()
    const slow = deferred()
    let landed = false

    void queue.run('a', async () => {
      await slow.promise
      landed = true
    })
    expect(queue.pending.value).toBe(1)

    const settled = queue.settle()
    await Promise.resolve()
    expect(landed).toBe(false)

    slow.resolve()
    expect(await settled).toBe(true)
    expect(landed).toBe(true)
    expect(queue.pending.value).toBe(0)
  })

  it('reports a text left unsaved, until a later write of it succeeds', async () => {
    const queue = createWriteQueue()

    await queue.run('a', async () => {
      throw new Error('locked')
    }).catch(() => undefined)
    expect(await queue.settle()).toBe(false)

    await queue.run('a', async () => undefined)
    expect(await queue.settle()).toBe(true)
  })

  it('runs a write after a failed one of the same text', async () => {
    const queue = createWriteQueue()
    const ran: string[] = []

    const a = queue.run('a', async () => {
      throw new Error('x')
    })
    const b = queue.run('a', async () => {
      ran.push('b')
    })

    await expect(a).rejects.toThrow('x')
    await b
    expect(ran).toEqual(['b'])
  })
})
