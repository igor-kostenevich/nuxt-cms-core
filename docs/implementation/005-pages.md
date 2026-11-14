# 005 — Pages як content entity (published read)

Перша контентна сутність: code-defined сторінка Client Project читає свій опублікований контент
з БД. Це зріз як 002, тільки для контенту: таблиці, репозиторій, composable, playground. Запису
немає.

Головне в епіку — storage model. Вона мусить прийняти Draft (007) і локалізацію (010) без
міграції даних, тому рішення D-02…D-05 закрито до плану (MASTER_PLAN C-41…C-45).

Джерела: architecture.md Summary §6–7, §12, §15; Б5 §10–11; Б12 §11–12, §41; Б20 §39.

## Що зроблено

- Міграція `supabase/migrations/20261115120000_cms_pages.sql`: `cms_pages` і `cms_page_published`,
  RLS і grants лише на `select` для `anon` і `authenticated`.
- Generated types `app/data/database.types.ts` (скрипт `npm run gen:types`). Обидва клієнти,
  `app/data/supabase.ts` і `app/data/supabase-auth.ts`, тепер `SupabaseClient<Database>`.
- Domain type `app/types/pages.ts` (`CmsPage`, `CmsPageContent`).
- Repository `app/data/repositories/pages.repository.ts` з єдиним методом `getByKey(key, locale)`.
- Composable `app/composables/useCmsPage.ts` на `useAsyncData`.
- `defaultLocale` у `cms.config.ts` (`src/config.ts`), дефолт `'en'`.
- Playground: `defaultLocale: 'uk'`, `/` читає `home`, `/about` показує сторінку без рядка.
  Фікстура `home/uk` лежить у `supabase/seed.sql`.
- Тести: `tests/pages-repository.test.ts` (Vitest) і `supabase/tests/database/cms_core.test.sql`
  (pgTAP, `npm run test:db`).

Потік даних:

```
playground/app/pages/index.vue → useCmsPage('home') → PagesRepository.getByKey('home', 'uk')
  → anon Supabase client → cms_page_published ⋈ cms_pages
```

## Ключові рішення

**Identity і контент — окремі таблиці (C-41).** `cms_pages` має лише `id`, `key`, `created_at`.
Контент лежить у `cms_page_published`, по одному документу на `(page_id, locale)`. RLS рядкова
(C-06), тож Draft у 007 буде окремою таблицею тієї самої форми, а не колонкою поруч із published.
Locale входить у первинний ключ уже зараз, тому в 010 рядки не переписуються: з'являється таблиця
мов і, ймовірно, FK.

**Контент — один JSONB-документ, а не колонки чи `page_fields`.** Структура сторінки живе у Vue
(C-01). Для БД це справді неструктуровані дані, тобто JSON доречний і за C-09. Таблиця з рядком на
поле була б EAV. Схема перевіряє лише, що документ — об'єкт. Формат адрес полів усередині
(dotted path чи nested) вирішує D-08 у 006: репозиторій і composable документ не розбирають.

**Немає рядка — немає помилки (C-42).** `maybeSingle()` повертає `null`. Сторінка без
опублікованого контенту рендерить дефолти зі свого коду. Тому Client Project не мусить
реєструвати сторінки чи писати seed-міграції. Рядок створить RPC під сесією редактора в 008.
Core-міграція сторінок не вставляє: сторінки належать Client.

**`key`, а не slug (C-43).** Route статичної сторінки живе в коді, тож slug у БД нічого б не
визначав і міг би розійтися з роутером. `key` — ідентифікатор у коді, kebab-case, і схема його
перевіряє. Template pages (Products, Blog) — записи колекцій із власним slug (014). Тому
`getBySlug()` з початкового опису епіку став `getByKey()`.

**Один запит на сторінку.** Фільтр за `key` іде через inner join (`page:cms_pages!inner(key)`),
тож окремого запиту за `id` сторінки немає. `useAsyncData` з ключем `cms:page:<key>:<locale>`
передає результат у SSR payload, і клієнт не повторює запит після гідратації.

**Locale з `cms.config.ts` до 010 (C-44).** До локалізації мова на сайті одна, і її задає
розробник. Значення серіалізоване і дозволене C-27. Формат канонічний BCP 47 (`uk`, `en-GB`,
`zh-Hant`, `es-419`), один і той самий у `CMS_LOCALE_PATTERN` (`src/config.ts`) і в
check-constraint `cms_page_published_locale_format`. Так одна мова має одне написання: `en-gb` і
`en-GB` не стануть двома рядками PK, а таблиця мов у 010 зможе на них посилатися. Невалідний
`defaultLocale` (`uk_UA`, `UK`) `resolveCmsConfig` відкидає з причиною `format`, і build
попереджає. Без цього читання мовчки повертало б `null`, і всі сторінки показували б дефолти.
У 010 locale стане значенням запиту.

**`useCmsPage`, а не `usePage`.** Composable глобальний (публічне API), а композабл Client з тим
самим ім'ям мовчки перекрив би його (ризик з C-40). `usePage` — надто поширене ім'я.

**Generated types — з локальної схеми, файл комітиться (C-45).** Скрипт пише у тимчасовий файл і
замінює `app/data/database.types.ts` лише при успіху, тож без запущеного Supabase закомічений файл
не обнуляється. Запускати після кожної міграції. У `PagesRepository` тип рядка виведений із запиту
(`selectPublished()`), а не задається вручну. Тому описка в колонці чи перейменування ламає
typecheck. Перевірено: `contnt` замість `content` дає `SelectQueryError`. Ручні Row-інтерфейси
settings і cms-users лишилися: з типізованим клієнтом typecheck проходить, тож переписування було
б рефакторингом «для стилю». Repository все одно мапить row у domain type, тож назовні
generated types не виходять.

**Smoke-тест міграцій — pgTAP (C-45).** `supabase test db` працює без npm-залежностей і
перевіряє RLS і grants там, де вони живуть: під ролями `anon` і `authenticated`. Тест
самодостатній: власна фікстура в транзакції з rollback, від seed не залежить. Перша перевірка
загальна: кожна таблиця `public.cms_*` має увімкнений RLS. Майбутня таблиця без RLS впаде тут.

## Перевірено

- `supabase db reset` застосовує всі чотири міграції і seed.
- `npm run test:db`: pgTAP, 15 тестів, PASS. Перевірено RLS на всіх `cms_*` таблицях,
  check-constraints (`key`, `locale` включно з неканонічним `en-gb`, `content` — об'єкт), читання
  під `anon`. Під `anon` і
  `authenticated` insert / update / delete у `cms_pages` і `cms_page_published` дає `42501`, insert
  у `cms_site_settings` під `anon` — теж `42501`.
- `npm test`: 12 файлів, 92 тести (включно з форматом `defaultLocale`). `npm run typecheck`, `npm run lint`: exit 0.
- `npm run build` + сервер з `.output`:
  - SSR `/` рендерить `hero.title` і `hero.lead` з `cms_page_published` (uk). Payload містить ключ
    `cms:page:home:uk`;
  - `/about` без рядка в БД рендерить дефолти без помилки;
  - зміна `content` у БД видна на наступному запиті без перезапуску.
- Bundle (C-21, вручну): 16 JS-чанків, на які посилаються `/` і `/about`, не містять
  `createBrowserClient` / `createServerClient`, `cms_locale`, `cms-admin`, `vee-validate`,
  `AdminShell`, `cms_users`. Admin CSS ці сторінки не вантажать. Маркери є в admin-чанках, тобто
  перевірка не холоста.
- Відсутність повторного запиту на клієнті в браузері (Network) не перевіряли: висновок
  спирається на ключ у payload.

## Обмеження

- Тільки читання. Ні клієнт, ні редактор не можуть створити чи змінити сторінку. Дані є лише
  з seed або SQL.
- `CmsPageContent` — `Record<string, unknown>`: шаблон сам звужує тип (див. playground). Типізований
  доступ до полів з'явиться з primitives (006).
- Locale один на збірку. Два сайти з різною мовою на одному build неможливі до 010.
- `gen:types` вимагає запущеного локального Supabase. Розбіжність файлу типів і міграцій ніщо
  автоматично не ловить, CI — 016.
- `test:db` вимагає Docker і не входить у `npm test`.

## Після ревʼю

- Ручний `PublishedPageRow` з `.maybeSingle<Row>()` перекривав виведений тип, і generated types
  нічого не перевіряли. Тепер тип рядка виведений із запиту.
- Regex locale пропускав `en-gb` поруч з `en-GB`. Тепер формат канонічний і однаковий у SQL і в
  config, а `defaultLocale` перевіряється на build. Міграцію виправлено на місці: пакет не
  опублікований.
- `gen:types` більше не обнуляє файл типів, якщо Supabase не запущений.

Питання ревʼю до наступних епіків:

- **Гранулярність Publish — закрито як C-46.** Мови публікуються окремо: нову мову додають і
  наповнюють поступово. `published_at` на `(page_id, locale)` саме це і моделює.
- **Мовонезалежні поля — відкрито як D-60 (010).** mediaId, посилання, перемикачі. У C-41 увесь
  контент лежить у документі на locale, тож з другою мовою вони дублюються. Мова без документа
  рендерить дефолти коду, без fallback на default locale. Обидва варіанти виправлення
  адитивні: спільний документ на сторінку і fallback у репозиторії. До 010 мова одна, тож
  проблеми ще немає. Нагадування стоїть і в 006 (D-08 не має її закрити).

## Що свідомо не робили

Draft, Revisions, Publish, Edit Mode, RPC `cms_ensure_page` (008), write-policies і grants, slug,
template pages, `getAll()` (немає споживача), `updated_at` / `deleted_at` / `published_by`
(007), таблиця мов і локалізація UI (010), SEO-поля, generic CRUD / BaseRepository, `Cms*`
primitives (006).
