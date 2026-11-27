<script setup lang="ts">
import type { CmsRichTextValue } from 'nuxt-cms-core/types'

// One post (014). Its address is the slug of the language shown: a missing
// post is a 404, decided here by the site. The original's address in a
// language where the post has an address of its own is a 404 too (014 §6:
// no address history, no redirects).
interface PostContent {
  title?: string
  excerpt?: string
  body?: CmsRichTextValue
}

const { t } = useCmsText()
const route = useRoute()
const to = useLocalePath()
const url = useRequestURL()
const { defaultLocale } = useCmsLanguages()

const slug = computed(() => String(route.params.slug ?? ''))
const { entry, ready } = useCmsEntry('post', { slug })
await ready

if (!entry.value) {
  throw createError({ statusCode: 404, statusMessage: 'Post not found', fatal: true })
}

const post = computed(() => (entry.value?.content ?? {}) as PostContent)
const date = computed(() => entry.value?.firstPublishedAt
  ? new Date(entry.value.firstPublishedAt).toLocaleDateString(entry.value.locale, { year: 'numeric', month: 'long', day: 'numeric' })
  : null)

// More posts: plain list data, rendered through <CmsEntries>.
const { entries: newest } = useCmsEntries('post', { limit: 4, sort: 'newest' })
const more = computed(() => newest.value.filter(item => item.id !== entry.value?.id).slice(0, 3))

function href(code: string) {
  const address = entry.value?.slugs[code]
  return address ? url.origin + localePath(`/blog/${address}`, code === defaultLocale.value ? null : code) : null
}

useHead({
  title: () => post.value.title ?? '',
  htmlAttrs: { lang: () => entry.value?.locale },
  link: computed(() => {
    const current = entry.value

    if (!current) {
      return []
    }

    return [
      { rel: 'canonical' as const, href: href(current.locale) ?? undefined },
      ...Object.keys(current.slugs).map(code => ({ rel: 'alternate' as const, hreflang: code, href: href(code) ?? undefined })),
      { rel: 'alternate' as const, hreflang: 'x-default', href: href(current.defaultLocale) ?? undefined },
    ]
  }),
  // Shown in the original: not indexed under this language.
  meta: computed(() => entry.value && !entry.value.translated ? [{ name: 'robots', content: 'noindex' }] : []),
})
</script>

<template>
  <main
    id="main"
    class="container post"
    data-test="post"
    :data-entry="entry?.id"
  >
    <p class="post__back">
      <NuxtLink :to="to('/blog')">
        ← {{ t('nav.blog') }}
      </NuxtLink>
    </p>
    <p
      v-if="date"
      class="post__date"
    >
      {{ date }}
    </p>
    <CmsText
      :value="post.title"
      field-key="title"
      tag="h1"
      class="post__title"
    />
    <p
      v-if="entry && !entry.translated"
      class="post__note"
      data-test="untranslated"
    >
      {{ t('blog.untranslated') }}
    </p>
    <CmsText
      :value="post.excerpt"
      field-key="excerpt"
      tag="p"
      class="post__excerpt"
    />
    <CmsRichText
      :value="post.body"
      field-key="body"
      class="post__body"
    />

    <section
      v-if="more.length"
      class="post__more"
    >
      <h2>{{ t('blog.more') }}</h2>
      <div class="post__more-grid">
        <CmsEntries :entries="more">
          <template #default="{ entry: item }">
            <PostCard :entry="item" />
          </template>
        </CmsEntries>
      </div>
    </section>
  </main>
</template>

<style scoped>
.post { max-width: 760px; padding-block: 64px; }
.post__back { margin: 0 0 24px; }
.post__date { margin: 0; color: #777; }
.post__title { margin: 8px 0 16px; font-size: 44px; line-height: 1.1; }
.post__note { padding: 8px 12px; border-radius: 8px; background: #fff4d6; }
.post__excerpt { font-size: 20px; color: #444; }
.post__more { margin-top: 64px; }
.post__more-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
</style>
