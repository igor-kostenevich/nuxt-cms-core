<script setup lang="ts">
import type {
  CmsButtonValue,
  CmsCollectionItem,
  CmsEntrySelectionValue,
  CmsImageValue,
  CmsLinkValue,
  CmsOptionalValue,
  CmsRichTextValue,
} from 'nuxt-cms-core/types'

// Test landing for Edit Mode (008). It uses every primitive the editor knows:
// text, rich text, links and buttons, content / decorative / background
// images, collections and an optional block. The page owns structure and
// defaults; the CMS fills in values (MASTER_PLAN C-01).
interface HomeContent {
  hero?: {
    eyebrow?: string
    title?: string
    lead?: CmsRichTextValue
    cta?: CmsButtonValue
    secondary?: CmsLinkValue
    background?: CmsImageValue
  }
  services?: { eyebrow?: string, title?: string, items?: CmsCollectionItem[] }
  about?: {
    eyebrow?: string
    title?: string
    body?: CmsRichTextValue
    more?: CmsLinkValue
    image?: CmsImageValue
    decor?: CmsImageValue
  }
  work?: { eyebrow?: string, title?: string, items?: CmsCollectionItem[] }
  quote?: { visibility?: CmsOptionalValue, text?: string, author?: string, role?: string }
  faq?: { title?: string, items?: CmsCollectionItem[] }
  contact?: { title?: string, text?: string, cta?: CmsButtonValue }
  /** 014: which posts the section shows; choosing them in Edit Mode is stage 6. */
  blog?: { title?: string, posts?: CmsEntrySelectionValue }
}

const { t } = useCmsText()
useHead({ title: () => t('meta.homeTitle') })

const { page, ready: pageReady } = useCmsPage('home')
useLocaleHead(page, '/')
const content = computed(() => (page.value?.content ?? {}) as HomeContent)
const hero = computed(() => content.value.hero ?? {})
const services = computed(() => content.value.services ?? {})
const about = computed(() => content.value.about ?? {})
const work = computed(() => content.value.work ?? {})
const quote = computed(() => content.value.quote ?? {})
const faq = computed(() => content.value.faq ?? {})
const contact = computed(() => content.value.contact ?? {})
const blog = computed(() => content.value.blog ?? {})

// From the blog (014): the newest three (Automatic), or posts the editor chose
// in this section (Manual), in their order. The choice is in the page's
// content: read it first, or the server renders the default and no posts.
await pageReady
const { entries: latestPosts } = useCmsEntries('post', () => cmsEntrySelection(blog.value.posts, { limit: 3 }))

// Items from code have stable ids (C-88): translations and text changes stay
// on the item when the order here changes.
const defaultServices = [
  { id: 'strategy', title: 'Strategy & direction', text: 'Workshops, research and positioning that give every project a clear reason to exist.' },
  { id: 'identity', title: 'Brand identity', text: 'Names, logos and visual systems that stay consistent from a favicon to a billboard.' },
  { id: 'websites', title: 'Websites & products', text: 'Fast, accessible sites and apps, designed and built by the same small team.' },
]

const defaultWork = [
  { id: 'solace', title: 'Solace Health', category: 'Brand · Website', cover: '/media/work-1.svg' },
  { id: 'northwind', title: 'Northwind Bank', category: 'Product design', cover: '/media/work-2.svg' },
  { id: 'atlas', title: 'Atlas Outdoors', category: 'E-commerce', cover: '/media/work-3.svg' },
  { id: 'vela', title: 'Vela Records', category: 'Identity · Motion', cover: '/media/work-4.svg' },
]

const defaultFaq = [
  { id: 'timeline', question: 'How long does a typical project take?', answer: 'Most brand and website projects take eight to twelve weeks from kickoff to launch.' },
  { id: 'startups', question: 'Do you work with early-stage startups?', answer: 'Yes. We have fixed-scope packages for teams that need to move fast on a smaller budget.' },
  { id: 'support', question: 'Can you maintain the site after launch?', answer: 'We offer monthly care plans with updates, monitoring and small design changes.' },
]

// A default item's cover is a file path from code; a chosen one is a media
// value (C-74). CmsImage takes the path as `src` and the value as `value`.
function coverOf(item: CmsCollectionItem) {
  return typeof item.cover === 'string' ? item.cover : '/media/work-1.svg'
}

function coverValue(item: CmsCollectionItem) {
  return typeof item.cover === 'object' ? item.cover as CmsImageValue : null
}
</script>

<template>
  <main id="main">
    <CmsBackground
      :value="hero.background"
      field-key="hero.background"
      field-label="Hero background"
      src="/media/hero.svg"
      class="hero"
      loading="eager"
      fetchpriority="high"
    >
      <div class="container hero__inner">
        <CmsText
          :value="hero.eyebrow"
          field-key="hero.eyebrow"
          tag="p"
          class="eyebrow"
        >
          Creative studio
        </CmsText>
        <CmsText
          :value="hero.title"
          field-key="hero.title"
          field-label="Headline"
          tag="h1"
          class="hero__title"
          required
          :max-length="75"
        >
          We craft digital experiences that move people.
        </CmsText>
        <CmsRichText
          :value="hero.lead"
          field-key="hero.lead"
          tag="p"
          class="hero__lead"
          inline
        >
          Strategy, identity and websites for brands that want to be remembered.
        </CmsRichText>
        <div class="hero__actions">
          <CmsButton
            :value="hero.cta"
            field-key="hero.cta"
            href="/#contact"
            class="btn btn--accent"
          >
            Start a project
          </CmsButton>
          <CmsLink
            :value="hero.secondary"
            field-key="hero.secondary"
            href="/#work"
            class="btn btn--ghost hero__secondary"
          >
            See our work
          </CmsLink>
        </div>
      </div>
    </CmsBackground>

    <section
      id="services"
      class="section"
    >
      <div class="container">
        <CmsText
          :value="services.eyebrow"
          field-key="services.eyebrow"
          tag="p"
          class="eyebrow"
        >
          What we do
        </CmsText>
        <CmsText
          :value="services.title"
          field-key="services.title"
          tag="h2"
          class="section-title"
        >
          Three disciplines, one team that sees the whole picture.
        </CmsText>
        <CmsCollection
          :value="services.items"
          field-key="services.items"
          field-label="Services"
          :defaults="defaultServices"
          :template="{ title: 'New service', text: 'Describe what this service includes.' }"
          :min="1"
          :max="6"
          class="services"
          item-class="service"
        >
          <template #default="{ item, index }">
            <span
              class="service__index"
              aria-hidden="true"
            >0{{ index + 1 }}</span>
            <CmsText
              :value="item.title as string"
              field-key="title"
              tag="h3"
              class="service__title"
              required
            />
            <CmsText
              :value="item.text as string"
              field-key="text"
              tag="p"
              class="service__text"
            />
          </template>
        </CmsCollection>
      </div>
    </section>

    <section class="section about">
      <div class="container about__grid">
        <CmsImage
          :value="about.image"
          field-key="about.image"
          field-label="Studio photo"
          src="/media/studio.svg"
          alt="Our studio in Lviv: a long table, a big screen and a lot of daylight"
          class="about__image"
          width="1200"
          height="900"
          loading="lazy"
        />
        <div>
          <CmsText
            :value="about.eyebrow"
            field-key="about.eyebrow"
            tag="p"
            class="eyebrow"
          >
            About the studio
          </CmsText>
          <CmsText
            :value="about.title"
            field-key="about.title"
            tag="h2"
            class="section-title"
          >
            Small on purpose. Senior by default.
          </CmsText>
          <CmsRichText
            :value="about.body"
            field-key="about.body"
            class="about__body"
          >
            <p>We are twelve designers and engineers who prefer <strong>fewer, better projects</strong>. Every client works directly with the people doing the work.</p>
            <p>Since 2014 we have shipped more than 140 brands and products for teams in Europe and North America.</p>
          </CmsRichText>
          <CmsLink
            :value="about.more"
            field-key="about.more"
            href="/about"
            class="text-link"
          >
            More about us →
          </CmsLink>
        </div>
        <CmsImage
          :value="about.decor"
          field-key="about.decor"
          src="/media/about-alt.svg"
          decorative
          class="about__decor"
          width="1200"
          height="900"
          loading="lazy"
        />
      </div>
    </section>

    <section
      id="work"
      class="section work"
    >
      <div class="container">
        <CmsText
          :value="work.eyebrow"
          field-key="work.eyebrow"
          tag="p"
          class="eyebrow"
        >
          Selected work
        </CmsText>
        <CmsText
          :value="work.title"
          field-key="work.title"
          tag="h2"
          class="section-title"
        >
          Recent projects we are proud of.
        </CmsText>
        <CmsCollection
          :value="work.items"
          field-key="work.items"
          field-label="Projects"
          :defaults="defaultWork"
          :template="{ title: 'New project', category: 'Category', cover: '/media/work-1.svg' }"
          class="work__grid"
          item-tag="article"
          item-class="project"
        >
          <template #default="{ item }">
            <CmsImage
              :value="coverValue(item)"
              field-key="cover"
              field-label="Project cover"
              :src="coverOf(item)"
              :alt="`${item.title} cover`"
              class="project__cover"
              width="1200"
              height="840"
              loading="lazy"
            />
            <CmsText
              :value="item.category as string"
              field-key="category"
              tag="p"
              class="project__category"
            />
            <CmsText
              :value="item.title as string"
              field-key="title"
              tag="h3"
              class="project__title"
            />
          </template>
        </CmsCollection>
      </div>
    </section>

    <CmsOptional
      :value="quote.visibility"
      field-key="quote.visibility"
      field-label="Testimonial"
      tag="section"
      class="section quote"
    >
      <figure class="container quote__inner">
        <CmsText
          :value="quote.text"
          field-key="quote.text"
          tag="blockquote"
          class="quote__text"
        >
          “Luminary understood our business faster than we did. The new site doubled our demo requests in a quarter.”
        </CmsText>
        <figcaption class="quote__author">
          <CmsText
            :value="quote.author"
            field-key="quote.author"
            tag="strong"
          >
            Maria Kovalenko
          </CmsText>
          <CmsText
            :value="quote.role"
            field-key="quote.role"
            tag="span"
          >
            Head of Marketing, Solace Health
          </CmsText>
        </figcaption>
      </figure>
    </CmsOptional>

    <section class="section faq">
      <div class="container faq__grid">
        <CmsText
          :value="faq.title"
          field-key="faq.title"
          tag="h2"
          class="section-title"
        >
          Questions we hear a lot.
        </CmsText>
        <CmsCollection
          :value="faq.items"
          field-key="faq.items"
          field-label="FAQ"
          :defaults="defaultFaq"
          :template="{ question: 'New question?', answer: 'The answer.' }"
          tag="dl"
          item-class="faq__item"
        >
          <template #default="{ item }">
            <CmsText
              :value="item.question as string"
              field-key="question"
              tag="dt"
              class="faq__question"
              required
            />
            <CmsText
              :value="item.answer as string"
              field-key="answer"
              tag="dd"
              class="faq__answer"
            />
          </template>
        </CmsCollection>
      </div>
    </section>

    <section
      id="blog"
      class="section blog-teaser"
      data-test="home-blog"
    >
      <div class="container">
        <CmsText
          :value="blog.title"
          field-key="blog.title"
          tag="h2"
          class="section-title"
        >
          From the blog
        </CmsText>
        <CmsEntries
          :entries="latestPosts"
          :value="blog.posts"
          field-key="blog.posts"
          type="post"
          :limit="3"
          :max="6"
          field-label="Featured posts"
          class="blog-teaser__grid"
        >
          <template #default="{ entry }">
            <PostCard :entry="entry" />
          </template>
        </CmsEntries>
      </div>
    </section>

    <section
      id="contact"
      class="section contact"
    >
      <div class="container contact__inner">
        <CmsText
          :value="contact.title"
          field-key="contact.title"
          tag="h2"
          class="contact__title"
        >
          Have a project in mind?
        </CmsText>
        <CmsText
          :value="contact.text"
          field-key="contact.text"
          tag="p"
          class="contact__text"
        >
          Tell us a little about it. We answer every message within one working day.
        </CmsText>
        <CmsButton
          :value="contact.cta"
          field-key="contact.cta"
          href="mailto:hello@luminary.example"
          class="btn btn--accent"
        >
          hello@luminary.example
        </CmsButton>
      </div>
    </section>
  </main>
</template>

<style scoped>
.hero {
  display: flex;
  align-items: center;
  min-height: min(760px, 88vh);
  color: #fff;
}

.hero__inner {
  padding: 120px 0;
}

.hero__title {
  max-width: 900px;
  margin: 0;
  font-size: clamp(44px, 7vw, 88px);
  font-weight: 800;
  line-height: 1.02;
  letter-spacing: -0.035em;
}

.hero__lead {
  max-width: 560px;
  margin: 28px 0 40px;
  color: rgb(255 255 255 / 78%);
  font-size: 20px;
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.hero__secondary {
  color: #fff;
}

.services {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
}

.services :deep(.service) {
  padding: 32px;
  border-radius: var(--radius);
  background: #fff;
  box-shadow: 0 1px 2px rgb(12 12 15 / 6%);
}

.service__index {
  display: block;
  margin-bottom: 40px;
  color: var(--accent);
  font-weight: 700;
}

.service__title {
  margin: 0 0 12px;
  font-size: 22px;
  letter-spacing: -0.01em;
}

.service__text {
  margin: 0;
  color: var(--ink-soft);
}

.about {
  background: var(--sand);
}

.about__grid {
  position: relative;
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  align-items: center;
  gap: 72px;
}

.about__image {
  width: 100%;
  height: auto;
  border-radius: var(--radius);
}

.about__decor {
  position: absolute;
  right: -40px;
  bottom: -80px;
  width: 160px;
  height: 120px;
  border-radius: 24px;
  object-fit: cover;
  opacity: 0.9;
}

.about__body {
  color: var(--ink-soft);
}

.about__body :deep(p) {
  margin: 0 0 16px;
}

.text-link {
  font-weight: 600;
  text-underline-offset: 4px;
}

.work__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 40px 24px;
}

.work__grid :deep(.project__cover) {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 10 / 7;
  margin-bottom: 20px;
  border-radius: var(--radius);
  object-fit: cover;
}

.work__grid :deep(.project__category) {
  margin: 0 0 4px;
  color: var(--ink-soft);
  font-size: 15px;
}

.work__grid :deep(.project__title) {
  margin: 0;
  font-size: 24px;
  letter-spacing: -0.01em;
}

.quote {
  background: var(--ink);
  color: #fff;
}

.quote__inner {
  max-width: 900px;
  margin: 0 auto;
  text-align: center;
}

.quote__text {
  margin: 0 0 32px;
  font-size: clamp(26px, 3.4vw, 38px);
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.015em;
}

.quote__author {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: rgb(255 255 255 / 70%);
}

.quote__author strong {
  color: #fff;
}

.faq__grid {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 72px;
}

.faq__grid :deep(dl) {
  margin: 0;
}

.faq__grid :deep(.faq__item) {
  padding: 24px 0;
  border-bottom: 1px solid rgb(12 12 15 / 10%);
}

.faq__grid :deep(.faq__question) {
  margin-bottom: 8px;
  font-size: 19px;
  font-weight: 650;
}

.faq__grid :deep(.faq__answer) {
  margin: 0;
  color: var(--ink-soft);
}

.contact {
  background: var(--accent);
  color: #fff;
}

.contact__inner {
  max-width: 760px;
  text-align: center;
}

.contact__title {
  margin: 0 0 16px;
  font-size: clamp(36px, 5vw, 60px);
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.03em;
}

.contact__text {
  margin: 0 0 32px;
  font-size: 19px;
  opacity: 0.9;
}

.contact .btn {
  background: #fff;
  color: var(--ink);
}

@media (max-width: 860px) {
  .about__grid,
  .faq__grid,
  .work__grid {
    grid-template-columns: 1fr;
    gap: 40px;
  }

  .about__decor {
    display: none;
  }
}
.blog-teaser__grid {
  display: grid;
  gap: 24px;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
}
</style>
