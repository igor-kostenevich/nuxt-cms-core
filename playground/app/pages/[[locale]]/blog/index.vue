<script setup lang="ts">
// The blog (014): published posts, newest first, a page at a time. Archived,
// draft-only and hidden-language posts never reach this list.
const PAGE_SIZE = 6

const { t } = useCmsText()
const route = useRoute()
const to = useLocalePath()
const url = useRequestURL()
useHead({ title: () => t('meta.blogTitle') })

const page = computed(() => Math.max(1, Number.parseInt(String(route.query.page ?? '1'), 10) || 1))
const { entries, total, ready } = useCmsEntries('post', () => ({ limit: PAGE_SIZE, offset: (page.value - 1) * PAGE_SIZE, sort: 'newest' as const }))
await ready

const pages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

// Entry data outside <CmsEntries> is plain data: here structured data for
// search engines (no primitive renders it).
useHead({
  script: computed(() => [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      'itemListElement': entries.value.map((entry, index) => ({
        '@type': 'ListItem',
        'position': index + 1,
        'name': (entry.content as { title?: string }).title ?? '',
        'url': url.origin + to(`/blog/${entry.slug}`),
      })),
    }),
  }]),
})
</script>

<template>
  <main
    id="main"
    class="container blog"
  >
    <h1 class="blog__title">
      {{ t('blog.title') }}
    </h1>

    <p
      v-if="entries.length === 0"
      data-test="blog-empty"
    >
      {{ t('blog.empty') }}
    </p>

    <div
      class="blog__grid"
      data-test="blog-list"
    >
      <CmsEntries :entries="entries">
        <template #default="{ entry }">
          <PostCard :entry="entry" />
        </template>
      </CmsEntries>
    </div>

    <nav
      v-if="pages > 1"
      class="blog__pages"
    >
      <NuxtLink
        v-if="page > 1"
        :to="{ query: page > 2 ? { page: page - 1 } : {} }"
      >
        ← {{ t('blog.newer') }}
      </NuxtLink>
      <NuxtLink
        v-if="page < pages"
        :to="{ query: { page: page + 1 } }"
      >
        {{ t('blog.older') }} →
      </NuxtLink>
    </nav>
  </main>
</template>

<style scoped>
.blog { padding-block: 64px; }
.blog__title { margin: 0 0 32px; font-size: 40px; }
.blog__grid { display: grid; gap: 24px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.blog__pages { display: flex; justify-content: space-between; margin-top: 32px; }
</style>
