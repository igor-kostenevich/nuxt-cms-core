import { onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from '#imports'
import { onSignedOut } from '../data/supabase-auth'

/**
 * Leaves the admin with a full load when the session ends, in this tab or in
 * another one (011, X-8 / X-14): the admin data of a tab (the SSR payload in
 * the DOM, useAsyncData and useState caches) holds personal data of
 * submissions and must not outlive the session. `replace`, so Back does not
 * return to a page that showed them.
 */
export function useAdminSessionEnd() {
  const router = useRouter()
  let stop: (() => void) | undefined

  function leave() {
    window.location.replace(router.resolve('/admin/login').href)
  }

  onMounted(() => {
    stop = onSignedOut(leave)
  })

  onBeforeUnmount(() => stop?.())

  return { leave }
}
