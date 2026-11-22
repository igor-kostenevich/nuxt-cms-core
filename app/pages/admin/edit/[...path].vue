<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { loadRouteLocation, type RouteLocationNormalizedLoaded } from 'vue-router'
import EditorRoot from '../../../editor/EditorRoot.vue'
import EditedRoute from '../../../editor/EditedRoute.vue'
import { pageTitle } from '../../../editor/page-title'
import { useAdminI18n } from '../../../admin/useAdminI18n'
import { isAdminPath } from '../../../auth/paths'

/**
 * Edit Mode (MASTER_PLAN C-22, C-59): `/admin/edit/about` renders the Client
 * Project's own `/about` page with its layout, inside the editor frame.
 * Client-only (route rule `ssr: false`): Draft, the lock and the editor need the
 * browser session, and the page must never be cached.
 */
definePageMeta({
  layout: false,
  middleware: ['cms-auth'],
})

const { t } = useAdminI18n()
const route = useRoute()
const router = useRouter()

const targetPath = computed(() => {
  const raw = route.params.path
  const parts = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter(Boolean)
  return `/${parts.join('/')}`
})

const target = shallowRef<RouteLocationNormalizedLoaded | null>(null)
const missing = shallowRef(false)

// Path, query and hash: a query change re-resolves the route without
// remounting the editor (EditorRoot is keyed by the path only).
watch([targetPath, () => route.query, () => route.hash], async ([path]) => {
  const resolved = router.resolve({ path, query: route.query, hash: route.hash })
  const page = resolved.matched.at(-1)

  // The matched records decide, not the typed path: the router matches
  // `/ADMIN/settings` to `/admin/settings`, and an admin page (or this editor
  // itself) must never render as a client page here.
  const admin = isAdminPath(path) || resolved.matched.some(record => isAdminPath(record.path))

  if (resolved.matched.length === 0 || admin || !page?.components?.default) {
    missing.value = true
    target.value = null
    return
  }

  missing.value = false
  await loadRouteLocation(resolved)
  target.value = resolved as RouteLocationNormalizedLoaded
}, { immediate: true })

const layout = computed(() => {
  const name = target.value?.meta.layout
  return name === false ? false : (typeof name === 'string' ? name : 'default')
})

const title = computed(() => target.value
  ? pageTitle(target.value, t('cms.editor.pages.home'))
  : targetPath.value)

useHead({ title: computed(() => t('cms.editor.documentTitle', { page: title.value })) })
</script>

<template>
  <AdminRoot v-if="missing">
    <main class="edit-missing">
      <h1 class="edit-missing__title">
        {{ t('cms.editor.load.notFound', { path: targetPath }) }}
      </h1>
      <AdminButton
        variant="primary"
        to="/admin"
      >
        {{ t('cms.editor.load.back') }}
      </AdminButton>
    </main>
  </AdminRoot>
  <EditorRoot
    v-else-if="target"
    :key="targetPath"
    :path="targetPath"
    :title="title"
  >
    <Suspense>
      <!-- `false` renders the page without a layout, as definePageMeta({ layout: false }). -->
      <NuxtLayout :name="layout">
        <EditedRoute :route="target" />
      </NuxtLayout>
    </Suspense>
  </EditorRoot>
</template>

<style scoped>
.edit-missing {
  display: grid;
  gap: var(--cms-space-4);
  justify-items: start;
  max-width: 560px;
  padding: var(--cms-space-16) var(--cms-space-6);
}

.edit-missing__title {
  margin: 0;
  font-size: var(--cms-type-h1-size);
  font-weight: var(--cms-type-h1-weight);
  line-height: var(--cms-type-h1-line);
}
</style>
