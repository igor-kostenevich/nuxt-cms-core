<script setup lang="ts">
import '../assets/admin/admin.css'
import './editor.css'
import { computed, onBeforeUnmount, onMounted, provide, ref, useTemplateRef, watch } from 'vue'
import { until, useDebounceFn, useEventListener, useResizeObserver } from '@vueuse/core'
import { cmsConfig } from '#cms/config'
import { cmsContent } from '#cms/content'
import { useAdminI18n } from '../admin/useAdminI18n'
import { createDocumentRepository } from './document-repository'
import { exitTarget, rememberExitFrom } from './exit'
import { takePublishOnOpen } from './entry-route'
import { useCmsLocaleState } from '../primitives/locale'
import type { CmsPage } from '../types/pages'
import type { CmsEntry } from '../types/entries'
import type { CmsEditorEntryBinding, CmsEditorPageBinding } from './context'
import { registryEntries } from './engine'
import { EDITOR_LOCALE } from './session'
import { editorShortcut, useEditorHost, type EditorHostCore } from './host'
import EditorToolbar from './EditorToolbar.vue'
import OverlayLayer from './OverlayLayer.vue'
import LockBanner from './LockBanner.vue'
import LocaleBanner from './LocaleBanner.vue'
import EditorToasts from './EditorToasts.vue'
import EditorDialog from './EditorDialog.vue'
import HistoryPanel from './HistoryPanel.vue'
import EntryAddressBar from './EntryAddressBar.vue'
// Bundled with the editor so primitives switch to the editable branch without
// a second round trip (their own import() resolves to this chunk).
import './fields/EditableText.vue'


const props = defineProps<{
  /** Path of the edited page on the public site, e.g. `/about`. */
  path: string
  title: string
  /**
   * The entry this session edits (014), opened by its id: the identity of the
   * session. Its address follows it; the parent keys this component by the id,
   * so a new slug does not start a new session (nor take the lock again).
   */
  entry?: { id: string, type: string, prefix: string, requireSlug: boolean } | null
}>()

const { t, locale: adminLocale } = useAdminI18n()
const route = useRoute()
const router = useRouter()

/** Publish on open waits this long after the fields are on screen: the rest of the page registers its fields. */
const PUBLISH_SETTLE_MS = 400

/** The edited locale is in the URL (`?locale=en`); none: the default locale. */
function queryLocale(): string | null {
  const value = route.query.locale
  return typeof value === 'string' && value ? value : null
}

// Exit goes back to the admin screen Edit Mode was opened from.
if (import.meta.client) {
  rememberExitFrom(window.history.state?.back)
}

const documents = createDocumentRepository({ bootstrapLocale: cmsConfig.defaultLocale })
const repository = documents.repository
const { engine, view, session } = useEditorHost({
  repository,
  locale: queryLocale(),
  t,
  navigate: to => navigateTo(to),
  exitTo: exitTarget,
  bindPage,
  bindEntry,
})

// ── Page binding ──────────────────────────────────────────────────────

/**
 * The first useCmsPage inside the edited page binds the Engine (C-60). Any
 * other key on the same page gets null: useCmsPage then reads it like the
 * public site, read-only.
 */
function bindPage({ engine }: EditorHostCore, key: string): CmsEditorPageBinding | null {
  const bound = engine.entity.value

  // Opened for an entry: the entry is what this session edits; a page key on
  // the same route reads like the public site.
  if (props.entry) {
    return null
  }

  if (bound && bound.key !== key) {
    if (import.meta.dev) {
      console.warn(`[cms] Edit Mode edits "${bound.key}"; "${key}" on the same page is shown read-only.`)
    }

    return null
  }

  if (!bound) {
    void engine.load(key)
  }

  const page = computed<CmsPage | null>(() => engine.status.value === 'ready'
    ? {
        key,
        locale: engine.locale.value ?? '',
        content: engine.document.value,
        publishedAt: engine.publishedAt.value ?? '',
        media: engine.media.value,
        defaultLocale: engine.defaultLocale.value ?? '',
        // The editor shows the locale being edited, translated or not.
        translated: true,
        locales: [],
      }
    : null)
  const pending = computed(() => engine.status.value === 'loading' || engine.status.value === 'idle')
  const error = computed(() => (engine.loadError.value as Error | null) ?? null)

  return {
    page,
    pending,
    error,
    // Re-reads content; the lock and unsaved changes stay.
    refresh: () => engine.reload(),
    ready: until(pending).toBe(false).then(() => undefined),
  }
}

// ── Entry binding (014) ───────────────────────────────────────────────

/**
 * useCmsEntry of the entry this session was opened for binds the Engine to it
 * (by id, whatever slug the route has). Another type, or an entry while
 * another document is bound: null, read like the public site.
 */
function bindEntry({ engine }: EditorHostCore, type: string): CmsEditorEntryBinding | null {
  const opened = props.entry

  if (!opened || opened.type !== type) {
    return null
  }

  const bound = engine.entity.value

  if (bound && bound.key !== opened.id) {
    return null
  }

  if (!bound) {
    documents.edit({ kind: 'entry', type, requireSlug: opened.requireSlug })
    void engine.load(opened.id)
  }

  const entry = computed<CmsEntry | null>(() => {
    if (engine.status.value !== 'ready') {
      return null
    }

    const slug = engine.get('slug')

    return {
      id: opened.id,
      type,
      locale: engine.locale.value ?? '',
      defaultLocale: engine.defaultLocale.value ?? '',
      content: engine.document.value,
      publishedAt: engine.publishedAt.value ?? '',
      firstPublishedAt: null,
      media: engine.media.value,
      // The editor shows the locale being edited, translated or not.
      translated: true,
      slug: typeof slug === 'string' ? slug : null,
      slugs: {},
    }
  })
  const pending = computed(() => engine.status.value === 'loading' || engine.status.value === 'idle')
  const error = computed(() => (engine.loadError.value as Error | null) ?? null)

  return {
    entry,
    pending,
    error,
    refresh: () => engine.reload(),
    ready: until(pending).toBe(false).then(() => undefined),
  }
}

/** Static pages next to the route of the edited entry's type: addresses no entry can take. */
const reserved = computed(() => cmsContent.types.find(type => type.key === props.entry?.type)?.reserved ?? [])

// The address follows the entry: once a new slug is saved (or published, or
// restored), the path becomes the new one, with the same `?entry`. Unsaved
// typing does not move the path.
watch(
  () => [engine.draftSavedAt.value, engine.publishedAt.value, engine.hasDraft.value, engine.locale.value, engine.dirty.value] as const,
  () => {
    const opened = props.entry
    const slug = engine.get('slug')

    if (!opened || engine.dirty.value || engine.status.value !== 'ready' || typeof slug !== 'string' || !slug) {
      return
    }

    const target = `${opened.prefix}${slug}`

    if (target !== props.path) {
      void router.replace({ path: `/admin/edit${target}`, query: route.query, hash: route.hash })
    }
  },
)

// The host provides the context to the editor UI; EditedRoute hands the same
// context to the edited page.

// ── Locale ────────────────────────────────────────────────────────────

// The Client's own UI reads the locale through useCmsLocale(): in Edit Mode it
// is the edited one. Client route middleware does not run here (C-59).
const cmsLocale = useCmsLocaleState()
const localeBefore = cmsLocale.value

watch(engine.locale, (next) => {
  cmsLocale.value = next
}, { immediate: true })

onBeforeUnmount(() => {
  cmsLocale.value = localeBefore
})

// The language switcher changes `?locale=`; Back / Forward too. The route
// guard below has asked about unsaved changes by then.
watch(() => route.query.locale, () => {
  const next = queryLocale() ?? engine.defaultLocale.value

  if (next && next !== engine.locale.value) {
    void engine.setLocale(next)
  }
})

/** Opens the page in another locale; the default locale has no `?locale=`. */
function switchLocale(code: string) {
  const query = { ...route.query }

  if (code === engine.defaultLocale.value) {
    delete query.locale
  } else {
    query.locale = code
  }

  return router.push({ query, hash: route.hash })
}

provide(EDITOR_LOCALE, { switchLocale })

// ── Field registry (C-84) ─────────────────────────────────────────────

// Once the page settles, its translatable fields and their texts from code are
// recorded, so the Texts screen knows texts nobody has stored yet. Best effort:
// a failure only leaves the registry as it was.

const registerFields = useDebounceFn(() => {
  const key = engine.entity.value?.key

  // In a translation the fields show translated texts: only the default
  // language records what the page says.
  if (!key || engine.status.value !== 'ready' || engine.translating.value) {
    return
  }

  const { fields, hiddenPrefixes } = registryEntries(engine.fields.values())
  void repository.registerFields(key, props.path, fields, hiddenPrefixes).catch(() => undefined)
}, 2000)

watch(() => [engine.status.value, engine.fields.size], () => {
  if (engine.status.value === 'ready') {
    void registerFields()
  }
})

// ── Opening a field from the Texts screen ─────────────────────────────

// `?field=hero.title`: once the page is ready, that field is selected and
// scrolled to. Done once per load; the query stays for a reload.
let fieldOpened = false

watch(() => [engine.status.value, engine.fields.size] as const, async ([status]) => {
  const target = route.query.field

  if (fieldOpened || status !== 'ready' || typeof target !== 'string') {
    return
  }

  const field = [...engine.fields.values()].find(item => item.key === target)

  if (field) {
    fieldOpened = true
    await new Promise(resolve => setTimeout(resolve, 300))
    session.focusIssue(field.id)
  }
})

// ── Opening a publication from Activity ───────────────────────────────

// `?history=<revision id>`: once the page is ready, History opens with that
// publication marked. The panel checks that it belongs to this page and
// locale. Done once per load; the query stays for a reload.
let historyOpened = false

watch(() => engine.status.value, (status) => {
  const target = route.query.history

  if (historyOpened || status !== 'ready' || typeof target !== 'string' || !target) {
    return
  }

  historyOpened = true
  session.historyTarget.value = target
  session.historyOpen.value = true
}, { immediate: true })

// Publish in a list of entries (the history state of that navigation, never the
// address: see `publishOnOpenState`): once the page is ready and its fields are
// on screen, Publish is tried as if the toolbar's was pressed: the checks of the
// page, the question. The state is taken at once, so a reload does not ask again.
const publishAsked = props.entry ? takePublishOnOpen(props.entry.id) : false
const stopPublishAsk = watch(() => publishAsked && engine.status.value === 'ready' && engine.fields.size > 0, async (go) => {
  if (!go) {
    return
  }

  stopPublishAsk()
  // Fields register as the page renders: let the rest of it settle.
  await new Promise(resolve => setTimeout(resolve, PUBLISH_SETTLE_MS))

  if (!engine.readOnly.value) {
    void session.publish()
  }
}, { immediate: true })

// The page renders before it is bound: it calls useCmsPage during setup.
// A page without useCmsPage has no CMS content and stays read-only.
const mounted = ref(false)
const unbound = computed(() => mounted.value && !engine.entity.value)
const loading = computed(() => !unbound.value && engine.status.value !== 'ready' && engine.status.value !== 'error')

onMounted(() => {
  mounted.value = true
})

// ── Leaving ───────────────────────────────────────────────────────────

// The host keeps the lock alive and releases it. Back / forward buttons and links outside the toolbar. Navigation through
// goTo() asked already, so the Engine is clean by then and this passes.
onBeforeRouteLeave(() => session.confirmLeave())
// The same document in the same locale is no leave: a query change, or a new
// address of the same entry (`?entry` stays).
onBeforeRouteUpdate((to, from) => (to.query.locale === from.query.locale
  && (to.path === from.path || (props.entry != null && to.query.entry === props.entry.id)))
  || session.confirmLeave())

// ── Preview: links stay inside Edit Mode ──────────────────────────────

// In Preview the Overlay is gone, but a link must not leave for the public
// site: that shows Published, not the Draft being previewed.
useEventListener(document, 'click', (event: MouseEvent) => {
  if (!view.preview.value || event.defaultPrevented || event.button !== 0) {
    return
  }

  const anchor = (event.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href]')
  const scroller = document.querySelector('[data-cms-scroller]')

  if (!anchor || !scroller?.contains(anchor)) {
    return
  }

  event.preventDefault()
  const newTab = anchor.target === '_blank' || event.metaKey || event.ctrlKey || event.shiftKey
  void session.goTo(anchor.getAttribute('href')!, newTab)
}, { capture: true })

// ── Shortcuts ─────────────────────────────────────────────────────────

const peek = ref(false)
// The "only untranslated" filter of a translation works through the dimming.
const highlightOn = computed(() => view.highlight.value || peek.value
  || (view.onlyUntranslated.value && engine.translating.value))

/** Inputs keep their own Undo; a modal dialog owns the keyboard. */
function ownsKeyboard(target: EventTarget | null) {
  if (document.querySelector('dialog[open]')) {
    return true
  }

  return target instanceof HTMLElement && target.matches('input, textarea, select')
}

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  const shortcut = editorShortcut(event)

  if (shortcut === 'save') {
    event.preventDefault()

    if (!document.querySelector('dialog[open]')) {
      void session.save()
    }

    return
  }

  if (shortcut && !view.preview.value && !ownsKeyboard(event.target)) {
    event.preventDefault()
    session.blurActiveField()

    if (shortcut === 'redo') {
      engine.redo()
    } else {
      engine.undo()
    }

    return
  }

  if (event.key === 'Escape' && view.preview.value && !document.querySelector('dialog[open]')) {
    view.setPreview(false)
    return
  }

  // Alt alone shows the map of fields; Alt with another key is a character
  // (Option+letter on macOS) or a shortcut, not a peek.
  peek.value = event.key === 'Alt' && !event.repeat
})

useEventListener(window, 'keyup', (event: KeyboardEvent) => {
  if (event.key === 'Alt') {
    peek.value = false
  }
})

useEventListener(window, 'blur', () => {
  peek.value = false
})

// ── Layout ────────────────────────────────────────────────────────────

// The bar grows with the lock banner; panels below it read the height.
const bar = useTemplateRef<HTMLElement>('bar')
const barHeight = ref(64)

useResizeObserver(bar, (entries) => {
  barHeight.value = Math.round(entries[0]?.borderBoxSize?.[0]?.blockSize ?? entries[0]?.contentRect.height ?? 64)
})

// The drawer and toasts are teleported to <body>: they read it from the root.
watch(barHeight, (height) => {
  document.documentElement.style.setProperty('--cms-edit-bar-height', `${height}px`)
}, { immediate: true })

onBeforeUnmount(() => {
  document.documentElement.style.removeProperty('--cms-edit-bar-height')
})

function retryLoad() {
  const key = engine.entity.value?.key

  if (key) {
    void engine.load(key)
  }
}
</script>

<template>
  <div
    class="cms-edit"
    :class="{
      'cms-edit--preview': view.preview.value,
      'cms-edit--highlight': highlightOn && !view.preview.value,
      'cms-edit--readonly': engine.readOnly.value,
    }"
  >
    <div
      ref="bar"
      class="cms-admin cms-editor-ui cms-edit__bar"
      :lang="adminLocale"
    >
      <EditorToolbar
        :title="title"
        :path="path"
        :unbound="unbound"
        :entry="Boolean(entry)"
      />
      <LockBanner />
      <LocaleBanner />
      <EntryAddressBar
        v-if="entry && entry.requireSlug && engine.status.value === 'ready'"
        :type="entry.type"
        :entry-id="entry.id"
        :prefix="entry.prefix"
        :reserved="reserved"
      />
    </div>

    <div class="cms-edit__viewport">
      <div
        class="cms-edit__scroller"
        data-cms-scroller
      >
        <div
          class="cms-edit__page"
          :class="{ 'cms-edit__page--loading': loading }"
        >
          <slot />
        </div>
      </div>

      <div
        v-if="loading"
        class="cms-admin cms-editor-ui cms-edit__loading"
        role="status"
        :lang="adminLocale"
      >
        {{ t('cms.editor.status.loading') }}
      </div>
      <div
        v-else-if="engine.status.value === 'error'"
        class="cms-admin cms-editor-ui cms-edit__loading"
        role="alert"
        :lang="adminLocale"
      >
        <p>{{ t('cms.editor.load.failed') }}</p>
        <div class="cms-edit__loading-actions">
          <AdminButton
            variant="primary"
            size="sm"
            @click="retryLoad"
          >
            {{ t('cms.editor.status.retry') }}
          </AdminButton>
          <AdminButton
            variant="secondary"
            size="sm"
            to="/admin"
          >
            {{ t('cms.editor.load.back') }}
          </AdminButton>
        </div>
      </div>
    </div>

    <OverlayLayer
      v-if="engine.status.value === 'ready' && !view.preview.value"
      :highlight="highlightOn"
    />
    <EditorToasts />
    <EditorDialog />
    <HistoryPanel v-if="session.historyOpen.value" />
  </div>
</template>
