<script setup lang="ts">
import type { CmsEntryContent } from '#cms/content'
import type { CmsEntry } from 'nuxt-cms-core/types'

// A vacancy on the site. Rendered inside <CmsEntries>: in Edit Mode of the
// page that lists it, its fields are the vacancy's, read-only there. The
// content type comes from the fields declared in cms.content.ts.
const props = defineProps<{ entry: CmsEntry }>()

const vacancy = computed(() => props.entry.content as Partial<CmsEntryContent['vacancy']>)
const EMPLOYMENT: Record<string, string> = { full: 'Full time', part: 'Part time', contract: 'Contract' }
</script>

<template>
  <article
    class="vacancy"
    data-test="vacancy"
    :data-entry="entry.id"
  >
    <CmsImage
      :value="vacancy.logo"
      field-key="logo"
      alt=""
      decorative
      class="vacancy__logo"
    />
    <div class="vacancy__body">
      <CmsText
        :value="vacancy.title"
        field-key="title"
        tag="h3"
        class="vacancy__title"
      />
      <p class="vacancy__meta">
        {{ [vacancy.location, vacancy.employment ? EMPLOYMENT[vacancy.employment] : null].filter(Boolean).join(' · ') }}
      </p>
      <p
        v-if="vacancy.salary !== undefined"
        class="vacancy__salary"
      >
        From ${{ vacancy.salary.toLocaleString('en') }}
      </p>
      <CmsText
        v-if="vacancy.summary"
        :value="vacancy.summary"
        field-key="summary"
        tag="p"
        class="vacancy__summary"
      />
      <CmsRichText
        :value="vacancy.description"
        field-key="description"
        class="vacancy__text"
      />
      <CmsLink
        :value="vacancy.apply"
        field-key="apply"
        href="/#contact"
        class="vacancy__apply"
      >
        Apply
      </CmsLink>
    </div>
  </article>
</template>

<style scoped>
.vacancy { display: flex; gap: 20px; padding: 24px; border: 1px solid #e5e5e5; border-radius: 16px; background: #fff; }
.vacancy__logo { flex: none; width: 64px; height: 64px; object-fit: contain; }
.vacancy__body { display: grid; gap: 8px; }
.vacancy__title { margin: 0; font-size: 22px; }
.vacancy__meta { margin: 0; color: #777; }
.vacancy__salary { margin: 0; font-weight: 600; }
.vacancy__summary { margin: 0; }
.vacancy__text :deep(p) { margin: 0; }
.vacancy__apply { justify-self: start; font-weight: 600; }
</style>
