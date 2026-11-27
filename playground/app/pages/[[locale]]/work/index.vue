<script setup lang="ts">
// Work: the heading is this page's content; the case studies are entries of
// the type `project`, newest first.
interface WorkContent { title?: string, lead?: string }

const { t } = useCmsText()
useHead({ title: () => t('meta.workTitle') })

const { page } = useCmsPage('work')
useLocaleHead(page, '/work')
const content = computed(() => (page.value?.content ?? {}) as WorkContent)
const { entries } = useCmsEntries('project', { limit: 50 })
</script>

<template>
  <main
    id="main"
    class="container work"
  >
    <CmsText
      :value="content.title"
      field-key="title"
      tag="h1"
      class="work__title"
    >
      Selected work
    </CmsText>
    <CmsText
      :value="content.lead"
      field-key="lead"
      tag="p"
      class="work__lead"
    >
      A few projects we are proud of.
    </CmsText>
    <div class="work__grid">
      <CmsEntries :entries="entries">
        <template #default="{ entry }">
          <ProjectCard :entry="entry" />
        </template>
      </CmsEntries>
    </div>
  </main>
</template>

<style scoped>
.work { padding-block: 64px; }
.work__title { margin: 0 0 12px; font-size: 40px; }
.work__lead { margin: 0 0 32px; color: #555; font-size: 18px; }
.work__grid { display: grid; gap: 24px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
</style>
