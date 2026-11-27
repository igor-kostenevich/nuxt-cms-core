<script setup lang="ts">
import type { CmsRichTextValue } from 'nuxt-cms-core/types'

// Services: the heading is this page's content; questions and clients are
// entries of the types `faq` and `client` (Content).
interface ServicesContent { title?: string, lead?: string, faqTitle?: string, clientsTitle?: string }

const { t } = useCmsText()
useHead({ title: () => t('meta.servicesTitle') })

const { page } = useCmsPage('services')
useLocaleHead(page, '/services')
const content = computed(() => (page.value?.content ?? {}) as ServicesContent)
const { entries: questions } = useCmsEntries('faq', { limit: 50 })
const { entries: clients } = useCmsEntries('client', { limit: 50 })

const faq = (entry: { content: unknown }) => entry.content as { title?: string, answer?: CmsRichTextValue }
const client = (entry: { content: unknown }) => entry.content as { title?: string, industry?: string }
</script>

<template>
  <main
    id="main"
    class="container services"
  >
    <CmsText
      :value="content.title"
      field-key="title"
      tag="h1"
      class="services__title"
    >
      What we do
    </CmsText>
    <CmsText
      :value="content.lead"
      field-key="lead"
      tag="p"
      class="services__lead"
    >
      Strategy, identity and websites — from the first workshop to launch.
    </CmsText>

    <CmsText
      :value="content.clientsTitle"
      field-key="clientsTitle"
      tag="h2"
    >
      Clients
    </CmsText>
    <ul class="services__clients">
      <CmsEntries :entries="clients">
        <template #default="{ entry }">
          <li class="services__client">
            <CmsText
              :value="client(entry).title"
              field-key="title"
              tag="strong"
            />
            <CmsText
              :value="client(entry).industry"
              field-key="industry"
              tag="span"
            />
          </li>
        </template>
      </CmsEntries>
    </ul>

    <CmsText
      :value="content.faqTitle"
      field-key="faqTitle"
      tag="h2"
    >
      Questions
    </CmsText>
    <div class="services__faq">
      <CmsEntries :entries="questions">
        <template #default="{ entry }">
          <details class="services__question">
            <CmsText
              :value="faq(entry).title"
              field-key="title"
              tag="summary"
            />
            <CmsRichText
              :value="faq(entry).answer"
              field-key="answer"
            />
          </details>
        </template>
      </CmsEntries>
    </div>
  </main>
</template>

<style scoped>
.services { padding-block: 64px; }
.services__title { margin: 0 0 12px; font-size: 40px; }
.services__lead { margin: 0 0 48px; color: #555; font-size: 18px; }
.services__clients { display: grid; gap: 12px; margin: 0 0 48px; padding: 0; list-style: none; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
.services__client { display: grid; gap: 4px; padding: 16px; border: 1px solid #e5e5e5; border-radius: 12px; background: #fff; }
.services__client span { color: #777; font-size: 14px; }
.services__faq { display: grid; gap: 8px; }
.services__question { padding: 16px 20px; border: 1px solid #e5e5e5; border-radius: 12px; background: #fff; }
.services__question summary { font-weight: 600; cursor: pointer; }
.services__question :deep(p) { margin: 12px 0 0; color: #444; }
</style>
