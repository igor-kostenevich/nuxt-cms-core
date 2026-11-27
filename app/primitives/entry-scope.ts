import { defineComponent, provide, type PropType } from 'vue'
import { CMS_EDITOR } from '../editor/context'
import type { CmsEntry } from '../types/entries'
import { provideCmsMedia } from './media'

/**
 * One entry rendered by <CmsEntries> (014 §7): its own boundary. Inside it,
 * primitives show the entry's data and resolve its media; in Edit Mode of the
 * page they stay read-only, since the entry is not the page's document.
 */
export const CmsEntryScope = defineComponent({
  name: 'CmsEntryScope',
  props: { entry: { type: Object as PropType<CmsEntry>, required: true } },
  setup(scope, { slots }) {
    provide(CMS_EDITOR, null)
    provideCmsMedia(() => scope.entry.media)
    return () => slots.default?.()
  },
})
