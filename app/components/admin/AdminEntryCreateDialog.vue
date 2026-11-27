<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { adminErrorKey } from '../../admin/error-key'
import { SLUG_FORMAT, SLUG_MAX, slugify } from '../../admin/slug'
import { useAdminEntryCreate } from '../../admin/useAdminEntries'
import { useAdminI18n } from '../../admin/useAdminI18n'
import type { CmsEntrySlugCheck } from '../../types/entries'

// Create an entry of a type with a route (014 §4.1): a title and an address.
// The editor stays where it is (to add several in a row); the page offers to
// open the new draft. The entry is a draft until it is published. No
// lock is taken here: Edit Mode takes it when it opens. The id is chosen once
// per opening of the dialog, so a retried create cannot make a second entry.
const props = defineProps<{
  type: string
  /** `/blog/` */
  prefix: string
  reserved: readonly string[]
  /** The dialog's title in the Client's words (`text.newTitle`); Core's otherwise. */
  heading?: string | null
}>()

const emit = defineEmits<{
  created: [entry: { id: string, slug: string, title: string }]
}>()

const open = defineModel<boolean>('open', { required: true })

const { t } = useAdminI18n()
const entries = useAdminEntryCreate()

const title = ref('')
const slug = ref('')
/** The address follows the title until it is typed in. */
const slugTouched = ref(false)
const id = ref('')
const busy = ref(false)
const failure = shallowRef<unknown>(null)
const submitted = ref(false)
const check = shallowRef<CmsEntrySlugCheck | null>(null)

watch(open, (now) => {
  if (now) {
    title.value = ''
    slug.value = ''
    slugTouched.value = false
    id.value = crypto.randomUUID()
    failure.value = null
    submitted.value = false
    check.value = null
  }
}, { immediate: true })

watch(title, (next) => {
  if (!slugTouched.value) {
    slug.value = slugify(next)
  }
})

function onSlug(next: string) {
  slugTouched.value = true
  slug.value = next.trim().toLowerCase()
}

// ── Checks ───────────────────────────────────────────────────────────

let asked = 0

const slugProblem = computed<'empty' | 'length' | 'format' | 'reserved' | null>(() => {
  if (!slug.value) {
    return 'empty'
  }

  if (slug.value.length > SLUG_MAX) {
    return 'length'
  }

  if (!SLUG_FORMAT.test(slug.value)) {
    return 'format'
  }

  return props.reserved.includes(slug.value) ? 'reserved' : null
})

const ask = useDebounceFn(async (value: string) => {
  const mine = ++asked

  try {
    const result = await entries.checkSlug(props.type, value)

    if (mine === asked) {
      check.value = result
    }
  } catch {
    if (mine === asked) {
      check.value = null
    }
  }
}, 400)

watch([slug, slugProblem], ([value, problem]) => {
  check.value = null

  if (!problem) {
    void ask(value)
  }
})

const titleError = computed(() => (submitted.value && !title.value.trim() ? t('cms.pages.create.titleRequired') : undefined))

const slugError = computed(() => {
  const problem = slugProblem.value

  if (problem === 'empty') {
    return submitted.value ? t('cms.editor.address.required') : undefined
  }

  if (problem === 'length') {
    return t('cms.editor.address.tooLong', { max: SLUG_MAX })
  }

  if (problem === 'format') {
    return t('cms.editor.address.format')
  }

  if (problem === 'reserved') {
    return t('cms.editor.address.reserved')
  }

  if (check.value?.status === 'taken') {
    return check.value.holderArchived
      ? t('cms.editor.address.takenArchived', { title: check.value.holderTitle ?? '' })
      : t('cms.editor.address.taken', { title: check.value.holderTitle ?? '' })
  }

  return undefined
})

const slugHint = computed(() => `${props.prefix}${slug.value || '…'} · ${slug.value.length} / ${SLUG_MAX}`)

async function submit() {
  submitted.value = true
  failure.value = null

  if (!title.value.trim() || slugProblem.value || check.value?.status === 'taken') {
    return
  }

  busy.value = true

  try {
    const created = await entries.create(props.type, { title: title.value.trim(), slug: slug.value }, id.value)
    emit('created', { id: created.id, slug: slug.value, title: title.value.trim() })
    open.value = false
  } catch (cause) {
    failure.value = cause
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AdminDialog
    v-model:open="open"
    :title="props.heading || t('cms.pages.create.title')"
  >
    <form
      class="entry-create"
      novalidate
      data-test="entry-create"
      @submit.prevent="submit"
    >
      <AdminAlert
        v-if="failure"
        tone="danger"
        :title="t(adminErrorKey(failure))"
      />
      <AdminInput
        v-model="title"
        :label="t('cms.pages.create.titleLabel')"
        :error="titleError"
        autocomplete="off"
        data-test="create-title"
      />
      <AdminInput
        :model-value="slug"
        :label="t('cms.pages.create.slugLabel')"
        :error="slugError"
        :hint="slugHint"
        autocomplete="off"
        spellcheck="false"
        data-test="create-slug"
        @update:model-value="onSlug"
      />
      <div class="entry-create__actions">
        <AdminButton
          type="button"
          variant="ghost"
          @click="open = false"
        >
          {{ t('cms.pages.create.cancel') }}
        </AdminButton>
        <AdminButton
          type="submit"
          variant="primary"
          :loading="busy"
        >
          {{ t('cms.pages.create.submit') }}
        </AdminButton>
      </div>
    </form>
  </AdminDialog>
</template>

<style scoped>
.entry-create {
  display: grid;
  gap: var(--cms-space-4);
}

.entry-create__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--cms-space-2);
}
</style>
