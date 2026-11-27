<script setup lang="ts">
import type { CmsLinkValue, CmsRichTextValue } from 'nuxt-cms-core/types'

interface AboutContent {
  title?: string
  body?: CmsRichTextValue
  back?: CmsLinkValue
  teamTitle?: string
}

const { t } = useCmsText()
useHead({ title: () => t('meta.aboutTitle') })

// No `about` row is seeded: every primitive renders its default from the slot.
const { page, error } = useCmsPage('about')
useLocaleHead(page, '/about')
const about = computed(() => (page.value?.content ?? {}) as AboutContent)

// The team: entries of the type `member` (Content), in the order the team set.
const { entries: team } = useCmsEntries('member', { limit: 50 })
const member = (entry: { content: unknown }) => entry.content as { title?: string, role?: string, bio?: string }
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
    <CmsText
      :value="about.teamTitle"
      field-key="teamTitle"
      tag="h2"
    >
      The team
    </CmsText>
    <div class="about-page__team">
      <CmsEntries :entries="team">
        <template #default="{ entry }">
          <article class="about-page__member">
            <CmsText
              :value="member(entry).title"
              field-key="title"
              tag="h3"
            />
            <CmsText
              :value="member(entry).role"
              field-key="role"
              tag="p"
              class="about-page__role"
            />
            <CmsText
              :value="member(entry).bio"
              field-key="bio"
              tag="p"
            />
          </article>
        </template>
      </CmsEntries>
    </div>
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
    <ContactForm />
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
.about-page__team {
  display: grid;
  gap: 16px;
  margin-bottom: 48px;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}

.about-page__member {
  padding: 20px;
  border: 1px solid #e5e5e5;
  border-radius: 16px;
  background: #fff;
}

.about-page__member h3 { margin: 0 0 4px; }
.about-page__member p { margin: 0; }
.about-page__role { margin-bottom: 8px !important; color: #777; }
</style>
