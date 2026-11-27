import { computed, inject, ref, watch, type InjectionKey, type Ref } from 'vue'

/**
 * Set by the entry dialog once Publish was tried: from then on every field
 * shows its issue. Before that a field shows its issue only after it was
 * left, so a new entry does not open full of "Required".
 */
export const FORM_ISSUES_SHOWN: InjectionKey<Ref<boolean>> = Symbol('cms-form-issues-shown')

/**
 * The issue to show: after the field was left, or after a publish attempt.
 * `onLeave` runs on the same `focusout` (the form field ends its edit there).
 */
export function useShownIssue<T>(el: Ref<HTMLElement | null>, issue: Ref<T | null>, onLeave?: () => void) {
  const all = inject(FORM_ISSUES_SHOWN, ref(true))
  const touched = ref(false)

  watch(el, (node, _, onCleanup) => {
    if (!node) {
      return
    }

    const leave = () => {
      touched.value = true
      onLeave?.()
    }

    node.addEventListener('focusout', leave)
    onCleanup(() => node.removeEventListener('focusout', leave))
  }, { immediate: true })

  return computed(() => (touched.value || all.value ? issue.value : null))
}
