<script setup lang="ts">
import { adminErrorKey } from '../../admin/error-key'
import { displayName } from '../../admin/languages'
import type { PageTextRow, SiteTextRow, TextGroup } from '../../admin/texts'
import { useAdminI18n } from '../../admin/useAdminI18n'
import { useAdminLanguages } from '../../admin/useAdminLanguages'
import { useAdminTexts, type DraftPage } from '../../admin/useAdminTexts'
import { useAdminToast } from '../../admin/useAdminToast'
import { CmsDataError } from '../../data/errors'

definePageMeta({
  // The Client Project's layouts frame the site, not the admin.
  layout: false,
  middleware: ['cms-auth'],
})

// Texts (C-86, C-89): every text of the site in one place, grouped by page and
// by site-text group. A second way into the same drafts as Edit Mode: a page
// text — in the original or a translation — goes into the draft of the
// language, the same draft the editor saves, and is published with the same
// operation. Site texts are live at once. Rich text is edited in Edit Mode.
// "Publish" first waits for every save in flight, then lists the pages with a
// draft: a page that also has changes from the editor (images, order, links)
// is not ticked, so nothing goes live unnoticed.
const { t, locale: adminLocale } = useAdminI18n()
const { can } = usePermissions()
const route = useRoute()
const router = useRouter()
const toasts = useAdminToast()
const { languages, defaultLanguage, ready: languagesReady } = useAdminLanguages()

await languagesReady

const defaultLocale = computed(() => defaultLanguage.value.code)
const locale = computed({
  get: () => {
    const value = route.query.locale
    return typeof value === 'string' && languages.value.some(language => language.code === value)
      ? value
      : defaultLocale.value
  },
  set: (value: string) => {
    void router.replace({ query: { ...route.query, locale: value === defaultLocale.value ? undefined : value } })
  },
})
const translating = computed(() => locale.value !== defaultLocale.value)

const {
  groups,
  draftPages,
  error,
  ready,
  pending,
  savePageText,
  saveSiteText,
  settle,
  publishPages,
  openInEditor,
} = useAdminTexts({
  locale,
  defaultLocale,
  textsTitle: group => t('cms.texts.siteGroup', { group }),
})

await ready

const canEditPages = computed(() => can('pages.edit'))
const canPublish = computed(() => can('pages.publish'))

function languageName(code: string) {
  return displayName(code, adminLocale.value) ?? code
}

const languageOptions = computed(() => languages.value.map(language => ({
  value: language.code,
  label: language.isDefault
    ? t('cms.texts.defaultLanguage', { name: language.nativeName })
    : language.active ? language.nativeName : t('cms.texts.hiddenLanguage', { name: language.nativeName }),
})))

// ── Groups ────────────────────────────────────────────────────────────

const onlyMissing = ref(false)
const selectedId = ref<string | null>(null)

const pageGroups = computed(() => groups.value.filter(group => group.kind === 'page'))
const textGroups = computed(() => groups.value.filter(group => group.kind === 'texts'))
const selected = computed<TextGroup | null>(() =>
  groups.value.find(group => group.id === selectedId.value) ?? groups.value[0] ?? null)

const rows = computed(() => (selected.value?.rows ?? []).filter(row => !onlyMissing.value || row.missing))

/** Rows of a page under the blocks of the page they are in, in page order. */
const sectioned = computed(() => rows.value.map((row, index) => {
  const section = row.source === 'page' ? row.section : null
  const previous = index > 0 ? rows.value[index - 1] : undefined
  const previousSection = previous?.source === 'page' ? previous.section : null

  return { row, header: section && section !== previousSection ? section : null }
}))

watch(translating, (value) => {
  if (!value) {
    onlyMissing.value = false
  }
})

// ── Editing ───────────────────────────────────────────────────────────

/** What is typed, by row id; a row without an entry shows the stored value. */
const edits = reactive<Record<string, string>>({})
const status = reactive<Record<string, 'saving' | 'saved' | 'error'>>({})
/**
 * The last value sent per row. A second change is compared with it, not with
 * the stored value, which lags while the first write is in flight.
 */
const requested = new Map<string, string>()

function storedValue(row: PageTextRow | SiteTextRow) {
  if (translating.value) {
    return row.translation
  }

  // The original: a stored change of the text from code, if any.
  return row.source === 'text' ? (row.original === row.codeText ? '' : row.original) : row.stored
}

function valueOf(row: PageTextRow | SiteTextRow) {
  return edits[row.id] ?? storedValue(row)
}

function placeholderOf(row: PageTextRow | SiteTextRow) {
  return row.source === 'text' && !translating.value ? row.codeText : row.original
}

function editable(row: PageTextRow | SiteTextRow) {
  if (row.source === 'text') {
    return canPublish.value
  }

  return canEditPages.value && row.translatable && !row.rich
}

/** The original with a stored change can go back to the text from code. */
function resettable(row: PageTextRow | SiteTextRow) {
  if (translating.value) {
    return false
  }

  return row.source === 'text'
    ? canPublish.value && storedValue(row) !== ''
    : canEditPages.value && !row.rich && row.resettable
}

/**
 * What a page text write sends: empty means "no own text" — no translation,
 * or the text from code in the original. Inside a stored list there is no
 * text from code, so empty stays an empty text there.
 */
function pageValue(row: PageTextRow, value: string): string | null {
  if (value !== '') {
    return value
  }

  return translating.value || !row.inStoredList ? null : ''
}

function failed(row: PageTextRow | SiteTextRow, value: string, cause: unknown) {
  // Not sent after all: the same text typed again (or blurred again) retries.
  if (requested.get(row.id) === value) {
    requested.delete(row.id)
  }

  status[row.id] = 'error'
  toasts.toast(cause instanceof CmsDataError && cause.code === 'locked'
    ? t('cms.texts.pageOpen')
    : t(adminErrorKey(cause)), { tone: 'error' })
}

/** Sends a value; the row settles when the last value sent has landed. */
async function write(row: PageTextRow | SiteTextRow, value: string, send: () => Promise<void>) {
  requested.set(row.id, value)
  status[row.id] = 'saving'

  try {
    await send()

    if (requested.get(row.id) === value) {
      requested.delete(row.id)
      Reflect.deleteProperty(edits, row.id)
      status[row.id] = 'saved'
    }
  } catch (cause) {
    failed(row, value, cause)
  }
}

function save(row: PageTextRow | SiteTextRow) {
  const typed = edits[row.id]

  if (typed === undefined) {
    return
  }

  const value = typed.trim()

  if (value === (requested.get(row.id) ?? storedValue(row).trim())) {
    if (!requested.has(row.id)) {
      Reflect.deleteProperty(edits, row.id)
    }

    return
  }

  void write(row, value, () => row.source === 'page'
    ? savePageText(row, pageValue(row, value))
    : saveSiteText(row.id, row.key, value))
}

function revert(row: PageTextRow | SiteTextRow) {
  edits[row.id] = ''
  void write(row, '', () => row.source === 'page'
    ? savePageText(row, null)
    : saveSiteText(row.id, row.key, ''))
}

/** A page text lands in the draft; a site text is on the site at once. */
function savedLabel(row: PageTextRow | SiteTextRow) {
  return row.source === 'page' ? t('cms.texts.savedDraft') : t('cms.texts.savedLive')
}

function editorLink(row: PageTextRow) {
  const query = new URLSearchParams({ field: row.address })

  if (translating.value) {
    query.set('locale', locale.value)
  }

  const path = row.editPath ?? '/'
  return `/admin/edit${path === '/' ? '/' : path}?${query}`
}

/**
 * What a person calls the text: the label from the page code, else its kind
 * ("Heading", "Button", "Image description"); a site text is named by its
 * context. Keys and addresses are code: they stay in the tooltip only.
 */
function rowLabel(row: PageTextRow | SiteTextRow) {
  if (row.source === 'text') {
    return row.context || row.key
  }

  if (row.label) {
    return row.label
  }

  const kind = row.kind === 'text' && /^h[1-6]$/.test(row.tag ?? '') ? 'heading' : row.kind
  const name = t(`cms.texts.kinds.${kind}`)

  return row.item ? t('cms.texts.inItem', { name, number: row.item }) : name
}

function rowCode(row: PageTextRow | SiteTextRow) {
  return row.source === 'page' ? row.address : row.key
}

// ── Publish ───────────────────────────────────────────────────────────

const publishOpen = ref(false)
const preparing = ref(false)
const publishing = ref(false)
/** Pages ticked in the dialog. */
const chosen = reactive<Record<string, boolean>>({})
/** Pages open in Edit Mode when the dialog opened: they cannot be published. */
const openPages = reactive<Record<string, boolean>>({})

const chosenPages = computed(() => draftPages.value.filter(page => chosen[page.key] && !openPages[page.key]))

/**
 * Opens the dialog once every save has landed: the active field is blurred
 * (it saves), the queue drains, the drafts reload. A failed save stops here,
 * so its text is not left out of a publish without a word.
 */
async function openPublish() {
  preparing.value = true

  try {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }

    if (!await settle()) {
      toasts.toast(t('cms.texts.unsaved'), { tone: 'error' })
      return
    }

    const pages = draftPages.value

    if (pages.length === 0) {
      toasts.toast(t('cms.texts.nothingToPublish'))
      return
    }

    const open = await Promise.all(pages.map(page => openInEditor(page.key).catch(() => false)))

    for (const key of Object.keys(chosen)) {
      Reflect.deleteProperty(chosen, key)
      Reflect.deleteProperty(openPages, key)
    }

    pages.forEach((page, index) => {
      openPages[page.key] = open[index]!
      // Changes from the editor stay unticked: publishing them is a decision.
      chosen[page.key] = !open[index] && !page.summary.other
    })

    publishOpen.value = true
  } catch (cause) {
    toasts.toast(t(adminErrorKey(cause)), { tone: 'error' })
  } finally {
    preparing.value = false
  }
}

async function publish() {
  const pages = chosenPages.value

  if (pages.length === 0) {
    return
  }

  publishing.value = true

  try {
    const { published, skipped } = await publishPages(pages)
    publishOpen.value = false
    toasts.toast(skipped.length > 0
      ? t('cms.texts.publishedSkipped', { published, skipped: skipped.join(', ') })
      : t('cms.texts.published', { published, name: languageName(locale.value) }),
    { tone: skipped.length > 0 ? 'neutral' : 'success' })
  } catch (cause) {
    toasts.toast(t(adminErrorKey(cause)), { tone: 'error' })
  } finally {
    publishing.value = false
  }
}

function pageSummary(page: DraftPage) {
  if (page.summary.other) {
    return page.summary.texts > 0
      ? t('cms.texts.summaryTextsAndOther', { count: page.summary.texts })
      : t('cms.texts.summaryOther')
  }

  return t('cms.texts.summaryTexts', { count: page.summary.texts })
}
</script>

<template>
  <AdminShell :title="t('cms.shell.nav.texts')">
    <AdminAlert
      v-if="error"
      tone="danger"
      :title="t(adminErrorKey(error))"
    />

    <div
      v-else
      class="texts"
    >
      <div class="texts__bar">
        <div class="texts__language">
          <AdminSelect
            v-model="locale"
            :options="languageOptions"
            :label="t('cms.texts.language')"
            label-placement="inline"
          />
        </div>
        <AdminSwitch
          v-if="translating"
          v-model="onlyMissing"
          :label="t('cms.texts.onlyMissing')"
        />
        <span class="texts__spacer" />
        <AdminButton
          v-if="canPublish"
          variant="primary"
          size="md"
          :disabled="draftPages.length === 0 && pending === 0"
          :loading="preparing"
          :title="draftPages.length === 0 ? t('cms.texts.nothingToPublish') : undefined"
          @click="openPublish"
        >
          {{ translating
            ? t('cms.texts.publish', { count: draftPages.length })
            : t('cms.texts.publishChanges', { count: draftPages.length }) }}
        </AdminButton>
      </div>

      <p class="texts__hint">
        {{ translating
          ? t('cms.texts.translatingHint', { name: languageName(defaultLocale) })
          : t('cms.texts.originalHint') }}
      </p>

      <div class="texts__layout">
        <nav
          class="texts-nav"
          :aria-label="t('cms.texts.groups')"
        >
          <p class="texts-nav__title">
            {{ t('cms.texts.pages') }}
          </p>
          <p
            v-if="pageGroups.length === 0"
            class="texts-nav__empty"
          >
            {{ t('cms.texts.noPages') }}
          </p>
          <button
            v-for="group in pageGroups"
            :key="group.id"
            type="button"
            class="texts-nav__item"
            :aria-current="selected?.id === group.id ? 'true' : undefined"
            @click="selectedId = group.id"
          >
            <span class="texts-nav__name">
              {{ group.title }}
              <span
                v-if="group.subtitle"
                class="texts-nav__path"
              >{{ group.subtitle }}</span>
            </span>
            <span
              v-if="translating && group.missing > 0"
              class="texts-nav__count"
              :title="t('cms.texts.missingCount', { count: group.missing })"
            >{{ group.missing }}</span>
          </button>

          <p class="texts-nav__title">
            {{ t('cms.texts.siteTexts') }}
          </p>
          <p
            v-if="textGroups.length === 0"
            class="texts-nav__empty"
          >
            {{ t('cms.texts.noSiteTexts') }}
          </p>
          <button
            v-for="group in textGroups"
            :key="group.id"
            type="button"
            class="texts-nav__item"
            :aria-current="selected?.id === group.id ? 'true' : undefined"
            @click="selectedId = group.id"
          >
            <span class="texts-nav__name">{{ group.title }}</span>
            <span
              v-if="translating && group.missing > 0"
              class="texts-nav__count"
            >{{ group.missing }}</span>
          </button>
        </nav>

        <section
          class="settings-card texts-table"
          :aria-label="selected?.title"
        >
          <p
            v-if="!selected"
            class="texts-table__empty"
          >
            {{ t('cms.texts.empty') }}
          </p>
          <p
            v-else-if="rows.length === 0"
            class="texts-table__empty"
          >
            {{ onlyMissing ? t('cms.texts.allTranslated') : t('cms.texts.empty') }}
          </p>

          <template
            v-for="{ row, header } in sectioned"
            :key="row.id"
          >
            <h3
              v-if="header"
              class="text-section"
            >
              {{ header }}
            </h3>
            <div
              class="text-row"
              :class="{ 'text-row--missing': row.missing }"
            >
              <div
                class="text-row__head"
                :title="rowCode(row)"
              >
                <span class="text-row__label">{{ rowLabel(row) }}</span>
              </div>

              <p
                v-if="translating"
                class="text-row__original"
                :lang="defaultLocale"
              >
                {{ row.original || '—' }}
              </p>

              <div class="text-row__value">
                <textarea
                  v-if="editable(row)"
                  class="text-row__input"
                  rows="1"
                  :lang="locale"
                  :value="valueOf(row)"
                  :placeholder="placeholderOf(row)"
                  :aria-label="t('cms.texts.valueFor', { name: rowLabel(row) })"
                  @input="edits[row.id] = ($event.target as HTMLTextAreaElement).value"
                  @blur="save(row)"
                  @keydown.enter.exact.prevent="($event.target as HTMLTextAreaElement).blur()"
                />
                <p
                  v-else-if="row.source === 'page' && translating && !row.translatable"
                  class="text-row__note"
                >
                  {{ t('cms.texts.saveBaseFirst', { name: languageName(defaultLocale) }) }}
                </p>
                <p
                  v-else-if="row.source === 'page' && row.rich"
                  class="text-row__readonly"
                >
                  {{ (translating ? row.translation : row.original) || t('cms.texts.richInEditor') }}
                </p>
                <p
                  v-else
                  class="text-row__readonly"
                >
                  {{ valueOf(row) || placeholderOf(row) || '—' }}
                </p>

                <span
                  class="text-row__status"
                  aria-live="polite"
                >
                  <Icon
                    v-if="status[row.id] === 'saved'"
                    name="lucide:check"
                    :title="savedLabel(row)"
                    :aria-label="savedLabel(row)"
                  />
                  <Icon
                    v-else-if="status[row.id] === 'saving'"
                    name="lucide:loader"
                    class="text-row__spin"
                    :aria-label="t('cms.texts.saving')"
                  />
                  <Icon
                    v-else-if="status[row.id] === 'error'"
                    name="lucide:circle-alert"
                    class="text-row__error"
                    :title="t('cms.texts.notSaved')"
                    :aria-label="t('cms.texts.notSaved')"
                  />
                </span>

                <button
                  v-if="resettable(row)"
                  type="button"
                  class="text-row__link"
                  :title="t('cms.texts.resetToCode')"
                  :aria-label="t('cms.texts.resetToCode')"
                  @click="revert(row)"
                >
                  <Icon
                    name="lucide:rotate-ccw"
                    aria-hidden="true"
                  />
                </button>
                <NuxtLink
                  v-if="row.source === 'page'"
                  :to="editorLink(row)"
                  class="text-row__link"
                  :title="t('cms.texts.openInEditor')"
                  :aria-label="t('cms.texts.openInEditorFor', { name: rowLabel(row) })"
                >
                  <Icon
                    name="lucide:arrow-up-right"
                    aria-hidden="true"
                  />
                </NuxtLink>
              </div>
            </div>
          </template>
        </section>
      </div>
    </div>

    <AdminDialog
      v-model:open="publishOpen"
      :title="translating
        ? t('cms.texts.publishTitle', { name: languageName(locale) })
        : t('cms.texts.publishChangesTitle')"
    >
      <ul class="publish-list">
        <li
          v-for="page in draftPages"
          :key="page.key"
          class="publish-list__item"
          :class="{ 'publish-list__item--off': openPages[page.key] }"
        >
          <label class="publish-list__choice">
            <input
              v-model="chosen[page.key]"
              type="checkbox"
              :disabled="openPages[page.key]"
            >
            <span class="publish-list__name">
              {{ page.key }}
              <span
                v-if="page.editPath"
                class="publish-list__path"
              >{{ page.editPath }}</span>
            </span>
          </label>
          <span
            class="publish-list__summary"
            :class="{ 'publish-list__summary--other': page.summary.other && !openPages[page.key] }"
            :title="openPages[page.key]
              ? t('cms.texts.openInEditorHint')
              : page.summary.other ? t('cms.texts.summaryOtherHint') : undefined"
          >
            {{ openPages[page.key] ? t('cms.texts.openInEditorNow') : pageSummary(page) }}
          </span>
        </li>
      </ul>
      <template #footer>
        <AdminButton
          variant="secondary"
          size="md"
          @click="publishOpen = false"
        >
          {{ t('cms.common.cancel') }}
        </AdminButton>
        <AdminButton
          variant="primary"
          size="md"
          :disabled="chosenPages.length === 0"
          :loading="publishing"
          @click="publish"
        >
          {{ t('cms.texts.publishChosen', { count: chosenPages.length }) }}
        </AdminButton>
      </template>
    </AdminDialog>
  </AdminShell>
</template>

<style scoped>
.texts {
  display: grid;
  gap: var(--cms-space-4);
}

.texts__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cms-space-4);
}

.texts__language {
  min-width: 16rem;
}

.texts__spacer {
  flex: 1;
}

.texts__hint {
  margin: 0;
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-body-small-size);
}

.texts__layout {
  display: grid;
  grid-template-columns: 15rem minmax(0, 1fr);
  align-items: start;
  gap: var(--cms-space-6);
}

.texts-nav {
  position: sticky;
  top: var(--cms-space-6);
  display: grid;
  gap: 2px;
  padding: var(--cms-space-2);
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-lg);
  background: var(--cms-card);
}

.texts-nav__title {
  margin: var(--cms-space-2) var(--cms-space-2) var(--cms-space-1);
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-label-small-size);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.texts-nav__empty {
  margin: 0 var(--cms-space-2) var(--cms-space-2);
  color: var(--cms-text-tertiary);
  font-size: var(--cms-type-helper-size);
}

.texts-nav__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cms-space-2);
  min-height: var(--cms-control-md);
  padding: var(--cms-space-1) var(--cms-space-2);
  border: 0;
  border-radius: var(--cms-radius-sm);
  background: transparent;
  color: var(--cms-foreground);
  font: inherit;
  font-size: var(--cms-type-body-small-size);
  text-align: left;
  cursor: pointer;
}

.texts-nav__item:hover {
  background: var(--cms-surface-hover);
}

.texts-nav__item[aria-current="true"] {
  background: var(--cms-surface-selected);
  color: var(--cms-primary);
}

.texts-nav__item:focus-visible {
  outline: none;
  box-shadow: var(--cms-focus-ring);
}

.texts-nav__name {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.texts-nav__path {
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-helper-size);
}

.texts-nav__count {
  flex: none;
  min-width: 1.5rem;
  padding: 0 var(--cms-space-1);
  border-radius: var(--cms-radius-full);
  background: var(--cms-info-subtle);
  color: var(--cms-info-text);
  font-size: var(--cms-type-label-small-size);
  font-weight: 600;
  text-align: center;
}

.texts-table {
  gap: 0;
  padding: var(--cms-space-2) var(--cms-space-4);
}

.texts-table__empty {
  margin: 0;
  padding: var(--cms-space-6) 0;
  color: var(--cms-text-secondary);
  text-align: center;
}

.text-row {
  display: grid;
  grid-template-columns: minmax(10rem, 14rem) minmax(0, 1fr) minmax(0, 1fr);
  align-items: start;
  gap: var(--cms-space-4);
  padding: var(--cms-space-3) 0;
}

.text-row + .text-row {
  border-top: var(--cms-border-width) solid var(--cms-border-subtle);
}

/* A block of the page: its heading, so the list reads like the page. */
.text-section {
  margin: var(--cms-space-4) 0 0;
  padding: var(--cms-space-2) 0;
  border-bottom: var(--cms-border-width) solid var(--cms-border);
  color: var(--cms-foreground);
  font-size: var(--cms-type-label-large-size);
  font-weight: 600;
}

.text-section:first-child {
  margin-top: 0;
}

/* The default language has no original column. */
.texts-table:not(:has(.text-row__original)) .text-row {
  grid-template-columns: minmax(10rem, 14rem) minmax(0, 1fr);
}

.text-row__head {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding-top: var(--cms-space-1);
}

.text-row__label {
  font-size: var(--cms-type-body-small-size);
  font-weight: var(--cms-type-label-weight);
  overflow-wrap: anywhere;
}

.text-row__original,
.text-row__readonly,
.text-row__note {
  margin: 0;
  padding-top: var(--cms-space-1);
  font-size: var(--cms-type-body-small-size);
  overflow-wrap: anywhere;
}

.text-row__original,
.text-row__readonly {
  color: var(--cms-text-secondary);
}

.text-row__note {
  color: var(--cms-info-text);
}

.text-row__value {
  display: flex;
  align-items: flex-start;
  gap: var(--cms-space-2);
  min-width: 0;
}

.text-row__value > p {
  flex: 1;
}

.text-row__input {
  flex: 1;
  min-width: 0;
  min-height: var(--cms-control-md);
  padding: var(--cms-space-2) var(--cms-space-3);
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-sm);
  background: var(--cms-card);
  color: var(--cms-foreground);
  font: inherit;
  font-size: var(--cms-type-body-small-size);
  line-height: var(--cms-type-body-small-line);
  resize: none;
  field-sizing: content;
}

.text-row__input::placeholder {
  color: var(--cms-text-tertiary);
}

.text-row__input:focus-visible {
  outline: none;
  border-color: var(--cms-ring);
  box-shadow: var(--cms-focus-ring-field);
}

.text-row--missing .text-row__input {
  border-style: dashed;
  border-color: var(--cms-info-text);
}

.text-row__status {
  display: inline-flex;
  flex: none;
  width: 1rem;
  padding-top: var(--cms-space-2);
  color: var(--cms-success-text);
}

.text-row__error {
  color: var(--cms-destructive-text);
}

.text-row__spin {
  color: var(--cms-text-secondary);
  animation: text-row-spin 900ms linear infinite;
}

@keyframes text-row-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .text-row__spin {
    animation: none;
  }
}

.text-row__link {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--cms-control-md);
  height: var(--cms-control-md);
  border: 0;
  border-radius: var(--cms-radius-sm);
  background: transparent;
  color: var(--cms-text-secondary);
  cursor: pointer;
}

.text-row__link:hover {
  background: var(--cms-surface-hover);
  color: var(--cms-primary);
}

.text-row__link:focus-visible {
  outline: none;
  box-shadow: var(--cms-focus-ring);
}

.publish-list {
  display: grid;
  gap: var(--cms-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.publish-list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cms-space-3);
  padding: var(--cms-space-2) 0;
}

.publish-list__item + .publish-list__item {
  border-top: var(--cms-border-width) solid var(--cms-border-subtle);
}

.publish-list__item--off {
  color: var(--cms-text-tertiary);
}

.publish-list__choice {
  display: flex;
  align-items: center;
  gap: var(--cms-space-2);
  min-width: 0;
  cursor: pointer;
}

.publish-list__choice input {
  accent-color: var(--cms-primary);
}

.publish-list__name {
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-size: var(--cms-type-body-small-size);
}

.publish-list__path {
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-helper-size);
}

.publish-list__summary {
  flex: none;
  color: var(--cms-text-secondary);
  font-size: var(--cms-type-helper-size);
}

.publish-list__summary--other {
  color: var(--cms-warning);
}

@media (max-width: 900px) {
  .texts__layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .texts-nav {
    position: static;
  }

  .text-row,
  .texts-table:not(:has(.text-row__original)) .text-row {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--cms-space-2);
  }
}
</style>
