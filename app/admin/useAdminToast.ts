import { useNuxtApp } from '#imports'
import { createToasts, type CmsToasts } from './toasts'

const stores = new WeakMap<object, CmsToasts>()

/**
 * Toasts of the admin: one stack per app, rendered by AdminToasts in the
 * shell. Use them for outcomes of actions that apply at once (a toggle, a
 * reorder), so the page does not shift under the pointer. Messages that
 * describe the state of a screen stay inline (AdminAlert).
 */
export function useAdminToast(): CmsToasts {
  const nuxtApp = useNuxtApp()
  let store = stores.get(nuxtApp)

  if (!store) {
    store = createToasts()
    stores.set(nuxtApp, store)
  }

  return store
}
