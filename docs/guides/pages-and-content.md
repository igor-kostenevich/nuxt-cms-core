# Як формуються сторінки й контент у Client Project

> Опорна дока для розробника сайту. З неї потім робиться документація для клієнтів. Відповідає стану Core на кінець
> епіку 014 (MASTER_PLAN C-99…C-112). Код і ідентифікатори — англійською, пояснення — українською.
> Приклади взяті з `playground/` (там вони працюють); поруч — посилання на рішення, якщо потрібні подробиці.

**Головна думка.** CMS редагує **контент**, а не структуру. Сторінки, маршрути, дизайн і бізнес-логіку будує розробник
у Vue-коді. Core дає: дані (Supabase), примітиви для полів, редактор (Edit Mode й форми в адмінці), мови й адреси.
Це не page builder.

## 1. Чотири види даних

Спершу вирішіть, до якого виду належить те, що ви робите. Вибір залежить від того, **хто цим керує і чи має воно
власну адресу**, а не від кількості.

| Вид | Що це | Приклад | Як зберігається / редагується |
| --- | --- | --- | --- |
| **Статична сторінка** | Сторінка з кодом, яку розробник створює файлом. Тексти й картинки на ній редагуються. | Home, About, Contact | Документ за ключем (`useCmsPage('about')`); Edit Mode `/admin/edit/about` |
| **Локальний повторюваний блок** | Список усередині однієї сторінки (послуги, відгуки на Home). Живе в документі цієї сторінки. | Блок «Послуги» на Home | `<CmsCollection>`, редагується там само, де сторінка |
| **Самостійний запис з адресою** | Багато схожих сторінок, кожна зі своєю адресою (маршрут з `[slug]`). | Блог, кейси | Тип у `cms.content.ts` з `route`; Pages → Edit Mode запису |
| **Самостійний запис без адреси** | Дані, які показуються на інших сторінках. Редагуються формою у вікні. | Вакансії, команда, FAQ, клієнти | Тип у `cms.content.ts` з `fields`; Content → модалка |
| *Бізнес-дані* | Замовлення, користувачі, зв'язки, обчислення. **Не CMS.** | Магазин, CRM | Власні таблиці й API Client Project |

Правило вибору між другим і третім/четвертим: якщо блок потрібен **лише одній сторінці** і редагується разом з нею —
колекція. Якщо записи живуть самі (мають список, порядок, статус «чернетка / опубліковано» або їх використовують
кілька сторінок) — тип у `cms.content.ts`.

## 2. Підключення

```ts
// nuxt.config.ts
export default defineNuxtConfig({ extends: ['nuxt-cms-core'] })
```

```ts
// cms.config.ts — лише серіалізовані значення: файл потрапляє в клієнтський бандл
import { defineCmsConfig } from 'nuxt-cms-core/config'

export default defineCmsConfig({ defaultLocale: 'en' })
```

Ключі Supabase й запуск локальної БД — у `README.md`. Три файли поруч із `nuxt.config.ts` читає Core:

| Файл | Для чого |
| --- | --- |
| `cms.config.ts` | Мова оригіналу (`defaultLocale`) та налаштування Core |
| `cms.content.ts` | Оголошені сторінки й типи записів (розділи 4–6) |
| `cms.texts.ts` | Тексти сайту поза CMS-сторінками: меню, футер, заголовки списків (розділ 9) |

> Адреси `/admin/*` належать лише Core. Сторінка Client під `/admin` валить build (C-98).

## 3. Статична сторінка

Сторінка — звичайний Vue-файл. Контент підтягується за **ключем**, а кожне редаговане місце — це примітив з
**адресою поля** (`field-key`).

```vue
<!-- pages/[[locale]]/about.vue -->
<script setup lang="ts">
import type { CmsLinkValue, CmsRichTextValue } from 'nuxt-cms-core/types'

interface AboutContent { title?: string, body?: CmsRichTextValue, back?: CmsLinkValue }

const { page, error } = useCmsPage('about')
// `page` — null, поки сторінка не опублікована: тоді примітиви показують дефолти зі слотів.
const about = computed(() => (page.value?.content ?? {}) as AboutContent)
</script>

<template>
  <main>
    <CmsText :value="about.title" field-key="title" tag="h1">About us</CmsText>
    <CmsRichText :value="about.body" field-key="body">
      <p>Default text from the page code.</p>
    </CmsRichText>
    <CmsLink :value="about.back" field-key="back" href="/">Home</CmsLink>
  </main>
</template>
```

### Примітиви

| Компонент | Значення в документі | Що редагує редактор |
| --- | --- | --- |
| `CmsText` | `string` | Текст (`tag`, `required`, `max-length`) |
| `CmsRichText` | Tiptap JSON (абзаци, **жирний**, *курсив*, посилання) | Форматований текст (`inline` — для заголовків) |
| `CmsLink`, `CmsButton` | `{ label?, href?, newTab? }` | Підпис, адресу, «нова вкладка» |
| `CmsImage`, `CmsBackground` | `{ mediaId, alt?, focal?, decorative? }` | Файл з Медіатеки, alt, фокус |
| `CmsCollection` | `[{ id, …поля }]` | Додати / видалити / дублювати / переставити елементи |
| `CmsOptional` | `{ hidden?: boolean }` | Показати / сховати блок |
| `CmsEntries` | `{ mode, limit \| ids }` | Вибір записів на сторінці (розділ 7) |

Правила, які легко порушити:

1. **Дефолт — це слот.** Немає значення в БД → показується вміст слота. Порожній рядок `''` — це свідомо очищене поле.
2. **Значення йде лише вниз.** `:value` і `field-key` — і все. Ніякого `v-model`, примітив нічого не емітить (C-47).
3. **Не перетворюйте значення, яке передаєте.** `:value="title || 'x'"` чи `.toUpperCase()` у Edit Mode зробить поле
   read-only: воно показує не те, що в документі. Дефолт — завжди у слоті, форматування — CSS або власний компонент
   над тим, що примітив уже відрендерив.
4. **`field-key` — стабільна адреса**: `hero.title`, `services.items.<id>.title`; літери, цифри, `_`, `-`, крапки між
   сегментами. Перейменували ключ — старі значення лишилися під старим (CMS не мігрує дані).
5. **Дані з БД — недовірений вхід.** Rich text рендериться без `v-html`, `href` проходить allow-list (`http(s):`,
   `mailto:`, `tel:`, шляхи сайту). Не вставляйте значення полів форми через `v-html`; посилання з полів типу `url`
   або `email` формуйте самі лише з `http(s):` / `mailto:`.
6. **Підписи для редактора** — `field-label`, `required`, `max-length`: з'являються в панелях Edit Mode і блокують
   Publish, поки не виправлено.

### Колекція (локальний повторюваний блок)

```vue
<CmsCollection
  :value="work.items" field-key="work.items" field-label="Projects"
  :defaults="defaultWork" :template="{ title: 'New project', category: 'Category' }"
  item-tag="article" class="work__grid"
>
  <template #default="{ item }">
    <CmsText :value="item.title as string" field-key="title" tag="h3" />
    <CmsText :value="item.category as string" field-key="category" tag="p" />
  </template>
</CmsCollection>
```

`defaults` — елементи з коду, поки колекцію не відредагували. **Дайте кожному стабільний `id`**: за ним зберігаються
переклади. Усередині слота `field-key` відносні до елемента.

### Як сторінка потрапляє в адмінку

Оголосіть її в `cms.content.ts` (розділ 4): тоді вона одразу видна в **Pages** зі статусом «Не редагувалась» і кнопкою
«Редагувати». Без оголошення Core покаже сторінку лише після першого відкриття в Edit Mode (як раніше).

## 4. `cms.content.ts`

Єдине місце, де розробник каже Core, які сторінки й типи записів існують. Усе, що тут, — серіалізоване (потрапляє
в клієнтський бандл). Некоректна декларація **валить build** зі списком помилок (у dev — лише попередження).

```ts
import { defineCmsContent } from 'nuxt-cms-core/config'

export default defineCmsContent({
  // Статичні сторінки для розділу Pages (необов'язково).
  pages: {
    home: { label: { en: 'Home', uk: 'Головна' }, path: '/' },
    about: { label: { en: 'About', uk: 'Про нас' }, path: '/about' },
  },
  types: {
    // Запис з адресою → Pages. Рівно один `[slug]`, останній сегмент.
    post: {
      label: { en: 'Blog posts', uk: 'Статті' },
      route: '/blog/[slug]',
      order: 'newest',
      text: { newButton: { en: 'Write a post', uk: 'Написати статтю' } },
    },
    // Запис без адреси → Content. Форма — це `fields`.
    vacancy: {
      label: { en: 'Vacancies', uk: 'Вакансії' },
      order: 'manual',
      text: { newButton: { en: 'Add vacancy', uk: 'Додати вакансію' }, newTitle: 'New vacancy' },
      fields: {
        title: { type: 'text', label: { en: 'Position', uk: 'Посада' }, required: true, maxLength: 120 },
        location: { type: 'text', label: 'City', width: 'half' },
        employment: {
          type: 'select', label: 'Employment', width: 'half', default: 'full',
          options: [{ value: 'full', label: 'Full time' }, { value: 'part', label: 'Part time' }],
        },
        description: { type: 'richText', label: 'Description' },
        apply: { type: 'link', label: 'Apply link' },
      },
    },
  },
})
```

Правила:

- **Ключ типу** — `^[a-z][a-z0-9-]{0,39}$`, **назавжди** (зберігається з кожним записом). Перейменування — міграція даних.
- Тип має рівно **одне з двох**: `route` (запис з адресою) або `fields` (форма у вікні). Обидва чи жодного — помилка.
- `label`, `text.*`, `options[].label`, `hint`, `placeholder` — рядок або `{ en, uk, … }` (мова адмінки).
- `order`: `newest` (за першою публікацією), `title`, `manual` (ручний; лише для типів **без** `route`). Це типовий
  порядок у `useCmsEntries` і в адмін-списку.
- `text`: `newButton`, `newTitle`, `editTitle` (`{title}` підставляється). Слова пишете цілком — Core нічого не клеїть.
- Обмеження: до 40 полів у типі, до 100 варіантів у списку, ключ поля `^[a-z][a-zA-Z0-9_]{0,39}$`.
- **Типи для TypeScript.** Core генерує `CmsEntryTypeKey` і `CmsEntryContent` (форма вмісту з `fields`):

```ts
import type { CmsEntryContent } from '#cms/content'
type Vacancy = Partial<CmsEntryContent['vacancy']>   // title?: string, employment?: 'full' | 'part', …
```

### Типи полів форми (Content)

Форму рендерить Core своїми контролами; публічний сайт показує запис **вашими** компонентами. Поле — ключ у вмісті запису.

| `type` | Значення в `entry.content` | Властивості (понад `label`, `hint`, `required`, `width`) |
| --- | --- | --- |
| `text` | `string` | `maxLength`, `default`, `placeholder` |
| `textarea` | `string` | `maxLength`, `rows` (2–20), `default`, `placeholder` |
| `richText` | Tiptap JSON | `maxLength` |
| `number` | `number` | `min`, `max`, `default`, `placeholder` |
| `select` / `radio` | `string` (`value` варіанта) | `options`, `default` (`placeholder` лише в `select`) |
| `multiselect` | `string[]` | `options`, `min`, `max`, `default`, `placeholder` |
| `boolean` | `boolean` | `appearance: 'switch' \| 'checkbox'`, `default` (без `required`) |
| `date` | `'YYYY-MM-DD'` (день, без часу й зони) | `min`, `max`, `default`, `placeholder` |
| `datetime` | `'2026-11-25T14:30:00Z'` (**UTC**) | `min`, `max`, `default`, `placeholder` |
| `dateRange` | `{ start, end }` (дні) | `min`, `max`, `default`, `placeholder` |
| `email` / `url` / `phone` | `string` (`url` — лише `http(s)://`) | `maxLength` (email, url), `default`, `placeholder` |
| `image` | `{ mediaId, alt?, … }` | — |
| `link` | `{ label?, href?, newTab? }` | — |

- **`width`**: `full` (типово), `half`, `quarter` — частка рядка форми; на вузьких екранах поля складаються.
- **`default` лише для нового запису.** Існуючі записи без значення дефолтів не отримують.
- **Межі дат** (`min` / `max`) — у форматі значення: `'YYYY-MM-DD'` для `date` і `dateRange`, UTC ISO (`…Z`) для
  `datetime`.
- **Datetime зберігається в UTC.** Адмінка показує час у поясі редактора; на сайті форматуйте самі
  (`new Date(value).toLocaleString(locale, { timeZone: '…' })`). Перехід годинника: неіснуючий час — помилка,
  повторюваний — редактор обирає явно.
- Значення, якого більше немає в `options`, **не очищується**, але блокує публікацію, поки його не змінять.
- Перекладаються лише тексти: `text`, `textarea`, `richText`, підпис посилання, alt зображення. Решта (select, число,
  дата, файл, адреса посилання) — структура: однакова в усіх мовах, змінюється в оригіналі.
- Схему не перевіряє сервер. Перейменували / видалили поле — старі значення лишилися в документах.

## 5. Запис з адресою (блог, кейси)

Тип із `route`. Файл маршруту — ваш; Core дає читання й Edit Mode.

```vue
<!-- pages/[[locale]]/blog/[slug].vue -->
<script setup lang="ts">
const route = useRoute()
const slug = computed(() => String(route.params.slug ?? ''))
const { entry, ready } = useCmsEntry('post', { slug })
await ready

// null — немає публічного запису: рішення про 404 ваше.
if (!entry.value) {
  throw createError({ statusCode: 404, statusMessage: 'Post not found', fatal: true })
}

const post = computed(() => (entry.value?.content ?? {}) as { title?: string, excerpt?: string, body?: CmsRichTextValue })
</script>

<template>
  <main :data-entry="entry?.id">
    <CmsText :value="post.title" field-key="title" tag="h1" />
    <CmsText :value="post.excerpt" field-key="excerpt" tag="p" />
    <CmsRichText :value="post.body" field-key="body" />
  </main>
</template>
```

`entry`: `{ id, type, locale, defaultLocale, content, publishedAt, firstPublishedAt, media, translated, slug, slugs }`.

Список:

```vue
<script setup lang="ts">
const { entries, total, ready } = useCmsEntries('post', () => ({ limit: 6, offset: 0, sort: 'newest' }))
await ready
</script>

<template>
  <CmsEntries :entries="entries">
    <template #default="{ entry }"><PostCard :entry="entry" /></template>
  </CmsEntries>
</template>
```

Вимоги й поведінка:

- **Маршрут**: `/blog/[slug]` ↔ файл `pages/[[locale]]/blog/[slug].vue`. Рівно один `[slug]`, останній; catch-all
  (`[...rest]`) для типу заборонений. Для кожного типу має існувати сторінка — інакше build падає.
- **Адреса запису** (slug): `a-z`, цифри, дефіс, 1–80 символів. У редактора вона пропонується з назви.
  **Зарезервовані** статичні сусіди маршруту (`/blog/archive`) — така адреса недоступна.
- **Унікальність** перевіряється по `(тип, мова)` з fallback на мову оригіналу. Мова може мати власну адресу
  (`/uk/blog/kava`), інакше береться адреса оригіналу.
- **Історії адрес і redirect немає**: стара адреса віддасть 404 (ваша логіка).
- `useCmsEntry` / `useCmsEntries` **ніколи** не повертають: чернетки, зняті з сайту, записи прихованої мови.
- **Edit Mode запису**: `/admin/edit/blog/my-post?entry=<uuid>`. Ідентичність — UUID, адреса — косметика;
  зміна slug не перемикає редактор.
- hreflang / canonical: `entry.slugs` дає адресу кожної мови (див. `playground/.../blog/[slug].vue`, `useLocaleHead`).
  Якщо `!entry.translated` — виставте `noindex` (показується оригінал).

## 6. Запис без адреси (вакансії, команда, FAQ)

Тип з `fields`. Редактор керує ним у **Content**: список, порядок, статуси, модалка з формою. Показуєте ви де завгодно:

```vue
<!-- pages/[[locale]]/careers.vue -->
<script setup lang="ts">
const { entries } = useCmsEntries('vacancy', { limit: 50 })   // порядок — з `order` типу
</script>

<template>
  <CmsEntries :entries="entries">
    <template #default="{ entry }"><VacancyCard :entry="entry" /></template>
  </CmsEntries>
</template>
```

```vue
<!-- components/VacancyCard.vue -->
<script setup lang="ts">
import type { CmsEntryContent } from '#cms/content'
import type { CmsEntry } from 'nuxt-cms-core/types'

const props = defineProps<{ entry: CmsEntry }>()
const vacancy = computed(() => props.entry.content as Partial<CmsEntryContent['vacancy']>)
</script>

<template>
  <article>
    <CmsText :value="vacancy.title" field-key="title" tag="h3" />
    <CmsRichText :value="vacancy.description" field-key="description" />
    <CmsLink :value="vacancy.apply" field-key="apply" href="/#contact">Apply</CmsLink>
  </article>
</template>
```

**Обов'язково рендеріть записи через `<CmsEntries>`.** Усередині його слота поля запису в Edit Mode **сторінки**
лише для читання: правка на Careers не повинна записати назву вакансії в документ Careers. Поза слотом поле запису
Core вважає чужим і теж робить read-only (а в dev пише попередження). Редагується запис у **Content**, не на сторінці.
Структурні дані (JSON-LD, `<head>`) читайте як звичайні дані з `entry.content`.

## 7. Вибір записів на сторінці (Featured, «схожі статті»)

Редактор вирішує, **які** записи показати: «Автоматично: N найновіших» або «Вручну: вибрані й у порядку». Вибір — це
значення поля сторінки (структура, не переклад).

```vue
<script setup lang="ts">
import type { CmsEntrySelectionValue } from 'nuxt-cms-core/types'

const { page, ready } = useCmsPage('home')
await ready   // спершу сторінка: у ній збережений вибір (інакше SSR прочитає дефолт)
const blog = computed(() => (page.value?.content.blog ?? {}) as { posts?: CmsEntrySelectionValue })
const { entries } = useCmsEntries('post', () => cmsEntrySelection(blog.value.posts, { limit: 3 }))
</script>

<template>
  <CmsEntries :entries="entries" :value="blog.posts" field-key="blog.posts" type="post" :limit="3" :max="6" tag="div"
              field-label="Featured posts">
    <template #default="{ entry }"><PostCard :entry="entry" /></template>
  </CmsEntries>
</template>
```

Недоступні вибрані записи (зняті, не опубліковані, без перекладу) сайт просто не показує, а панель в Edit Mode
пояснює чому. Вибір за id — до 100 записів.

## 8. Мови й переклади

Мови керує адмінка (Налаштування → Мови): активні мови, прихована (у роботі), мова оригіналу. **Маршрутизація мов —
ваша.** Playground використовує `prefix_except_default` (`/about`, `/uk/about`), для цього є три шматки Client-коду:

```ts
// middleware/locale.global.ts — мова з URL
export default defineNuxtRouteMiddleware((to) => {
  if (to.path.startsWith('/admin')) return
  const param = to.params.locale
  useCmsLocale().value = typeof param === 'string' && param ? param : null   // null — мова оригіналу
})
```

```ts
// plugins/cms-links.ts — CMS зберігає шляхи без префікса (`/about`); сайт дописує префікс мови
export default defineNuxtPlugin(() => provideCmsLinkResolver((href, locale) => localePath(href, locale)))
```

`useCmsLanguages()` дає `languages`, `defaultLocale`, `multilingual` — для перемикача мов у шапці.

Як працюють переклади:

- Оригінал — повний документ; переклад — лише перекладені тексти. **Непереклад показує оригінал** (по полях).
  `page.translated` / `entry.translated` каже, чи є переклад; для неперекладених виставляйте `noindex`.
- Перекладаються тексти, підписи посилань, alt зображень (розділ 4). Структура — в оригіналі.
- Мова оригіналу незмінна після створення сайту.
- У Edit Mode мова обирається перемикачем (на сторінці — через `?locale=`).
- Шапка сайту рендериться **поза** сторінкою, яку показує Edit Mode: її `route` — це `/admin/edit/…`. Для перемикача мов
  беріть шлях сайту без префікса `/admin/edit` (див. `layouts/default.vue` у playground).

## 9. Тексти сайту поза сторінками

Меню, підписи футера, заголовки списків — тексти, яких немає на CMS-сторінці. Пишете їх у `cms.texts.ts` англійською
(мова оригіналу), редагує й перекладає адмін (Тексти):

```ts
import { defineCmsTexts } from 'nuxt-cms-core/config'
export default defineCmsTexts({
  'nav.blog': { text: 'Blog', context: 'Menu item' },
  'footer.copyright': { text: '© {year} Luminary', context: 'Footer; {year} is the current year' },
})
```

```ts
const { t } = useCmsText()
t('nav.blog')
t('footer.copyright', { year })
```

Форми (`cms.forms.ts`, `useCmsForm`) і аналітика — окремі теми (011, 013), див. `README.md`.

## 10. Що відбувається в адмінці (для довідки клієнтської документації)

**Життєвий цикл запису / сторінки:**

| Статус (у списку й у редакторі) | Значення |
| --- | --- |
| **Чернетка** | Ще не опублікований, або знятий із сайту. На сайті його немає |
| **Опубліковано** | Є на сайті, нових змін немає |
| **Є зміни** | На сайті стара версія, а збережена чернетка новіша |

- **Зберегти чернетку** — не публікує; чернетка з неправильним значенням (понад ліміт, не той формат) не зберігається,
  порожнє обов'язкове поле чернетці не заважає.
- **Опублікувати** — питає «Опублікувати на сайті?» (можна вимкнути «Більше не питати», повернути — Налаштування →
  Редагування) і попереджає, якщо в якихось мовах бракує перекладу. Публікує чернетку мови, що відкрита.
- **Прибрати з сайту** — знімає з публікації, нічого не стираючи (оборотно): запис стає «Чернеткою», зберігає адресу
  й останню версію. Знову **Опублікувати** — повертає.
- **Видалити** (кошик у вікні редагування) — остаточно, лише для запису, якого немає на сайті (знятий або оригінал
  ще не опубліковано; у перекладі — за станом оригіналу); адреса звільняється, файли знову можна видаляти. Скасувати
  не можна.
- **Ручний порядок** (типи з `order: 'manual'`) діє одразу, без Publish; перетягується за ручку, знятий запис лишається
  на своєму місці.
- **Lock**: запис редагує один користувач; інші бачать опубліковану версію й банер. **Історія** — публікації й
  Restore (кладе версію в чернетку).
- **Хто що може**: редагувати — `pages.edit`; публікувати, знімати, видаляти, міняти порядок — `pages.publish`
  (Admin і Owner).

## 11. Чекліст

**Нова статична сторінка.** Файл `pages/[[locale]]/<name>.vue` → `useCmsPage('<key>')` → примітиви з `field-key` і
дефолтами у слотах → рядок у `pages` в `cms.content.ts` → відкрити Pages → Редагувати, опублікувати.

**Новий тип запису з адресою.** `types.<key>` з `route` → файл маршруту `[slug].vue` з `useCmsEntry` (404 вашою логікою)
→ сторінка списку з `useCmsEntries` + `<CmsEntries>` → hreflang / noindex → `npm run build` (перевірка маршрутів).

**Новий тип без адреси.** `types.<key>` з `fields` → картка з примітивами за `CmsEntryContent['<key>']` →
`useCmsEntries` + `<CmsEntries>` на потрібній сторінці → Content → «Додати».

**Типові помилки:** `route` і `fields` разом; ручний порядок разом з `route`; значення, перетворене перед передачею в
примітив; запис поза `<CmsEntries>`; колекція без стабільних `id`; читання `useCmsEntries` до `await` сторінки зі
збереженим вибором; сторінка під `/admin`; допис у `cms.config.ts` значень, що не серіалізуються.

## 12. Що ще не підтримується

Redirect зі старої адреси запису; права на рівні типу; фільтри записів за полями, категорії, зв'язки; власне поле форми
(компонент Client); поля `file`, галерея, теги, колір, повторювані групи; масове видалення, кошик і відновлення;
«Відкинути чернетку» (повернутись до опублікованої версії); публікація всіх мов однією дією; індикатор неперекладених
мов у списку записів. Повний список — MASTER_PLAN §3 «Відкладено».
