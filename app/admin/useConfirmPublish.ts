import { useLocalStorage } from '@vueuse/core'

/** Where the preference lives: this browser, like the admin's language. */
export const CONFIRM_PUBLISH_KEY = 'cms-admin:confirm-publish'

/**
 * Whether Publish asks first («Changes appear on the site at once»). On by
 * default; «Don't ask again» in the dialog turns it off, Settings → Editing
 * turns it back on. A preference of the person in this browser, not a setting
 * of the site, so it needs no permission and no database. Without storage
 * (a private window) it lasts until the page is reloaded.
 */
export function useConfirmPublish() {
  const askBeforePublish = useLocalStorage<boolean>(CONFIRM_PUBLISH_KEY, true, {
    initOnMounted: true,
    // Corrupt or foreign values read as the default: ask.
    serializer: {
      read: value => value !== 'false',
      write: value => (value ? 'true' : 'false'),
    },
    onError: () => {},
  })

  return { askBeforePublish }
}
