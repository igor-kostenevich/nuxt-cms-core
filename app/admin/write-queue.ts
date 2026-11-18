import { readonly, ref } from 'vue'

/**
 * Writes of the Texts screen (C-89), one queue per text. A text saves on
 * blur; a second change of the same text waits for the first, so they land in
 * the order they were made. Publishing calls `settle` first: it waits for
 * every write in flight and says whether any text failed to save, so a
 * publish never goes out without a change the editor just made.
 */
export function createWriteQueue() {
  const tails = new Map<string, Promise<unknown>>()
  const inFlight = new Set<Promise<unknown>>()
  /** Texts whose last write failed: their change is not saved. */
  const failed = new Set<string>()
  const pending = ref(0)

  function run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = tails.get(key) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(task)

    pending.value++
    tails.set(key, next)
    inFlight.add(next)

    next.then(
      () => failed.delete(key),
      () => failed.add(key),
    ).finally(() => {
      inFlight.delete(next)
      pending.value--

      if (tails.get(key) === next) {
        tails.delete(key)
      }
    })

    return next
  }

  /** Waits for every write; false when a text is left unsaved. */
  async function settle(): Promise<boolean> {
    while (inFlight.size > 0) {
      await Promise.allSettled([...inFlight])
    }

    return failed.size === 0
  }

  return { run, settle, pending: readonly(pending) }
}
