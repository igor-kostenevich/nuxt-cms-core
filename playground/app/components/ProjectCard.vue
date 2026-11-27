<script setup lang="ts">
import type { CmsEntry } from 'nuxt-cms-core/types'

// A case study in a list, rendered inside <CmsEntries>.
const props = defineProps<{ entry: CmsEntry }>()

const to = useLocalePath()
const project = computed(() => props.entry.content as { title?: string, client?: string, summary?: string })
</script>

<template>
  <article
    class="project-card"
    :data-entry="entry.id"
  >
    <CmsText
      :value="project.client"
      field-key="client"
      tag="p"
      class="project-card__client"
    />
    <NuxtLink
      :to="to(`/work/${entry.slug}`)"
      class="project-card__link"
    >
      <CmsText
        :value="project.title"
        field-key="title"
        tag="h3"
        class="project-card__title"
      />
    </NuxtLink>
    <CmsText
      :value="project.summary"
      field-key="summary"
      tag="p"
      class="project-card__summary"
    />
  </article>
</template>

<style scoped>
.project-card { display: grid; gap: 8px; padding: 24px; border: 1px solid #e5e5e5; border-radius: 16px; background: #fff; }
.project-card__client { margin: 0; color: #777; font-size: 14px; }
.project-card__link { color: inherit; text-decoration: none; }
.project-card__link:hover .project-card__title { text-decoration: underline; }
.project-card__title { margin: 0; font-size: 22px; line-height: 1.25; }
.project-card__summary { margin: 0; color: #444; }
</style>
