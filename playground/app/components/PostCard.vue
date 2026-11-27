<script setup lang="ts">
import type { CmsEntry } from 'nuxt-cms-core/types'

// A blog post in a list. Rendered inside <CmsEntries>: in Edit Mode of the
// page that lists it, its fields are the post's, read-only there (014 §7).
const props = defineProps<{ entry: CmsEntry }>()

const to = useLocalePath()
const post = computed(() => props.entry.content as { title?: string, excerpt?: string })
const date = computed(() => props.entry.firstPublishedAt
  ? new Date(props.entry.firstPublishedAt).toLocaleDateString(props.entry.locale, { year: 'numeric', month: 'long', day: 'numeric' })
  : null)
</script>

<template>
  <article
    class="post-card"
    data-test="post-card"
    :data-entry="entry.id"
  >
    <p
      v-if="date"
      class="post-card__date"
    >
      {{ date }}
    </p>
    <NuxtLink
      :to="to(`/blog/${entry.slug}`)"
      class="post-card__link"
    >
      <CmsText
        :value="post.title"
        field-key="title"
        tag="h3"
        class="post-card__title"
      />
    </NuxtLink>
    <CmsText
      :value="post.excerpt"
      field-key="excerpt"
      tag="p"
      class="post-card__excerpt"
    />
  </article>
</template>

<style scoped>
.post-card { display: grid; gap: 8px; padding: 24px; border: 1px solid #e5e5e5; border-radius: 16px; background: #fff; }
.post-card__date { margin: 0; color: #777; font-size: 14px; }
.post-card__link { color: inherit; text-decoration: none; }
.post-card__link:hover .post-card__title { text-decoration: underline; }
.post-card__title { margin: 0; font-size: 22px; line-height: 1.25; }
.post-card__excerpt { margin: 0; color: #444; }
</style>
