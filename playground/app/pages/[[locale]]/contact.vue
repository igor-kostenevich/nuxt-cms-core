<script setup lang="ts">
// Contact: a page of its own content and the contact form (011).
interface ContactContent { title?: string, lead?: string, address?: string, email?: string }

const { t } = useCmsText()
useHead({ title: () => t('meta.contactTitle') })

const { page } = useCmsPage('contact')
useLocaleHead(page, '/contact')
const content = computed(() => (page.value?.content ?? {}) as ContactContent)
</script>

<template>
  <main
    id="main"
    class="container contact-page"
  >
    <CmsText
      :value="content.title"
      field-key="title"
      tag="h1"
      class="contact-page__title"
    >
      Let’s talk
    </CmsText>
    <CmsText
      :value="content.lead"
      field-key="lead"
      tag="p"
      class="contact-page__lead"
    >
      Tell us what you are building. We answer within two working days.
    </CmsText>
    <p class="contact-page__details">
      <CmsText
        :value="content.address"
        field-key="address"
        tag="span"
      >
        Kyiv, Ukraine
      </CmsText>
      ·
      <CmsText
        :value="content.email"
        field-key="email"
        tag="span"
      >
        hello@luminary.studio
      </CmsText>
    </p>
    <ContactForm />
  </main>
</template>

<style scoped>
.contact-page { padding-block: 64px; }
.contact-page__title { margin: 0 0 12px; font-size: 40px; }
.contact-page__lead { margin: 0 0 8px; color: #555; font-size: 18px; }
.contact-page__details { margin: 0 0 32px; color: #777; }
</style>
