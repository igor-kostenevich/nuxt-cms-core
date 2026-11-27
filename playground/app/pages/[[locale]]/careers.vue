<script setup lang="ts">
// Careers (014): the heading is this page's own content; the vacancies are
// entries of the type `vacancy`, in the order the team set in Content.
interface CareersContent { title?: string, lead?: string }

const { t } = useCmsText()
useHead({ title: () => t('meta.careersTitle') })

const { page } = useCmsPage('careers')
useLocaleHead(page, '/careers')
const content = computed(() => (page.value?.content ?? {}) as CareersContent)
const { entries } = useCmsEntries('vacancy', { limit: 50 })
</script>

<template>
  <main
    id="main"
    class="container careers"
  >
    <CmsText
      :value="content.title"
      field-key="title"
      tag="h1"
      class="careers__title"
    >
      Join the studio
    </CmsText>
    <CmsText
      :value="content.lead"
      field-key="lead"
      tag="p"
      class="careers__lead"
    >
      Small team, real projects, no busywork.
    </CmsText>
    <div
      class="careers__list"
      data-test="vacancies"
    >
      <CmsEntries :entries="entries">
        <template #default="{ entry }">
          <VacancyCard :entry="entry" />
        </template>
      </CmsEntries>
    </div>
  </main>
</template>

<style scoped>
.careers { padding-block: 64px; }
.careers__title { margin: 0 0 12px; font-size: 40px; }
.careers__lead { margin: 0 0 32px; color: #555; font-size: 18px; }
.careers__list { display: grid; gap: 16px; }
</style>
