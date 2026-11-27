<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { loadRouteLocation, type RouteLocationNormalizedLoaded } from 'vue-router'
import { findTypeRoutes, routePattern } from '../../../../src/content-route'
import EditorRoot from '../../../editor/EditorRoot.vue'
import EditedRoute from '../../../editor/EditedRoute.vue'
import { useEditorEntries } from '../../../editor/entries'
import { editSlugOf, routePrefix, typeOfPath } from '../../../editor/entry-route'
import { pageTitle } from '../../../editor/page-title'
import { useAdminI18n } from '../../../admin/useAdminI18n'
import { pageTypes as declaredPageTypes } from '../../../admin/useAdminPages'
import { isAdminPath } from '../../../auth/paths'

/**
 * Edit Mode (MASTER_PLAN C-22, C-59): `/admin/edit/about` renders the Client
 * Project's own `/about` page with its layout, inside the editor frame.
 * Client-only (route rule `ssr: false`): Draft, the lock and the editor need the
 * browser session, and the page must never be cached.
 *
 * An entry of a type with a route (014 §5) is opened by its id:
 * `/admin/edit/blog/my-post?entry=<id>`. The id is the identity of the
 * session; the path follows the entry (a stale slug is replaced), and the
 * route is found by the route record of the type, not by the path, so a draft
 * slug equal to a static neighbour (`archive`) still opens the entry.
 */
definePageMeta({
  layout: false,
  middleware: ['cms-auth'],
  // One editing session per document. Nuxt keys a catch-all page by its path,
  // so a new slug would remount this page and the editor (a new Engine, the
  // lock taken again); an entry keys it by its id instead.
  key: route => (typeof route.query.entry === 'string' && route.query.entry
    ? `cms-edit-entry:${route.query.entry}`
    : route.path),
})

const { t } = useAdminI18n()
const route = useRoute()
const router = useRouter()
const entries = useEditorEntries()
const pageTypes = declaredPageTypes()

const targetPath = computed(() => {
  const raw = route.params.path
  const parts = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter(Boolean)
  return `/${parts.join('/')}`
})

const target = shallowRef<RouteLocationNormalizedLoaded | null>(null)
const missing = shallowRef(false)
/** The entry this session edits; kept as one object while the id stays. */
const opened = shallowRef<{ id: string, type: string, prefix: string, requireSlug: boolean, title: string | null } | null>(null)

function queryText(name: string): string | null {
  const value = route.query[name]
  return typeof value === 'string' && value ? value : null
}

/**
 * The route to render for an entry, 'redirected' when the URL was replaced
 * (canonical path, or `?entry` found by a published address), null when there
 * is no such entry, undefined when the path is not an entry route at all.
 */
async function resolveEntry(path: string): Promise<RouteLocationNormalizedLoaded | 'redirected' | null | undefined> {
  const id = queryText('entry')
  const locale = queryText('locale')
  const type = typeOfPath(path, pageTypes)

  if (!id) {
    const matched = router.resolve({ path }).matched.at(-1)

    // Not an entry route (a static page, a static neighbour like /blog/archive).
    if (!type || !matched || routePattern(matched.path) !== type.route) {
      return undefined
    }

    // A link of the site: published addresses only (drafts are not unique yet).
    const found = await entries.findBySlug(type.key, locale, path.slice(routePrefix(type.route).length))

    if (!found) {
      return null
    }

    await router.replace({ path: route.path, query: { ...route.query, entry: found }, hash: route.hash })
    return 'redirected'
  }

  if (!type) {
    return null
  }

  const editable = await entries.editable(type.key, id, locale)

  if (!editable) {
    return null
  }

  const slug = editSlugOf(editable)
  const prefix = routePrefix(type.route)

  if (slug && `${prefix}${slug}` !== path) {
    await router.replace({ path: `/admin/edit${prefix}${slug}`, query: route.query, hash: route.hash })
    return 'redirected'
  }

  const record = findTypeRoutes(router.getRoutes(), type.route)[0]

  if (!record?.name) {
    return null
  }

  const stored = editable.draft?.title ?? editable.published?.title ?? editable.base?.title
  const title = typeof stored === 'string' ? stored : undefined
  opened.value = opened.value?.id === id
    ? { ...opened.value, title: title ?? opened.value.title }
    : { id, type: type.key, prefix, requireSlug: true, title: title ?? null }

  const resolved = router.resolve({
    name: record.name,
    params: { slug: slug ?? path.slice(prefix.length) },
    query: route.query,
    hash: route.hash,
  })
  await loadRouteLocation(resolved)
  return resolved as RouteLocationNormalizedLoaded
}

// Path, query and hash: a query change re-resolves the route without
// remounting the editor (EditorRoot is keyed by the path, or by the entry id).
watch([targetPath, () => route.query, () => route.hash], async ([path]) => {
  const entry = await resolveEntry(path)

  if (entry === 'redirected') {
    return
  }

  if (entry !== undefined) {
    missing.value = entry === null
    target.value = entry

    if (entry === null) {
      opened.value = null
    }

    return
  }

  opened.value = null
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

const title = computed(() => {
  if (opened.value) {
    return opened.value.title ?? t('cms.editor.pages.untitled')
  }

  return target.value
    ? pageTitle(target.value, t('cms.editor.pages.home'))
    : targetPath.value
})

/** One session per document: the entry id, else the page path. */
const sessionKey = computed(() => (opened.value ? `entry:${opened.value.id}` : targetPath.value))

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
    :key="sessionKey"
    :path="targetPath"
    :title="title"
    :entry="opened"
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
