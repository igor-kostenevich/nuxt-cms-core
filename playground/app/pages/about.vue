<script setup lang="ts">
import type { CmsLinkValue, CmsRichTextValue } from 'nuxt-cms-core/types'

interface AboutContent {
  title?: string
  body?: CmsRichTextValue
  back?: CmsLinkValue
}

// No `about` row is seeded: every primitive renders its default from the slot.
const { page, error } = useCmsPage('about')
const about = computed(() => (page.value?.content ?? {}) as AboutContent)
</script>

<template>
  <main>
    <CmsText
      :value="about.title"
      field-key="title"
      tag="h1"
    >
      About us
    </CmsText>
    <CmsRichText
      :value="about.body"
      field-key="body"
    >
      <p>Default text from the page code.</p>
    </CmsRichText>
    <p v-if="error">{{ error.message }}</p>
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
