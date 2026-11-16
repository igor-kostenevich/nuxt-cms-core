<script setup lang="ts">
import { provide, shallowReactive, watch } from 'vue'
import { RouterView, viewDepthKey, type RouteLocationNormalizedLoaded } from 'vue-router'
// Nuxt's useRoute() reads this key first. It is internal API: if a Nuxt update
// moves it, client pages in Edit Mode see the /admin/edit route instead of
// their own (MASTER_PLAN C-59).
import { PageRouteSymbol } from '#app/components/injections'
import { CMS_EDITOR } from './context'
import { useEditor } from './inject'

/**
 * Renders a Client Project page for `route` inside Edit Mode (MASTER_PLAN C-22,
 * C-59). The edit page sits at depth 1 of the router; resetting the view depth
 * lets RouterView render the client route from its first matched record, and
 * nested <NuxtPage> inside it continue from there.
 *
 * The editor is handed to the page here, not above the layout: header and
 * footer stay plain code (C-63), and a layout's own useCmsPage reads published
 * content instead of binding the editor.
 */
const props = defineProps<{
  route: RouteLocationNormalizedLoaded
}>()

provide(CMS_EDITOR, useEditor())
provide(viewDepthKey, 0)

// Shallow, like Nuxt's own: route records and components must not become proxies.
const pageRoute = shallowReactive({ ...props.route })
provide(PageRouteSymbol, pageRoute)

// Query and hash change without a remount (same page, same lock).
watch(() => props.route, (route) => {
  Object.assign(pageRoute, route)
})
</script>

<template>
  <RouterView :route="props.route" />
</template>
