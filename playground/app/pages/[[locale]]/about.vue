<script setup lang="ts">
import type { CmsLinkValue, CmsRichTextValue } from 'nuxt-cms-core/types'

interface AboutContent {
  title?: string
  body?: CmsRichTextValue
  back?: CmsLinkValue
}

const { t } = useCmsText()
useHead({ title: () => t('meta.aboutTitle') })

// No `about` row is seeded: every primitive renders its default from the slot.
const { page, error } = useCmsPage('about')
useLocaleHead(page, '/about')
const about = computed(() => (page.value?.content ?? {}) as AboutContent)
</script>

<template>
  <main
    id="main"
    class="container about-page"
  >
    <CmsText
      :value="about.title"
      field-key="title"
      tag="h1"
      class="section-title"
    >
      About us
    </CmsText>
    <CmsRichText
      :value="about.body"
      field-key="body"
      class="about-page__body"
    >
      <p>Default text from the page code.</p>
    </CmsRichText>
    <p v-if="error">
      {{ error.message }}
    </p>
    <p>
      <CmsLink
        :value="about.back"
        field-key="back"
        href="/"
      >
        Home
      </CmsLink>
    </p>
  </main>
</template>

<style scoped>
.about-page {
  min-height: 60vh;
  padding: 96px 0;
}

.about-page__body {
  max-width: 680px;
  color: var(--ink-soft);
}
</style>
