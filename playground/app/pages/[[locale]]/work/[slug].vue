<script setup lang="ts">
import type { CmsImageValue, CmsRichTextValue } from 'nuxt-cms-core/types'

// One case study (014): a page of its own, edited in Edit Mode. A missing or
// archived one is a 404.
interface ProjectContent {
  title?: string
  client?: string
  year?: string
  summary?: string
  cover?: CmsImageValue
  body?: CmsRichTextValue
}

const { t } = useCmsText()
const route = useRoute()
const to = useLocalePath()

const slug = computed(() => String(route.params.slug ?? ''))
const { entry, ready } = useCmsEntry('project', { slug })
await ready

if (!entry.value) {
  throw createError({ statusCode: 404, statusMessage: 'Case study not found', fatal: true })
}

const project = computed(() => (entry.value?.content ?? {}) as ProjectContent)
useHead({ title: () => project.value.title ?? '', htmlAttrs: { lang: () => entry.value?.locale } })
</script>

<template>
  <main
    id="main"
    class="container project"
    :data-entry="entry?.id"
  >
    <p class="project__back">
      <NuxtLink :to="to('/work')">
        ← {{ t('work.back') }}
      </NuxtLink>
    </p>
    <p class="project__meta">
      <CmsText
        :value="project.client"
        field-key="client"
        tag="span"
      >
        Client
      </CmsText>
      ·
      <CmsText
        :value="project.year"
        field-key="year"
        tag="span"
      >
        2026
      </CmsText>
    </p>
    <CmsText
      :value="project.title"
      field-key="title"
      tag="h1"
      class="project__title"
    />
    <CmsText
      :value="project.summary"
      field-key="summary"
      tag="p"
      class="project__summary"
    />
    <CmsImage
      :value="project.cover"
      field-key="cover"
      alt=""
      class="project__cover"
    />
    <CmsRichText
      :value="project.body"
      field-key="body"
      class="project__body"
    />
  </main>
</template>

<style scoped>
.project { max-width: 860px; padding-block: 64px; }
.project__back { margin: 0 0 24px; }
.project__meta { margin: 0; color: #777; }
.project__title { margin: 8px 0 16px; font-size: 44px; line-height: 1.1; }
.project__summary { font-size: 20px; color: #444; }
.project__cover { width: 100%; border-radius: 16px; }
</style>
