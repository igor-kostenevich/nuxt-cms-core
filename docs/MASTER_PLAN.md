# CMS Core — головний план проекту

Верхньорівневий план `nuxt-cms-core`: від нього пишуться детальні плани епіків.
Тут немає файлів, кроків реалізації і схем таблиць — це рівень плану епіку.

- Архітектурна дока (почищена копія): [`docs/source/architecture.md`](./source/architecture.md).
  Оригінал — [Google Doc](https://docs.google.com/document/d/1iL23fjzqbNOZZedsEpg-Qgf7vGQROQdYSCVScSt9q3o/edit).
- Журнал епіків і записи реалізації: [`docs/implementation/README.md`](./implementation/README.md),
  `docs/implementation/00N-*.md`.
- Правила коду: [`.cursor/rules/project.mdc`](../.cursor/rules/project.mdc).

Дата аудиту доки й складання плану: 2026-11-14.

---

## 1. Як користуватися

### Ієрархія джерел правди

1. **Цей файл** — канонічні рішення (§2) і реєстр відкритих рішень (§6).
2. Architecture Summary у `docs/source/architecture.md`.
3. Найновіша версія відповідного блоку доки.
4. Найпростіше рішення, яке відповідає принципам.

Запис реалізованого епіку (`00N-*.md`) описує, що **зроблено**. Якщо він розходиться
з цим файлом, це drift: його фіксують у §3 і виправляють або код, або план.

### Цикл роботи над епіком

1. Беремо наступний епік зі статусом `todo` (§4), не перестрибуючи через залежності.
2. Перечитуємо його розділ тут, канонічні рішення (§2) і наскрізні обмеження (§5).
3. **Закриваємо блокуючі відкриті рішення** епіку з реєстру (§6) — питаємо автора,
   не вигадуємо схему чи API. Рішення переноситься в §2 як канонічне.
4. Пишемо план епіку (формат як 002: чому цей блок, anti-scope, файли, перевірка,
   що свідомо не робимо).
5. Реалізація → запис `docs/implementation/00N-*.md` → `/epic-review <id>` (4 субагенти, див. CLAUDE.md).
6. Оновлюємо статус епіку тут і в README; нові знахідки — у §3 / §6 / §7.

Головний принцип розробки: маленькі завершені зрізи, рішення — лише коли вони реально
потрібні. Не проєктуємо Draft, Media, Lock і Edit Mode одночасно.

---

## 2. Канонічні рішення

Ці правила важливіші за будь-які формулювання доки. Посилання `§N` — розділ
Architecture Summary, `Б N` — блок доки.

### Межі системи

- **C-01. CMS — content editor, не page builder.** Структура сторінок живе у Vue/Nuxt
  Client Project. CMS не зберігає `sections[]` / component tree / layout. Page — routable
  content entity (§6, Б12). Дизайн-ТЗ адмінки — макет, не набір обмежень Core: Home/About,
  5 форм, Products — приклади UI.
- **C-02. Core vs Client.** Core repositories: Pages, Media, Forms, Languages, Settings,
  Activity, Revisions, Users. Client: Products, Doctors та будь-яка бізнес-сутність сайту.
  Client Project може містити wiring (repositories, registrations, `cms.config.ts`,
  бізнес-інтеграції), але не дублює універсальну CMS-логіку (§5, §16).
- **C-03. Business Collection ≠ local repeatable.** Product/Doctor/Blog — окремі сутності
  (у Client Project). `Hero.benefits[]`, FAQ — масив у контенті сторінки через
  `CmsCollection`, без окремої таблиці й розділу Admin (§13–14).

### Дані

- **C-04. Repository має лише методи своєї сутності.** Без універсального CRUD/Publish.
  `BaseRepository` / factory — лише коли дві реальні сутності почнуть дублювати код (§15, 002).
- **C-05. Supabase-клієнти.** Anon-клієнт для public read — singleton. Клієнт із сесією
  на сервері — тільки на request event, ніколи в module scope (інакше сесія одного
  користувача потрапить у запит іншого). Реалізовано в `app/data/supabase.ts`,
  `app/data/supabase-auth.ts`. SSR-читання — тільки через `useAsyncData` (інакше подвійний
  запит сервер + клієнт).
- **C-06. RLS — рядкова, не колонкова.** Усе, що anon-ключ може прочитати в рядку, він
  прочитає. Тому Draft не може лежати в одному рядку з Published під anon `select`, а
  непублічні налаштування не живуть у `cms_site_settings`.
- **C-07. Атомарні операції — Postgres-функції (RPC).** Publish, Restore, acquire/heartbeat/
  release lock виконуються однією функцією в транзакції. Side effects (cache revalidation,
  нотифікації) — після commit, best-effort.
- **C-08. Mutations через RLS.** Кожна mutation має RLS policy або йде лише через security definer
  RPC, яка перевіряє `cms_can()` (Draft / Publish / Lock, 007); UI `can()` — не захист.
  Update/delete, відфільтровані RLS, повертають 0 рядків, а не помилку — repository мапить
  це на `permission_denied` / `not_found`.
- **C-09. Схема бізнес-зрозуміла.** Окремі таблиці на сутність, без EAV/`entities`.
  JSON — лише для immutable snapshot або справді неструктурованих даних (§12). Навігація,
  мови, інтеграції — окремі таблиці, не колонки `cms_site_settings` (002).
- **C-10. Generated Supabase types** — з 005. Smoke-тест міграцій — з 005.

### Контент

- **C-11. Draft / Published / Revision розділені.** Public ніколи не читає Draft. Один
  спільний Draft на сутність. Revision immutable, мінімально — на Publish. Restore створює
  Draft, не переписує Published. Cache invalidation після Publish — разом із першим публічним кешем
  (ISR / SWR, 016): у 007 кешу немає, кожен SSR-запит читає БД (§18–19).
- **C-12. History ≠ Undo.** Undo/Redo — локальна editor-session. Revisions — server-side.
  `editor.historyLimit` у config — розмір Undo stack (§19). *Факт 008:* ключ є в `cms.config.ts` (1–500,
  дефолт 100); вкладені групи конфігу зливаються ключ за ключем.
- **C-13. Concurrency = Content Lock.** Одна entity → один active editor, heartbeat,
  expiration, force unlock за правом, read-only для інших. Version checking — лише
  страховка (§20, Б8 Content Lock).
- **C-14. Media metadata.** Media entity має default alt/focal point; конкретне використання
  `CmsImage` — override (і по мовах). Контент зберігає `mediaId`, не URL (§22).
- **C-15. Localization = v2 + Summary §21.** Перекладаються бізнес-дані, не структура.
  Патерн `entity` + `entity_translations`; slug — у перекладі; мови — у БД, нова мова без
  migration/deploy; мову можна сховати з сайту або видалити разом із перекладами (C-83, рішення автора
  2026-11-18). Правила з ранньої v1 —
  у Б9 §22 «Доповнення». Порядок: тільки епік 010.

### Auth і безпека

- **C-16. Ролі V1 — owner / admin / editor.** Статична матриця `can()` (TS) і `cms_can()`
  (SQL) мають бути ідентичні. Роль читається з `cms_users`, не з JWT claims і не з
  `user_metadata` (зміна ролі діє одразу). Права іменуються `<entity>.<action>`
  (`pages.edit`, `pages.publish`, `settings.update`, `users.manage`).
- **C-17. Secrets двох типів.** Bootstrap (`SUPABASE_URL`, publishable key, `SUPABASE_SECRET`)
  — лише `.env` / hosting. Owner-managed (Telegram, SMTP, Stripe) — окремий secure layer,
  не runtime settings і не env через UI. Підключення самого Supabase не може бути сторінкою
  всередині CMS (§28).
- **C-18. Setup Wizard — поза V1.** Перший Owner у хмарі — ручний SQL (задокументований),
  потім CLI (016).
- **C-19. Settings → Users — 015.2:** `SUPABASE_SECRET`, server-only клієнт, Nuxt server
  routes для invite / role / deactivate, захист останнього Owner у БД + тест.
  `profiles` (ім'я, аватар) — разом із ним; до того Activity показує email.
  *Змінено в 011:* `SUPABASE_SECRET` і server-only клієнт (`server/cms/supabase.ts`) з'явились у формах
  (C-91); 015.2 бере їх готовими.
- **C-20. Server routes із secret key** спершу верифікують користувача (`getUser()` /
  `getClaims()`, не `getSession()` з cookie) і перевіряють `cms_can()`.
  *Виняток 011:* публічний маршрут форм (C-91) — користувача там немає. Ключ у ньому викликає лише
  `cms_form_submit`, а сама функція обмежує, що можна записати.

### Runtime і UI

- **C-21. Три runtime-зони.** Public не завантажує Editor/Admin/Tiptap/admin CSS. Перевірка
  бандла — частина Definition of Done; ручна з 004a, з 006 — `npm run check:bundle` (§9, §33).
- **C-22. Edit Mode — `/admin/edit/...`**, рендерить **ту саму** клієнтську сторінку.
  Немає `EditableAboutPage.vue`. Editor Runtime — dynamic import після входу в Edit Mode (§10).
- **C-23. Стилі Core — нативний CSS.** CSS-змінні (токени UI kit) + scoped CSS. Без Tailwind
  і SCSS у Core; Client може використовувати Tailwind для свого сайту. Токени адмінки — під
  `.cms-admin`; `runtime.css` — з першим технічним стилем public primitives (у 006 не знадобився), `editor.css` — з 008. Ізоляція — через компонент-обгортку,
  не через layout.
- **C-24. UI primitives адмінки — `Admin*`** (`AdminButton`, `AdminInput`, `AdminAlert`…),
  не `Base*`. Public `Cms*` primitives не будуються на admin-компонентах.
- **C-25. Переклади адмінки ≠ переклади сайту.** Admin i18n — частина Core в усіх проектах,
  з префіксом ключів `cms.*`, вантажиться лише в Admin/Editor Runtime, не зливається з locales
  Client Project і не потрапляє в public bundle. Механізм — C-36.
- **C-26. Залежності.** VueUse — дозволена залежність Core (tree-shaken імпорти). Утиліти, які
  VueUse вже має (debounce, clipboard, event listeners, storage, media queries тощо), беремо з
  нього, а не пишемо вручну. Зараз його в `dependencies` немає: доданий у 004b `@vueuse/core` ніде
  не імпортувався і після ревʼю 001–004c його прибрали. Перший епік, якому знадобиться утиліта,
  встановлює `@vueuse/core` і використовує його. Pinia —
  лише разом з Editor Engine (008). `vee-validate` — тільки для адмінки, не потрапляє в public
  bundle і не нав'язується Client Project.
  *Факт 008:* `@vueuse/core` встановлено (події, rAF, інтервал heartbeat, click outside). Pinia не
  знадобилась: Engine — reactive store через provide / inject. Додано `@tiptap/vue-3`,
  `@tiptap/starter-kit`, `@tiptap/pm`, `@floating-ui/dom` — лише в Editor Runtime.
- **C-27. `cms.config.ts` — лише серіалізовані значення** (modules, feature flags, ліміти).
  Він вбудовується в `#cms/config` і потрапляє в client bundle. Реєстрації з функціями чи
  repositories (колекції, форми, інтеграції) — runtime-код Client Project.
- **C-28. Конфігурація — п'ять рівнів:** Core defaults / `cms.config.ts` / DB Runtime Settings /
  env (через runtimeConfig; різні env на одному build — `NUXT_*` override) / Project Manifest.
  `app.config` для site settings не використовується.

### Дистрибуція і релізи

- **C-29. Назви:** пакет `nuxt-cms-core`, CLI `nuxt-cms`. Ігнорувати `igor-cms`, `@igor/cms-core`.
- **C-30. Публічний npm** без scope (приватні пакети на npmjs платні; GitHub Packages вимагає
  scope і токен на кожен install). Перед першим publish: назва вільна, без `"private": true`,
  поле `bin` для CLI.
- **C-31. SemVer:** patch — fixes; minor — features і **additive** міграції; major — breaking
  changes / breaking міграції + migration guide.
- **C-32. Деплоїться Client Project, не Core.** Кожен клієнт — власні Nuxt deployment, Supabase,
  Storage, secrets, domain. Немає центрального CMS-сервера (§35).
- **C-33. Testing:** Vitest + Nuxt Test Utils. E2E за замовчуванням немає. Тести — permissions,
  Publish, Lock, критичні repository workflows, міграції; не UI snapshots (§34).

### Розкладка по епіках (із «Зафіксовано після 004a»)

- **C-34.** Soft delete / Trash — по сутностях: Pages у 015 (разом зі списком Pages; перенесено з
  007 — для code-defined сторінки видалення має сенс лише для рядка-сироти, видимого в списку), Media
  у 009, Collections у 014.
- **C-35.** Maintenance mode і robots/indexing на публічному сайті — 015 (поле вже в `cms_site_settings`).

### Закрито в 004c

- **C-36. Admin i18n — власний `useAdminI18n()`, не `@nuxtjs/i18n` (було D-01).** Модуль у layer
  реєструє глобальний плагін в app entry. Через це vue-i18n потрапляв на публічний сайт, а locales
  і strategy Core зливалися з i18n Client Project. Тепер: словники `app/admin/locales/*.json` (не в кореневій
  `i18n/` — це дефолтна папка `@nuxtjs/i18n`), ключі `cms.*`.
  Composable дає dotted lookup, `{param}`-інтерполяцію і fallback на `en`. Locale береться з cookie
  `cms_locale`, потім з `Accept-Language`, і передається в SSR payload через `useState`.
  Composable викликають лише admin-компоненти, тож словники лежать в admin-чанках. Linked messages,
  pluralization і lazy per-locale — лише коли знадобляться.
- **C-37. Docker — для локального Supabase, не для деплою (було D-54).** Локальний стек
  (`supabase start`) — дефолт для розробки Core і обов'язковий для integration-тестів (з 007).
  Без Docker — окремий хмарний dev-проєкт через `supabase link`. Деплой Client Project Docker не
  потребує. Обидва шляхи — у README.

### Зафіксовано після ревʼю 001–004c

- **C-38. Префікс `cms_` для всіх Core-таблиць.** Core-таблиці лежать у `public` поруч із
  таблицями Client Project, тому мають префікс `cms_` (`cms_users`, `cms_site_settings`). Те саме для
  назв policies і constraints. До першого publish міграції 002–004b переписано на місці з
  префіксом, тож перейменування в історії міграцій немає. Модель міграцій (D-50) лишається
  відкритою.
- **C-39. Вихід з адмінки — лише поточна сесія.** `signOut({ scope: 'local' })`: одна Auth-система
  з майбутнім `/account`, тому вихід із CMS не закриває сесії на інших пристроях.
- **C-40. Композабли адмінки — не глобальні auto-imports.** `useAdminI18n`, `useAdminSettings`,
  `useAdminValidation` і майбутні `useAdmin*` лежать в `app/admin/`, а admin-компоненти імпортують
  їх явно. У layer композабл Client Project з тим самим ім'ям мовчки перекриває композабл Core, тож
  кожне глобальне admin-ім'я — шанс зламати адмінку. Крім того, після першого publish прибрати
  auto-import означало б major-версію (C-31). Глобальними лишається публічне API: `useCms`,
  `useCmsAuth`, `usePermissions`, `useSiteSettings`, `useCmsPage` (005).

### Закрито перед 005

- **C-41. Сторінка — identity + документ на (page, locale) (було D-02).** `cms_pages` — лише
  identity (`id`, `key`), `cms_page_published` — один JSONB-документ на `(page_id, locale)`. Draft
  у 007 — окрема таблиця такої самої форми (C-06). Locale входить у ключ із самого початку, тож 010
  додає таблицю мов без переписування рядків. Форма документа всередині — вкладена (C-48).
- **C-42. Рядок сторінки створюється lazy (було D-03).** Немає рядка або published-документа →
  публічне читання повертає `null`, шаблон рендерить дефолти з коду. Рядок створює RPC під сесією
  редактора на першому вході в Edit Mode (008). Core-міграції сторінок не вставляють. У playground
  вони беруться з `supabase/seed.sql`.
- **C-43. `cms_pages` — лише статичні code-defined сторінки, за `key` без slug (було D-04, D-05).**
  Route живе в коді Client Project, `key` — ідентифікатор у коді (`home`, kebab-case), не URL. Template
  pages (Products, Blog) — записи колекцій (014), slug у їхніх перекладах (C-15). «Create page» у
  дизайн-ТЗ означає створення запису template-типу колекції, а не рядка `cms_pages`.
- **C-44. До 010 locale контенту — `defaultLocale` у `cms.config.ts`** (дефолт `'en'`). У 010 джерелом
  стане таблиця мов; коди в уже записаних рядках лишаються валідними. Формат — канонічний BCP 47
  (`uk`, `en-GB`, `zh-Hant`, `es-419`), однаковий у SQL-домені `cms_locale` і `CMS_LOCALE_PATTERN`; невалідний
  `defaultLocale` відкидається на build з попередженням. Мовонезалежні поля і fallback на default
  locale — D-60 (010).
  *Факт 010:* мови — у `cms_languages` (C-83); `defaultLocale` лишився bootstrap-мовою, поки таблиця
  порожня. Мовонезалежні поля і fallback — C-78.
- **C-46. Publish — на entity × locale (було D-26).** Кожна мова публікується окремо: нову мову
  додають і наповнюють поступово по всьому Client Project, не чіпаючи опубліковані мови. Модель
  C-41 це вже підтримує (`published_at` на `(page_id, locale)`). Draft і ревізії в 007 будуються
  так само per-locale.
- **C-45. Generated types і smoke-тест міграцій.** Типи — `npm run gen:types` (локальна схема →
  `app/data/database.types.ts`, комітиться), обидва Supabase-клієнти типізовані `Database`.
  Smoke-тест — pgTAP у `supabase/tests/database/`, `npm run test:db` (`supabase test db`, потрібен
  Docker). У `npm test` не входить. Тест перевіряє, що кожна таблиця `cms_*` має RLS.

### Закрито перед 006

- **C-47. Primitive отримує значення через prop `value` + `fieldKey`, без `v-model` (було D-06).**
  Дані йдуть в один бік: сторінка передає `:value="hero.title"` і `field-key="hero.title"`, primitive
  нічого не емітить. Змінює значення лише Editor Engine (008): primitive викликає
  `editor.updateField(fieldKey, value)`, а `useCmsPage` в Edit Mode віддає Draft з Engine, тож новий
  `value` приходить сам. Так значення живе в одному місці, і Undo / Reset / Publish працюють з одним
  документом. `v-model` писав би в стан сторінки (`useAsyncData`), форми якого Engine не знає.
  Варіант «primitive читає з контексту за `fieldKey`» втрачає типізацію полів сторінки. Ціна — адреса
  пишеться двічі; у 008 Edit Mode у dev попереджає, якщо `value` не збігається зі значенням за
  `fieldKey` в Engine. Дефолт із коду (C-42) — вміст slot, а не `value ?? '…'`: Engine має відрізняти
  значення з БД від дефолту (Reset, placeholder). `v-model` / `modelValue` у прикладах доки читати
  так само (§10).
  *Факт 008:* Engine пише через `engine.set(key, value)` з editable-гілки. Dev-попередження «`value`
  не збігається з `fieldKey`» не зроблено — перенесено в 008b (див. залишок 008b у §4).
- **C-48. Документ контенту — вкладений, адреса поля — dotted path (було D-08).** `{ hero: { title } }`,
  адреса `hero.title`. Сегменти — `[a-zA-Z0-9_-]`, без крапок, тож розбір однозначний. Локальні
  колекції (C-03) — масиви елементів з полем `id`; сегмент після масиву — `id` елемента, не індекс
  (`services.items.<id>.title`), порядок задає масив. `id` генерує клієнт (`crypto.randomUUID()`,
  Engine на «Add item»): без запиту на сервер і з локальним Undo. Адреса відносна до сутності: для
  сторінки — шлях у документі, для запису колекції (014) — поле, яке мапить її repository. Адреса не
  містить locale і значення не розгалужується за мовою, тож D-60 лишається відкритим: спільний
  документ і документ мови зливаються в одне дерево з тими самими адресами. Умова на 010 — `id`
  елементів однакові в усіх мовах (нова мова копіює документ разом з `id`).
  *Факт 010:* документ не копіюється. Переклад зберігає листи за тими самими адресами, тож `id`
  спільні за побудовою (C-78).
  *Факт 008:* `id` нового елемента — 6 символів base36, унікальні в межах колекції (адреси коротші за
  UUID). Дефолтні елементи з коду мають `id` `default-N`. *Змінено в 010d (C-88):* власний `id` елемента
  в `defaults`; `default-N` — лише fallback, коли id є не в усіх. Формат значення `CmsCollectionValue` — C-67.
- **C-49. Rich text — ProseMirror/Tiptap JSON + власний renderer (було D-07).** Схема — дефолтні назви
  Tiptap StarterKit, обмежений набір (Б3 §14): `doc`, `paragraph`, `text`, `hardBreak`; marks `bold`,
  `italic`, `link`. Тому Tiptap у 008 пише той самий JSON без конвертації (*факт 008:* перед записом
  `normalizeRichText` лише прибирає атрибути Tiptap — `rel`, `class`, `target: null` — і невідомі
  вузли). Renderer рендерить лише
  відомі вузли й marks через `h()`, без `v-html`; невідомі ігнорує; `href` — лише `http(s)`, `mailto`,
  `tel`, `//host`, шляхи сайту `/…` і якорі `#…` (`toSafeHref()`, той самий allow-list у `CmsLink` /
  `CmsButton`). Запис іде з браузера через RLS, тож безпеку дає renderer, а не довіра до вмісту.
  Sanitized HTML відкинуто: санітизація на кожному рендері (DOMPurify + DOM-шім на SSR) у public
  bundle або неможлива санітизація в Postgres. `CmsRichText`-renderer входить у 006: формат значень —
  стабільний контракт (Б3 §31), і він має бути зафіксований до Draft (007). Нові вузли/marks — лише
  адитивно.

### Закрито перед 007

- **C-50. Draft — окрема таблиця `cms_page_draft` тієї самої форми, що й published (було D-09).**
  Anon до неї доступу не має, читає лише `pages.edit`, пише лише RPC. Рядок lazy: з'являється на першому
  Save Draft. Формат locale — спільний домен `cms_locale` (міграція pages) для всіх таблиць, що його
  зберігають.
- **C-51. Ревізія — знімок нової опублікованої версії (було D-10).** Перша публікація теж створює
  ревізію, тож остання ревізія дорівнює Published. `cms_page_published` лишається самодостатнім (без
  join на ревізію), дублювання свідоме. Кількість ревізій у V1 не обмежена; retention — коли обсяг
  стане проблемою.
- **C-52. Правила полів живуть на primitives, сервер перевіряє лише інваріанти (було D-11).**
  `required`, `maxLength` тощо задає компонент, перевіряє Validation Engine в Edit Mode (008). RPC
  перевіряють право, lock, «content — object» і жорсткий ліміт розміру (512 KB). Декларативної схеми
  полів немає: поле довелося б описувати двічі, а Postgres не виконає JS-схему. Схему можна додати
  адитивно, коли з'явиться правило, яке справді мусить тримати сервер. **Відхід від рекомендації аудиту.**
  R-03 — прийнятий ризик: обійти UI може лише довірена роль `pages.publish`, а рендер безпечний за
  будь-якого вмісту (C-49, allow-list `href`, дефолт зі slot).
- **C-53. Статус сторінки derived, без колонки (було D-12).** Рядок Draft існує лише тоді, коли є
  неопубліковані зміни: Publish його видаляє, Save Draft з контентом, що дорівнює Published, — теж.
  Статуси: Draft (лише draft) / Published / Published зі змінами / немає контенту (дефолти коду).
  Hidden і Unpublish для статичних сторінок немає: маршрут живе в коді Client, CMS його не прибирає.
  Hide — для записів колекцій (D-44).
- **C-54. Дані Content Lock і перевірка токена — у 007, UI — у 008 (було D-13).** Один lock на
  сторінку, спільний для мов. Токен — випадковий на editor-сесію, тому таблиця lock клієнтам не читається
  (C-06). Lock без heartbeat 2 хв може забрати інший користувач; той самий користувач (друга вкладка)
  забирає свій lock одразу. Save Draft / Publish / Restore без валідного токена відхиляються.
- **C-55. Force unlock — окреме право `pages.unlock`, owner і admin (було D-57).**
- **C-56. Activity на Publish — у 012 (було D-14).** Хто і коли опублікував, зберігає ревізія. 012
  додає запис Activity в ту саму транзакцію RPC.
- **C-57. Restore вимагає lock і явного `replace_draft` (було D-56).** Якщо Draft уже є, без
  підтвердження Restore повертає `conflict`. Резервної копії старого Draft немає. Restore останньої
  ревізії при наявному Draft скидає сторінку до Published.
- **C-58. Save Draft і Publish мають однакові серверні перевірки (було D-59).** Різниця — на клієнті:
  Save Draft не блокується `required`, Publish блокується будь-якою blocking error. Жорсткі ліміти
  Edit Mode не дає перевищити вже під час введення.
- **Publish лише зі збереженого Draft (частина D-20).** RPC `publish` не приймає контент, а просуває
  збережений Draft. Для 008 у D-20 лишається лише Undo після Publish.

### Закрито перед 008

Закрито в плануванні 008 (grilling з автором). Обсяг 008 розширено: rich text, колекції, optional,
Undo / Redo і Reset з 008b увійшли в першу версію UI. Деталі — [запис 008](./implementation/008-edit-mode.md).

- **C-59. Рендер сторінки Client під `/admin/edit/[...path]` (було D-15).**
  - Core-сторінка резолвить шлях через `router.resolve` + `loadRouteLocation` і рендерить його через
    `RouterView :route` зі скинутим `viewDepthKey`.
  - Layout — `<NuxtLayout :name="meta.layout">`.
  - `useRoute()` у сторінці Client бачить її маршрут: ми провайдимо `PageRouteSymbol`, внутрішній API
    Nuxt, і це ризик оновлень.
  - Edit Mode рендериться лише в браузері (`ssr: false`, `no-store`).
  - Route middleware сторінки Client не виконується.
  - Admin-сторінки Core мають `layout: false`.
- **C-60. Editor binding — через `useCmsPage` (було D-16).**
  - В Edit Mode `useCmsPage(key)` прив'язує Engine до сутності й повертає документ Engine. Код
    сторінки той самий.
  - Мінімальний Draftable-контракт — `EditorRepository` (`app/editor/engine.ts`).
    *Змінено в 012:* контракт розширено обов'язковим `getRevision(id, key, locale)` — одна ревізія цієї
    сутності й мови або null (перехід з Activity у History, C-96). Сутності з Draft у 014 (колекції)
    реалізують його так само: належність перевіряє сам запит.
  - Одна сутність на сторінку Edit Mode.
- **C-61. Явний Save draft, без автозбереження (було D-17).** Publish з незбереженими змінами спершу
  зберігає (C-55 у силі). Cmd+S. Editor без `pages.publish` бачить лише Save draft.
- **C-62. Save Draft не пише Activity (було D-18).** Publish / Restore лишають ревізію; Activity — 012
  (C-56).
- **C-63. Глобальний контент у першій версії не редагується (було D-19).** Header і footer — звичайний
  код Client; їхні лінки навігують в Edit Mode. Editor-контекст отримує лише сторінка (EditedRoute),
  тож primitives у layout рендеряться публічно; другий `useCmsPage` з іншим ключем — read-only. Сутність із власним Draft / lock — пізніше. Логотип —
  Settings → Brand.
- **C-64. Undo — сесійний стек знімків документа (було D-20).** Одна сесія друку в полі — один крок.
  Publish очищує стек. Delete елемента колекції виконується одразу, з toast «Undo», без модалки. History
  у тулбарі — ревізії з Restore, розведено з Undo (C-12).
- **C-65. Overlay Layer.** Контури, chip типу, затемнення (SVG-маска), контроли й панелі малюються в
  одному fixed-шарі поверх сторінки за `getBoundingClientRect`, а не стилями на елементах Client.
  - Поле, яке перекриває вміст сайту, ховається або обрізається.
  - Виняток — текст: `contenteditable` / Tiptap на справжньому елементі.
  - Затемнення вмикається при вході, toggle — у тулбарі, Alt — тимчасово.
- **C-66. Модель взаємодії і навігація.**
  - Клік по тексту — одразу редагування.
  - Клік по Cms-лінку / кнопці / зображенню / фону / optional — вибір і popover біля поля (не бічна
    панель).
  - Cmd / Ctrl + клік або «Відкрити ↗» — перехід.
  - Звичайні лінки сайту навігують у межах Edit Mode (`/about` → `/admin/edit/about`) з guard
    незбережених змін.
  - Hover не обов'язковий: усе доступне tap і клавіатурою. Desktop-first, планшет підтримується.
  - Preview: поля не редагуються, лінки лишаються в Edit Mode (на публічній сторінці немає Draft).
- **C-67. Нові primitives і формати (адитивно до C-47…C-49).**
  - `CmsCollection` — значення `[{ id, ... }]`. У slot — відносні `field-key` (scope
    `<collection>.<id>`). Дефолти з коду з id `default-N` (*змінено в 010d, C-88:* з власним `id`, `default-N`
    — fallback) копіюються при першій зміні. Обгортки
    `itemTag` / `itemClass`, `min` / `max`, `template`.
  - `CmsOptional` — значення `{ hidden?: boolean }`.
  - `CmsBackground` — `<img object-fit: cover>` позаду slot.
  - `CmsImage` — prop `decorative`.
  - Усі primitives — prop `fieldLabel`; `CmsText` / `CmsRichText` — `required`, `maxLength`.
- **C-68. Зображення в 008 — лише в сесії.** Заміна, alt, decorative, focal не зберігаються до формату
  `CmsImageValue` (D-24, 009). Медіатека-заглушка — зображення сторінки + файли з пристрою.
  *Замінено в 009:* C-74, зображення зберігаються в документі.
- **C-69. Lock UI.**
  - Нова RPC `cms_page_lock_status` — без токена (C-54).
  - Read-only банер; «Забрати редагування» для `pages.unlock` або протермінованої сесії.
  - Банер «сесія неактивна» з «Забрати назад» — зміни лишаються.
  - Heartbeat 30 с. Release при закритті вкладки — `fetch keepalive` з кешованим токеном (R-18).
- **C-70. Рамка Edit Mode.** Сторінка скролиться всередині рамки з `transform`: `fixed` і `sticky`
  елементи сайту лишаються під тулбаром. Ціна — `window.scrollY` в Edit Mode дорівнює 0.

### Закрито перед 009

Деталі — [запис 009](./implementation/009-media.md).

- **C-71. Upload — напряму в Storage + RPC (було D-21).**
  - Браузер вантажить файл у public-бакет `cms-media`. RLS на `storage.objects` перевіряє `cms_can`.
  - Бакет обмежує тип і розмір.
  - `cms_media_create` бере mime і size з метаданих об'єкта: size — фактичний, mime — `Content-Type`,
    який заявив клієнт і пропустив бакет (вміст файла не перевіряється, magic bytes — TODO). Функція
    звіряє розширення шляху з типом і реєструє лише файл, завантажений тим самим користувачем.
  - Insert-policy бакета приймає лише імена формату `<uuid>.<jpg|png|webp|svg>`.
  - Розміри читає браузер.
  - Server route і `SUPABASE_SECRET` не потрібні; ліміт тіла serverless не діє.
  - Перевірка magic bytes — TODO (§3).
- **C-72. Usage — запит по контенту, без registry (було D-22).** `cms_media_usage` шукає `mediaId` у
  published і draft сторінок та в Brand. Revisions не враховуються. Клієнтські колекції — TODO 014.
- **C-73. Оригінали + `width` / `height`, без pipeline (було D-23).** `@nuxt/image` з провайдером
  хостингу — TODO 016 (R-09).
- **C-74. `CmsImageValue = { mediaId, alt?, decorative?, focal? }`, без caption (було D-24).**
  - Alt — перший непорожній з: override у значенні → default alt медіа → prop `alt` з коду.
  - Decorative (prop або значення) дає порожній alt.
  - Focal: значення → default медіа → `position` з коду.
  - Без значення або з видаленим / невідомим медіа рендериться `src` / `alt` з коду.
  - Формат — стабільний контракт, змінювати адитивно.
- **C-75. Типи — JPG / PNG / WebP / SVG, до 5 МБ (було D-25).** SVG рендериться лише через `<img>`.
  Документи й відео — TODO.
  - SVG — документ: якщо відкрити його напряму за URL Storage, скрипти виконуються (перевірено:
    Storage віддає `image/svg+xml` без CSP).
  - Тому адмінка перед upload перебудовує кожен SVG за allow-list (`app/admin/media/svg.ts`): прибирає
    script, `on*`, `foreignObject`, `animate` / `set`, зовнішні й `javascript:` / `data:` посилання,
    небезпечний CSS. Файл, який не розбирається як SVG, відхиляється.
  - *Залишковий ризик:* це не межа безпеки. CMS-користувач, який вантажить напряму через API, очистку
    обходить (C-71). Серверна перевірка — TODO.
- **C-76. `mediaId` → URL резолвить репозиторій (було D-61, нове).**
  - Читання сторінки (published і draft) одним RPC повертає документ і media, на які він посилається.
  - `useCmsPage` провайдить мапу primitives.
  - SSR без запиту на кожне зображення.
  - Brand-медіа приходять із `useSiteSettings()`.
- **C-77. Права на медіа.** `media.upload` і `media.edit` (метадані, Replace) — owner / admin / editor;
  `media.delete` — owner / admin. Soft delete: RLS ховає рядок від усіх клієнтів, файл лишається.
  Storage-policy не дає видалити файл, на який посилається будь-який рядок `cms_media`, живий чи
  видалений; прибирання — TODO 015.

### Закрито перед 010

Деталі — [запис 010](./implementation/010-localization.md).

- **C-78. Сторінка мовою — база + переклад (було D-27, D-60).**
  - Документ мови за замовчуванням — повне дерево, як і раніше. Це база: структура (колекції, їхні
    `id` і порядок), `mediaId`, focal, decorative, `href`, `newTab`, `hidden` і тексти цієї мови.
  - Документ іншої мови — переклад: плаский об'єкт перекладених листів за адресою (C-48).
    Листи — текст, rich text, `label` лінка / кнопки (`<key>.label`) і alt (`<key>.alt`).
  - Мова читається як база з накладеним перекладом (`applyTranslation`). Чого немає в перекладі,
    показується мовою за замовчуванням — це і є fallback на рівні поля.
  - Структуру й мовонезалежні поля редагують лише мовою за замовчуванням. У мові перекладу ці
    контроли read-only.
  - *Доповнено в 010b:* елемент колекції, що досі є дефолтом із коду, теж перекладається.
    - Переклад зберігається за його id `default-N`.
    - У документі мови це об'єкт `{ 'default-0': { title } }` замість масиву; `CmsCollection` кладе
      його поверх дефолтів (`withOverrides`).
    - Коли основна мова збереже колекцію, id лишаються ті самі, і переклад не губиться.
    - Не перекладається лише елемент, видалений основною мовою.
    - *Змінено в 010d:* id елемента з коду — його власний `id` у `defaults` (C-88); `default-N` — лише
      fallback.
  - Таблиці, Draft / Publish / Revisions і їхні RPC не змінились: переклад — такий самий об'єкт на
    `(page, locale)`. Ревізія пам'ятає роль (`base`) — *legacy після 010d (C-87):* нові ревізії однієї
    ролі, колонку прибрати в 012.
  - Запис листа в SQL (`cms_content_set`, ним «Тексти» пишуть оригінал) має ті самі правила, що
    `setAt` / `applyTranslation`. Паритет перевіряє спільна фікстура `tests/fixtures/translation.json`
    у vitest і pgTAP.
  - ~~Зміна мови за замовчуванням конвертує контент усіх сторінок однією RPC.~~ *Прибрано в 010d:* мова
    оригіналу незмінна (C-87), конвертації й R-20 немає.
- **C-79. Внутрішній href — без мови, URL робить Client (D-60, хвіст).**
  - Контент зберігає `/about`.
  - Client реєструє `provideCmsLinkResolver((href, locale) => …)` у плагіні. `CmsLink`, `CmsButton` і
    лінки rich text проганяють через нього шляхи `/…` і перевіряють результат allow-list'ом ще раз.
  - Без резолвера все як раніше.
  - Мову сторінки Client ставить у `useCmsLocale()` зі свого роутингу. В Edit Mode її ставить
    редактор (`?locale=`).
- **C-80. Alt по мовах (було D-28).**
  - `default_alt` медіа один, мовою за замовчуванням.
  - Порядок: override у перекладі → override у базі → default медіа → prop з коду. Окремої логіки
    немає: це наслідок C-78 і C-74.
- **C-81. Мультимовність — «активних мов більше однієї» (було D-29).** Прапорця в config і перемикача
  немає. `useCmsLanguages().multilingual`.
- **C-82. Локалізовані settings — у 010 (було D-30).**
  - `cms_site_settings_translations` на мову, поки що лише `site_name`. Значення мови за
    замовчуванням лишається в `cms_site_settings`. Контакти спільні.
  - Поля по мовах у Settings → Загальні — лише на мультимовному сайті.
- **C-83. Мови — `cms_languages`, право `languages.manage` (owner).**
  - Рівно одна default, завжди активна. *Змінено в 010d:* default — мова оригіналу, вона не змінюється
    (C-87).
  - *Змінено автором 2026-11-18:* мову можна видалити (owner, з попередженням). Разом із нею
    видаляється все, що нею написано: чернетки, опубліковані переклади, ревізії, назва сайту.
    - Основну мову видалити не можна.
    - Поки сторінка відкрита в Edit Mode, видалення повертає `conflict`.
    - Щоб лише прибрати мову з сайту, її ховають (switch «На сайті»).
  - Запис — лише RPC. Перша мова додається як default: це мова наявного контенту.
  - Поки таблиця порожня, сайт має одну мову — `defaultLocale` з `cms.config.ts`. Відтепер це
    лише bootstrap-значення (C-44).
  - Вимкнена мова не віддається публічно й не потрапляє в `locales` для hreflang.
  - Fallback-політика — не config, а дані: `CmsPage.translated` і `CmsPage.locales`. Що робити з
    неперекладеною сторінкою (показати, 404, noindex), вирішує Client.
  - *Доповнено після перевірки автором (2026-11-18):*
    - неактивна мова — це мова «в роботі»: нова мова додається прихованою, owner показує її на
      сайті, коли переклад готовий;
    - приховані мови бачать і перекладають усі з `pages.edit` (RLS, перемикач Edit Mode);
    - Edit Mode підсвічує неперекладені поля й має фільтр «Лише неперекладені».

### Закрито перед 010b

Деталі — [запис 010b](./implementation/010b-texts.md). Рішення автора 2026-11-18.

- **C-84. Реєстр полів сторінки.** Edit Mode основною мовою записує перекладні поля відкритої
  сторінки (`cms_page_fields`): адресу, kind, назву і показаний текст — збережений або дефолт із
  коду. Контент і Draft не змінюються, дефолти лишаються в коді (C-42, C-47).
  - Поле, якого вже немає, прибирається при наступному відкритті; поля під прихованим
    `CmsOptional` лишаються.
  - Реєстр замість копіювання дефолтів у контент: інакше правка розробника в коді «замерзла» б.
- **C-85. «Тексти сайту».** Тексти, яких немає на сторінках CMS (меню, футер, тости, форми, 404,
  `<title>`).
  - Client оголошує їх у `cms.texts.ts` (`defineCmsTexts`): ключ, текст основною мовою,
    контекст. Файл серіалізований, як `cms.config.ts` (C-27); модуль віддає його як
    `#cms/texts`.
  - У коді — `useCmsText().t('nav.about')`. Пошук: мова → основна мова → код.
  - Значення по мовах — `cms_site_texts`. Зберігається одразу, без чернетки; змінюють owner / admin
    (`pages.publish`).
  - Навігація: підписи — тексти сайту; структура меню лишається кодом до сутності «Навігація» (015).
- **C-86. Екран «Тексти»** (`/admin/texts`): усі тексти сайту в одному місці. *Змінено в 010d (C-89):*
  основною мовою тексти сторінок теж редагуються тут; запис — `cms_page_set_texts`, публікація —
  вибраних сторінок.
  - Групи: кожна зареєстрована сторінка + групи текстів сайту (перший сегмент ключа).
  - Основна мова: тексти сайту й тексти сторінок редагуються (*змінено в 010d*; у 010b тексти
    сторінок — лише ↗ у редактор).
  - Інша мова: «оригінал | переклад», фільтр неперекладених.
  - Текст, підпис і alt сторінки пишуться в чернетку мови (`cms_page_set_texts`, `pages.edit`; у 010b —
    `cms_page_translate`, лише переклад); поки сторінка відкрита в Edit Mode — `locked`.
  - Rich text — лише ↗.
  - «Опублікувати зміни / переклад» публікує вибрані в діалозі сторінки з перевіркою версії чернетки;
    відкриті в редакторі й змінені після відкриття діалогу пропускає (`cms_language_publish(page_locale,
    pages)`, `pages.publish`; у 010b — усі сторінки мови).
  - ↗ відкриває Edit Mode потрібною мовою на полі (`?field=`).
  - Рядки йдуть у порядку сторінки, під назвами її блоків. Назва блоку — `data-cms-section`,
    `aria-label` або перший заголовок секції. Назва рядка — `fieldLabel`, інакше тип («Заголовок»,
    «Кнопка», «Опис зображення», «… · елемент N»). Адреси й ключі — лише в підказці.

### Закрито перед 010d

Деталі — [запис 010d](./implementation/010d-simplify.md). Рішення автора 2026-11-18 після обговорення
спрощення.

- **C-87. Мова оригіналу незмінна.**
  - Перша мова сайту — мова оригіналу (база, C-78): нею написані тексти в коді й документ бази.
  - Змінити її не можна: RPC зміни немає, а тригери `cms_languages` не дають змінити `is_default` чи
    видалити основну мову, поки є інші.
  - Мова без префікса в URL — теж вона. Маршрутизація — Client (C-79). Окремої «мови URL» немає (TODO).
  - Конвертації контенту немає, R-20 закрито. `cms_page_revisions.base` лишається legacy до 012.
  - Справжня зміна мови оригіналу — окрема міграція даних (експорт / імпорт), не кнопка в адмінці.
- **C-88. Стабільні id елементів колекцій із коду.**
  - Елемент `defaults` у `CmsCollection` має власний `id` (сегмент адреси, унікальний). Адреса
    (`services.items.design.title`) не залежить від порядку в коді.
  - Без id на кожному елементі — позиційні `default-N`, як раніше, і dev-попередження.
  - Колекція, що вже має переклади чи override за `default-N`, закріплює їх явно в поточному порядку:
    `{ id: 'default-0', … }`. Дані не переписуються. Це замінило `legacyId`: той ламався після
    матеріалізації, бо переклади інших мов лишались за старою адресою.
- **C-89. «Тексти» — другий інтерфейс до тих самих чернеток.**
  - Edit Mode і «Тексти» пишуть у ту саму чернетку `(page, locale)` і публікують тим самим
    `cms_page_promote_draft`. Власного життєвого циклу «Тексти» не мають.
  - Запис — `cms_page_set_texts`, обидві мови:
    - лише текстові листи зареєстрованих полів (text, `label`, `alt`), рядок ≤ 2000; href, медіа,
      структура й rich text так не змінюються;
    - реєстр пише клієнт, тож лист ще перевіряє збережений оригінал (`cms_page_text_target`, рев'ю
      010d): не нетекстова властивість примітива (`id`, `href`, `newTab`, `mediaId`, `focal`,
      `decorative`, `hidden`), рядок або нічого за адресою, без предка-скаляра чи rich text;
    - оригінал — у дерево, `null` — назад до тексту з коду (лише поза збереженим списком);
    - переклад — плаский об'єкт.
  - Публікація — `cms_language_publish(locale, pages)`: лише вибрані сторінки, кожна з маркером версії
    чернетки (`updated_at` рядком з API).
    - Змінену чи відкриту в редакторі сторінку пропускає.
    - Діалог спершу чекає всі записи і не позначає сторінки, де в чернетці є зміни з редактора.
  - Page-mutex: `set_texts`, publish мови й `lock_acquire` беруть рядок `cms_pages` `FOR NO KEY UPDATE`.
    - Не `FOR UPDATE`: FK-вставки (чернетка, ревізія, published) беруть `FOR KEY SHARE`, і Edit Mode з
      lock-рядком отримав би deadlock.
    - Порядок блокувань: сторінка → lock → чернетка.
  - Тексти сайту — одразу (C-85 без змін); UI підписує «Збережено в чернетці» / «Збережено на сайті».

### Закрито перед 011

Деталі — [запис 011](./implementation/011-forms.md). Рішення автора 2026-11-19 (було D-31…D-36), план
двічі пройшов зовнішнє рев'ю.

- **C-90. Форми з коду, заявки в БД, без синхронізації** (було D-33, D-36).
  - Форми оголошує Client у `cms.forms.ts` → `#cms/forms` (серіалізовано, як `cms.texts.ts`). Це
    джерело правди про існування форми й її поля. Конструктора форм немає (C-01).
  - `cms_forms` — лише перевизначення власника (`enabled`). Немає рядка — форма ввімкнена. Синхронізації
    реєстру з БД немає.
  - `cms_form_submissions.form_key` без FK: форма, прибрана з коду, перестає приймати заявки, а її
    заявки лишаються й показуються за ключем.
  - Вкладень немає. «Де використовується» не декларується: адмінка показує сторінки, з яких реально
    надходили заявки.
- **C-91. Відправка — лише server route Core з secret-ключем** (було D-31, D-32).
  - `POST /api/cms/forms/[key]` (каталог `server/` layer) → тіло потоком ≤ 64 KB → honeypot → валідація →
    хук `cms:forms:validate` → RPC `cms_form_submit` (execute лише `service_role`).
  - Server-only клієнт — `server/cms/supabase.ts`, ізольований від сесії відвідувача. Секрет —
    `NUXT_CMS_SUPABASE_SECRET` (або `SUPABASE_SECRET`) лише під час виконання.
  - `cms_form_submit` в одній транзакції: advisory lock на `(form_key, client_token)` → повтор із тим самим
    token і тими самими значеннями (fingerprint `sha256(payload::text)` у SQL) повертає ту саму заявку без
    ліміту, з іншими — `token_reused` → лічильники вікна (форма + відвідувач 5, відвідувач на всі форми 10)
    → загальна стеля форми для всіх відвідувачів (50; рахується лише для спроб, які пропустив ліміт
    відвідувача; відмова — статус `form_limited`, для клієнта це `rate_limited`, сервер логує першу за
    вікно) → `enabled` → insert. Статуси повертаються, а не кидаються: заблоковані спроби теж рахуються.
    Ліміти `null` відхиляються. Стелю можна вичерпати навмисно (у режимі `none` — один відправник);
    ризик описано в README, ліміти в цій версії фіксовані.
  - Відвідувач у лімітах — HMAC адреси з секретом; IP у заявці не зберігається. IPv6 рахується за мережею
    /64. Жодному заголовку за замовчуванням не довіряємо: джерело адреси — runtime-опція
    `NUXT_CMS_CLIENT_ADDRESS` (`auto` → `vercel` на Vercel, `socket` у dev, інакше `none`; також `socket`,
    `cloudflare`, `proxy[:N]` — N-й запис `X-Forwarded-For` справа, лише коли TCP-peer приватний або
    loopback). Без достовірної адреси відвідувацьких бакетів немає (не спільний `unknown`) — діє лише стеля
    форми (`server/cms/client-address.ts`, R-10).
  - Виклик RPC і розбір його статусів — server-only адаптер `server/cms/form-store.ts`; маршрут не знає
    Supabase. Виняток у хуку сайту → лог без значень і відповідь `unavailable`.
  - Мова заявки зберігається, лише якщо вона активна на сайті (перевірка в RPC).
- **C-92. Поля — декларативно, спільний мінівалідатор** (було D-34, D-35).
  - Поле: `key`, `type` (text / email / tel / textarea / select / checkbox), `required`, `maxLength`,
    `options`, `role` (name / email / phone / message). Порядок — порядок у масиві.
  - `validateCmsForm` (`app/primitives/form-validation.ts`) працює однаково в браузері й на сервері,
    повертає стабільні коди помилок. Бізнес-правила сайту — Nitro-хук `cms:forms:validate` у
    `server/plugins/*` Client. Valibot / Zod не потрібні.
  - Тексти форми — тексти сайту (C-85): `forms.<form>.<field>.label`,
    `forms.<form>.<field>.options.<value>`, `forms.<form>.errors.<code>` / `forms.errors.<code>`,
    `forms.<form>.name` (назва в адмінці; запасний ключ — `forms.<form>.title`). Значення select у заявці
    стабільні.
  - Хук `cms:forms:validate` працює до лімітів: відмови хука не рахуються, тож хук має бути дешевим і не
    перевіряти секрети, які можна перебрати (коди, інвайти).
  - `search_text` будує сервер із полів із роллю; інші поля в пошук не потрапляють.
- **C-93. Заявки бачать лише Owner і Admin.**
  - Права `forms.view` / `forms.manage` у `can()` і `cms_can()`. Editor не бачить ні меню, ні даних.
  - Заявка змінюється лише в двох колонках — `location` (inbox / archived / spam) і `read_at`: SQL-гранти
    на колонки, не лише RLS. Insert з адмінки неможливий. `cms_forms`: insert `(key, enabled)`, update
    `(enabled)`, `updated_by` ставить тригер.
  - Стану «опрацьовано» немає (не CRM): архів означає «прибрано з вхідних».
- **C-94. Адмінка «Заявки» — один інбокс.**
  - `/admin/submissions`: усі форми разом, newest first. Для однієї форми — простий список без фільтра
    форм. Вхідні / Архів / Спам, пошук, «лише непрочитані», режим вибору з масовими діями, undo в тості,
    пагінація на сервері, CSV.
  - `/admin/submissions/[id]`: контакти з діями (mailto / tel / WhatsApp / Viber — посилання з
    перевірених значень і фіксованих схем), повідомлення, решта відповідей, поля, яких уже немає у формі.
  - `/admin/submissions/forms` («Керування формами»): лише ввімкнути / призупинити прийом. Поля форми не
    показуються.
  - Остаточне видалення заявки — свідома функція V1 для Owner / Admin (`forms.manage`): окрема від
    архівування дія з підтвердженням, без undo (персональні дані). Автоматичного строку зберігання немає —
    політику retention визначає сайт (README).
  - CSV: UTF-8 з BOM, кожна клітинка в лапках, формули (`= + - @` і їхні повноширинні форми, tab, CR, LF) нейтралізовано апострофом.
  - Сторінки називаються людською мовою (без мовного префікса, `/` — «Головна сторінка»); шлях — у
    підказці.
- **C-95. Мобільна адмінка.** На ширині < 768 px сайдбар `AdminShell` — висувне меню з мовою адмінки й
  виходом. Стосується всіх екранів адмінки. Закрите меню — `inert` (без фокусу й поза деревом
  доступності); відкрите — модальне: решта сторінки `inert`, фокус переходить у меню, Escape / кнопка
  закриття / тло закривають його й повертають фокус на кнопку меню.
  - Вихід з адмінки — повне перезавантаження (`location.replace`), не клієнтська навігація: SSR-payload і
    кеші вкладки з персональними даними заявок не переживають сесію. Інші вкладки адмінки з `AdminShell`
    роблять те саме за подією `SIGNED_OUT` (supabase-js передає її між вкладками;
    `app/admin/useAdminSessionEnd.ts`).

### Закрито перед 012

Деталі — [запис 012](./implementation/012-activity.md). Рішення автора 2026-11-19…21 (було D-37), план
спрощено після зовнішнього аналізу.

- **C-96. Activity — захищений список важливих дій, без diff і власного Restore** (було D-37).
  - Одна таблиця `cms_activity` (11 полів, знімки email і назви). Пише лише БД у транзакції дії: insert у
    security definer RPC і тригери на прямих записах через RLS. Клієнтські ролі мають лише `select` за
    `activity.view` (owner, admin); logger не викликає жодна клієнтська роль.
  - Події V1:
    - сторінки — publish, restore, force unlock;
    - медіа — upload, replace, delete;
    - мови — add, delete, show / hide;
    - форми — enable / disable;
    - налаштування — одна подія на змінений рядок, лише назви полів, «було → стало» тільки для
      `maintenance_mode`;
    - заявки — archive / spam / inbox / delete однією подією на SQL-запит, лише фактичні зміни.
  - Не логуються: Save draft, тексти сайту, lock, прочитання заявок, нові заявки з сайту.
  - Diff немає. Подія publish / restore веде в History (`?history=`), Restore — наявний (C-57).
  - Строку зберігання журналу немає. Групування масових операцій немає.

---

## 3. Стан проекту

### Зроблено

| Епік | Що є | Запис |
| --- | --- | --- |
| 001 | Nuxt Layer + внутрішній Module, `cms.config.ts`, `#cms/config`, `useCms()`, playground | [001](./implementation/001-foundation.md) |
| 002 | `SettingsRepository.get()`, `useSiteSettings()`, `cms_site_settings`, RLS select, `CmsDataError`, lazy anon-клієнт | [002](./implementation/002-data-layer-site-settings.md) |
| 003 | `auth.users` → `cms_users`, login, сесія в cookie, статична `can()` + `cms_can()`, middleware на `/admin` і `/admin/edit` | [003](./implementation/003-auth.md) |
| 004a | Токени й `Admin*` компоненти під `.cms-admin`, login | [004a](./implementation/004a-admin-ui-foundation.md) |
| 004b | Admin shell із сайдбаром, Settings → General пише через `SettingsRepository.update()` + RLS `cms_can('settings.update')` | [004b](./implementation/004b-admin-shell-settings.md) |
| 004c | Admin i18n без `@nuxtjs/i18n` (C-36), public bundle без vue-i18n / vee-validate / admin CSS, `typecheck` / `lint` / `@nuxt/test-utils`, тест синхронності прав TS ↔ SQL, `package.json` під публічний npm | [004c](./implementation/004c-alignment.md) |
| 005 | `cms_pages` + `cms_page_published` (документ на page × locale, select-only RLS), `PagesRepository.getByKey()`, `useCmsPage()`, `defaultLocale` у config, generated types, pgTAP smoke-тест | [005](./implementation/005-pages.md) |
| 006 | `CmsText`, `CmsRichText` (renderer без Tiptap / `v-html`), `CmsLink`, `CmsButton`, `CmsImage` (src до 009); allow-list `href`; типи `nuxt-cms-core/types`; `npm run check:bundle` | [006](./implementation/006-primitives.md) |
| 007 | `cms_page_draft`, `cms_page_revisions`, `cms_page_locks`, домен `cms_locale`; RPC save draft / publish / restore / lock; право `pages.unlock`; методи `PagesRepository`; pgTAP на атомарність і lock | [007](./implementation/007-draft-publish.md) |
| 008 | Edit Mode `/admin/edit/[...path]` на сторінці Client з layout; Editor Engine (Draft, dirty, Undo, validation, Lock); Overlay Layer; editable-гілки primitives + `CmsCollection`, `CmsOptional`, `CmsBackground`; rich text на Tiptap; Save / Publish / History / Lock UI; лендинг «Luminary» у playground | [008](./implementation/008-edit-mode.md) |
| 009 | `cms_media` + бакет `cms-media`, Storage Adapter, `MediaRepository`; `CmsImage` / `CmsBackground` на `CmsImageValue`; читання сторінки з media одним RPC; `/admin/media`, Media Picker, Settings → Бренд; права `media.*` | [009](./implementation/009-media.md) |
| 010b | Реєстр полів сторінки; «Тексти сайту» (`cms.texts.ts`, `useCmsText`, `cms_site_texts`); екран «Тексти» з перекладом у чернетку, «Опублікувати переклад» і ↗ на поле | [010b](./implementation/010b-texts.md) |
| 010 | `cms_languages` + Settings → Мови; переклад сторінки як мапа листів над базою (C-78) і читання з fallback одним RPC; перемикач мов і режим перекладу в Edit Mode; link-резолвер Client; `useCmsLocale` / `useCmsLanguages`; hreflang-дані; `site_name` по мовах; право `languages.manage` (зміну мови за замовчуванням прибрано в 010d) | [010](./implementation/010-localization.md) |
| 010d | Мова оригіналу незмінна (тригери, без конвертації); стабільні id колекцій із коду; «Тексти» пишуть оригінал і переклади в ті самі чернетки одним RPC, публікують вибрані сторінки з перевіркою версії; page-mutex `FOR NO KEY UPDATE`; конкурентні pgTAP через dblink | [010d](./implementation/010d-simplify.md) |
| 011 | Форми з `cms.forms.ts`, `useCmsForm`, перший server route Core (`/api/cms/forms/[key]`) із secret-ключем; `cms_form_submit` з ідемпотентністю й лімітами; права `forms.*`; адмінка «Заявки» (інбокс, деталі, керування формами, CSV); мобільна адмінка | [011](./implementation/011-forms.md) |
| 012 | `cms_activity` + запис у RPC і тригерах, право `activity.view`; екран `/admin/activity` (категорії, дні, keyset, SSR без hydration mismatch); перехід у History з підсвіченою або підвантаженою версією; прибрано `revisions.base` | [012](./implementation/012-activity.md) |

### Drift код ↔ план

Відкритого drift немає: усе, що було тут, закрито в 004c.

### Відкладено (TODO)

Що свідомо пропущено в закритих епіках. Тут — єдиний список, щоб нічого не загубилось: записи
епіків посилаються сюди. Пункт закривається, коли його беруть у план епіку з колонки «Куди».

| Що | Звідки | Чому відкладено | Куди |
| --- | --- | --- | --- |
| Правки UI Edit Mode за відгуком автора | 008 | Перша версія UI, автор тестує наживо | 008b |
| Dev-попередження, коли `value` не відповідає `fieldKey` (C-47) | 006 / 008 | Не блокує сценарій | 008b |
| Жорсткий `maxLength` (зараз лише блокує Publish, C-58) | 008 | М'який ліміт достатній для першої версії | 008b |
| Device preview (мобільна ширина) | 008 | Без iframe медіа-запити не перемикаються чесно | 008b, якщо з'явиться iframe |
| Колір у rich text | 008 | Немає у форматі C-49 | Поза V1 |
| Серверна перевірка файлів: magic bytes, SVG за allow-list (зараз SVG чиститься лише в браузері, API її обходить) | 009 | Upload іде напряму в Storage (C-71, C-75); server-only клієнт з'явився в 011, але вкладень форм немає | Разом із вкладеннями форм або server upload — за потребою |
| Replace одразу видаляє старий файл: HTML у публічному кеші покаже биту картинку до інвалідації | 009 | Публічного кешу ще немає (C-11), техборг за рішенням автора | 016 (разом з ISR / SWR) |
| Ресайз / WebP / `@nuxt/image` | 009 | Залежить від хостингу (C-73, R-09) | 016 |
| Документи й відео в медіатеці, таби Documents / Videos з макета | 009 | Немає споживача (C-75) | За потребою |
| Usage для клієнтських колекцій | 009 | Колекцій ще немає (C-72) | 014 |
| Caption у `CmsImageValue` | 009 | Немає споживача (C-74) | За потребою, адитивно |
| Private files / signed URLs | 009 | Потрібні вкладенням форм; вкладення в 011 не робили (anti-scope) | Разом із вкладеннями форм — за потребою |
| Фізичне прибирання soft-deleted і невикористаних файлів | 009 | Revisions можуть посилатися на `mediaId` | 015 (System) |
| Людські назви місць у «Використовується» (зараз — ключ сторінки) | 009 | `fieldLabel` живе в коді Client | Після 015 (Pages list) |
| Пагінація медіатеки | 009 | Бібліотека V1 невелика | Коли знадобиться |
| `<link rel="icon">` з Brand автоматично в Core | 009 | Client підключає сам через `useSiteSettings()` | 015 |
| AI-переклад / кнопка «Translate» у полі (зараз панель показує оригінал) | 010 | Anti-scope 010 | Поза V1 |
| Мова URL без префікса ≠ мова оригіналу | 010d | Немає бізнес-вимоги; маршрутизація — Client (C-87) | За потребою, адитивно |
| Застарілі переклади: hash оригіналу, «Оригінал змінився — перевірте переклад» | 010d | Нова функція, не спрощення | 010c |
| Сповіщення про нові заявки (Telegram), статус доставки | 011 | Окремий епік інтеграцій; форма працює без них | 013 |
| Режими адреси відвідувача для інших платформ (Netlify тощо) і перевірка peer за списком адрес Cloudflare | 011 | Зараз для них — `none` або явний `proxy[:N]` / `cloudflare` (C-91) | 016 (deploy) |
| Ліміти форм, які налаштовує сайт; бакет на IPv6 /48 | 011 | Мінімальний варіант X-11: ризик стелі задокументовано, перша відмова логується | За потребою |
| Вкладення у формах | 011 | Приватне сховище, перевірка файлів, життєвий цикл | За потребою |
| UTM / referrer у заявці | 011 | Потребує зберігання на клієнті й згоди | За потребою |
| Автоматична реєстрація розміщень форм (через Edit Mode) | 011 | «Надходили зі сторінок» за заявками достатньо | За потребою |
| Справжні назви сторінок в адмінці (замість назви з адреси) | 011 | У Core немає назв сторінок | 015 |
| Перехід «Редагувати тексти форми» на екран «Тексти» | 011 | «Тексти» не відкриваються на групі конкретної форми | За потребою |
| Строк зберігання заявок (автовидалення) | 011 | Є ручне видалення (C-94); політика залежить від сайту, описана в README | За потребою |
| Сторінка з'являється на «Текстах» лише після відкриття в редакторі | 010b / 010d | Автоматичний реєстр (iframe, SSR, маніфест) відкладено автором | За потребою |
| Інші тексти settings по мовах (SEO, Social) | 010 | Таких полів ще немає | 015, разом із полями |
| Колекції (014) по мовах — `*_translations` за C-15 | 010 | Колекцій ще немає | 014 |
| Структура меню (порядок, пункти) з адмінки | 010b | Підписи вже — тексти сайту; структура — код Client | 015 (Навігація) |
| Тексти сайту для прихованої мови в Edit Mode (`useCmsText` читає публічно) | 010b | Прихована мова показує тексти основної, поки її не показали на сайті | За потребою |
| Rich text у «Текстах сайту» | 010b | Лише прості тексти (C-85) | За потребою |
| Тексти сайту в Activity | 012 | Зберігаються на blur кожного поля: сотні малокорисних подій (C-96) | Поза V1, без плану |
| Строк зберігання Activity (автоочищення) | 012 | Тисячі подій на рік; pg_cron був би першим розширенням пакета | За потребою |
| Попередній перегляд і порівняння версій у History | 012 | Diff не робили (C-96); логічне місце — History, не Activity | За потребою |
| CSV-експорт заявок в Activity | 012 | Збирає браузер, серверної точки для чесного запису немає | Разом із server-side експортом |
| Автор публікації в History | 012 | Видно в Activity; History показує лише дату | За потребою |
| Події Activity від колекцій, інтеграцій, користувачів | 012 | Сутностей ще немає; `entity_type` — текст, формат адитивний | 013, 014, 015.2 |
| Прибирання за конкурентними pgTAP-тестами (dblink комітить, у журналі лишаються події «concurrency-fixture») | 012 | Не впливає на тести; прибирати лише власні записи за надійною міткою, не весь журнал | Окрема мала задача |
| Політика зберігання / видалення / анонімізації `actor_email` в Activity (R-21) | 012 | V1 зберігає знімок безстроково, також після видалення користувача | Перед сайтами з юридичними вимогами до персональних даних |
| Аудит `EXECUTE` старих внутрішніх SQL-функцій для `service_role` (нові функції 012 його відкликають, старі — ні) | 012 рев'ю | `BYPASSRLS` не робить зайві `EXECUTE` автоматично безпечними; перевизначення старих RPC зараз ризикованіше за користь | Security hardening |

---

## 4. Фази та епіки V1

```
Фаза 0  Foundation        001 → 002 → 003 → 004a → 004b → 004c
Фаза 1  Content core      005 Pages → 006 Primitives → 007 Draft/Publish → 008 Edit Mode → 009 Media
Фаза 2  Мультимовність    010 Localization
Фаза 3  Operations        011 Forms → 012 Activity → 013 Integrations
Фаза 4  Business + Admin  014 Collections → 015 Admin growth (Pages list, Users, Settings, System, Dashboard)
Фаза 5  Distribution      016 CLI / Updates / Deploy / Publishing
```

Чому так: без Auth немає безпечного запису; без репозиторію Pages немає чого редагувати;
без Draft/Publish Edit Mode писав би в Published (заборонено); один locale має пройти
read → draft → edit → publish до локалізації; Collections повторюють патерн, уже
відпрацьований на Pages; CLI автоматизує процес, який уже стабільний.

Формат епіку: **ціль · будуємо · anti-scope · залежності · блокуючі рішення · джерела**.
Епіки 001–004b закрито до появи цього формату. Їх тут немає: що зроблено і з яких блоків
архітектурної доки, записано в `docs/implementation/00N-*.md` (рядок «Джерела»).
«Блокуючі рішення» — ID з реєстру §6, їх закривають **до** плану епіку.

---

### 004c — Alignment (вирівнювання перед 005)

`done` · Фаза 0 · [запис](./implementation/004c-alignment.md)

- **Ціль.** Привести код і правила до канонічних рішень, щоб 005 стартував з чистої бази.
- **Будуємо.**
  - `project.mdc`: прибрати Tailwind, узгодити з C-23.
  - Ізоляція i18n адмінки (C-25): префікс ключів, без злиття з locales Client, i18n-плагін
    не в public chunk.
  - Перевірка public bundle: `vee-validate`, vue-i18n, admin CSS відсутні в public chunk.
  - Скрипти `typecheck` / `lint`, `@nuxt/test-utils`.
  - Тест синхронності `permissions.ts` ↔ `cms_can()`.
  - `package.json` готовий до публічного npm: без `private`, `bin` — заготовка під 016
    (без самого publish).
- **Anti-scope.** Нові фічі, рефакторинг робочого коду «для стилю», CI-пайплайн (016),
  повна автоматизація bundle-перевірки (006).
- **Блокуючі рішення.** D-01 → C-36, D-54 → C-37 (закрито).
- **Джерела.** §3, §9, §33; Б4, Б17, Б18, Б20 §45.

### 005 — Pages як content entity (published read)

`done` · Фаза 1 · [запис](./implementation/005-pages.md)

- **Ціль.** Перша контентна сутність із публічним читанням, як 002 для settings.
- **Будуємо.** Таблиці `cms_pages` + `cms_page_published` (C-41) і `PagesRepository` лише з read-методами (`getByKey` за C-43;
  `getAll` — лише зі споживачем); playground-сторінка рендерить published контент **одним** запитом;
  generated Supabase types; smoke-тест міграцій.
- **Anti-scope.** Draft, Revisions, Edit Mode, локалізація UI, колекції, SEO-сутності «на
  майбутнє», generic CRUD.
- **Залежності.** 002, 003.
- **Блокуючі рішення.** D-02 → C-41, D-03 → C-42, D-04 / D-05 → C-43 (закрито). Storage model вибирається **з урахуванням**
  007 (де живе Draft, C-06) і 010 (locale-ключ), щоб не робити міграцію даних пізніше.
- **Джерела.** §6–7, §12, §15; Б5, Б12; DB v1 → Pages.

### 006 — CMS Primitives, тільки Public Runtime

`done` · Фаза 1 · [запис](./implementation/006-primitives.md)

- **Ціль.** Playground виглядає як справжній сайт з editable-контрактом ще до редактора.
- **Будуємо.** `CmsText`, `CmsImage` (URL/placeholder до 009), `CmsButton`, `CmsLink`,
  `CmsRichText` як renderer без Tiptap. Легкі render-компоненти, жодного editor/admin import.
  `runtime.css` (не знадобився — C-23). Автоматична перевірка public bundle (скрипт).
  `CmsOptional` / `CmsCollection` — лише якщо є конкретний споживач на playground.
- **Anti-scope.** Tiptap, toolbar, hover/selection, Media Picker, `v-model`-контракт, generic `CmsField`.
- **Залежності.** 005.
- **Блокуючі рішення.** D-06 → C-47, D-07 → C-49, D-08 → C-48 (закрито).
  C-48 не закриває D-60: адреса поля не залежить від того, чи поле
  перекладається.
- **Джерела.** §8–9; Б3 §3, §5, §31; Б4; Б17.

### 007 — Draft / Publish / Revisions (дані)

`done` · Фаза 1 · [запис](./implementation/007-draft-publish.md)

- **Ціль.** Контракт даних і атомарний Publish до появи UI редактора.
- **Будуємо.** Editor State (ще не тут) / Saved Draft / Published / Revision як різні поняття;
  `saveDraft` / `getDraft` / `publish` у `PagesRepository`; Publish як Postgres-функція:
  permission → серверна validation → revision snapshot → promote → publish metadata,
  revalidation після commit (C-07, C-11); Restore = новий Draft; soft delete Pages (C-34).
  *Факт:* revalidation відкладено до першого кешу (C-11), soft delete Pages — у 015 (C-34).
  Тести: Publish атомарний, Draft не світиться в public read.
- **Anti-scope.** Editor Engine, Undo/Redo, Lock UI, scheduled publish, approval workflow,
  персональні drafts, realtime collaboration, окремий lock на мову (lock спільний для мов, Publish —
  per-locale за C-46).
- **Залежності.** 005.
- **Блокуючі рішення.** D-09 → C-50, D-10 → C-51, D-11 → C-52, D-12 → C-53, D-13 → C-54,
  D-14 → C-56, D-56 → C-57, D-59 → C-58, D-57 → C-55 (закрито).
- **Джерела.** §18–20; Б8.

### 008 — Edit Mode (мінімальний вертикальний зріз)

`done` (перша версія UI, далі — правки автора) · Фаза 1 · [запис](./implementation/008-edit-mode.md)

- **Ціль.** Перший раз складається головний сценарій CMS.
- **Будуємо (перший зріз).**
  - **Spike на старті:** механізм `/admin/edit/[...path]`, що рендерить page-компонент і layout
    Client Project; edit/preview обходять SSR/ISR-кеш (D-15).
  - Editor Runtime через dynamic import; editable-гілка primitive — async, щоб не потрапити в public.
  - Editor Context (entity binding: тип, id, repository, `currentLocale` пізніше).
  - Editor Engine: draft, dirty, selected field, save status (включно з Error / Retry).
  - `CmsText` inline-editable; Save Draft + Publish; Preview без контролів.
  - Content Lock: acquire / heartbeat / timeout / release / force unlock, read-only для інших,
    перевірка lock-токена в saveDraft / publish.
  - Pinia — тут, якщо реально потрібна (C-26). `editor.css`.
- **Друга хвиля (008b — не планувати зараз).** Undo/Redo, ліміти символів, Reset поля/сторінки,
  toolbar, hotkeys, leave-without-saving, `CmsRichText` + Tiptap (лише коли є реальне rich-поле),
  `CmsCollection` (add/delete/duplicate/reorder зі стабільними id), `CmsOptional`.
  *Факт:* за рішенням автора друга хвиля майже вся увійшла в 008 (C-59…C-70). Що лишилось на 008b, —
  у реєстрі TODO (§3).
- **Anti-scope.** Page builder, окремий editable tree, iframe, Media Picker (009),
  collaborative editing, History UI як Undo, language switcher (після 010).
- **Залежності.** 006, 007.
- **Блокуючі рішення.** D-15 → C-59, D-16 → C-60, D-17 → C-61, D-18 → C-62, D-19 → C-63,
  D-20 → C-64 (закрито). D-57 закрито в 007 (C-55).
- **Дизайни.** Edit Mode — перший епік з UI після адмін-оболонки: тулбар Save Draft / Publish, save
  status, стани поля, Preview, UI lock. Попросити в автора до плану; токени — `--cms-*`.
- **DoD.** Public не імпортує Editor — `npm run check:bundle` входить у Definition of Done. Скрипт не
  бачить lazy-імпортів, які public-сторінка виконує безумовно, а editable-гілка підключається саме
  так. Тому DoD також включає перевірку в браузері (Network): `/` не запитує editor-чанки.
- **Джерела.** §10–11, §20; Б3; Б8 → Content Lock; дизайн-ТЗ §10.

### 009 — Media + Storage Adapter

`done` · Фаза 1 · [запис](./implementation/009-media.md)

- **Ціль.** Зображення в Edit Mode через Media Entity (сирий URL як джерело істини заборонено).
- **Будуємо.** `media` (display name, storage path, mime, size, dimensions, default alt/focal,
  `deleted_at`); `MediaRepository` + Storage Adapter (Supabase ізольований, як SDK у 002);
  Admin → Media: upload, list, replace, soft delete; `CmsImage` на `mediaId` з override
  alt / focal / decorative; вибір з бібліотеки в Edit Mode; Settings → Brand (лого, favicon).
  Replace — новий storage path при тому самому `mediaId` (без застарілого CDN-кешу).
  SVG — лише через `<img>`.
- **Anti-scope.** Image pipeline, auto WebP/AVIF, crop, version history файлів, власний CDN,
  DAM / folder permissions, транскодування відео, Copy URL як контракт контенту.
- **Залежності.** 008.
- **Блокуючі рішення.** D-21 → C-71, D-22 → C-72, D-23 → C-73, D-24 → C-74, D-25 → C-75, D-61 → C-76
  (закрито).
- **Дизайни.** Figma «Media» (сітка). Модал, Picker і Brand зроблено в стилі сітки, автор править.
- **Джерела.** §22; Б7; дизайн-ТЗ §4.

### 010 — Localization v2

`done` · Фаза 2 · [запис](./implementation/010-localization.md)

- **Ціль.** Мультимовність бізнес-даних після того, як один locale пройшов повний цикл.
- **Будуємо.** `languages` (source of truth, рівно одна active default, add / disable /
  reactivate / set default); для Pages документ на locale вже є (C-41), тож `*_translations`
  потрібен лише сутностям зі структурованими колонками; repository віддає плаский
  `page.title`; Settings → Languages; Edit Mode редагує поточну мову + language switcher;
  fallback-політика в Project Config; дані для hreflang/canonical.
- **Anti-scope.** AI translation, per-locale page trees, Translator role, ручні translation
  statuses / `outdated`, per-locale lock. *Видалення мови додано за рішенням автора (C-83).*
- **Залежності.** 007, 008 (і 009 — для alt по мовах).
- **Блокуючі рішення.** D-26 → C-46, D-27 / D-60 → C-78, C-79, D-28 → C-80, D-29 → C-81, D-30 → C-82
  (закрито); право мов — C-83.
- *Факт:* `*_translations` знадобився лише settings (C-82). Fallback-політика — дані для Client, а не
  config (C-83). Зміну мови за замовчуванням (set default) прибрано в 010d (C-87).
- **Ризик.** `@nuxtjs/i18n` вимагає список locales на build-time для prefix-маршрутів, а мови з
  БД — без deploy. Routing локалізованого сайту — відповідальність Client (`[[locale]]` +
  middleware); Core лише дає дані.
- **Джерела.** §21; Б9 (v2 + §22 «Доповнення»).

### 010b — Переклад усього сайту

`done` · Фаза 2 · [запис](./implementation/010b-texts.md)

- **Ціль.** Перекладати весь сайт в одному місці, разом із текстами, яких немає на сторінках.
- **Будуємо.** Реєстр полів сторінки (C-84), «Тексти сайту» (C-85), екран «Тексти» (C-86).
- **Anti-scope.** Машинний переклад, прогрес-бари, ручні статуси, rich text і медіа в «Текстах сайту»,
  редагування структури меню.
- **Залежності.** 010. Іде перед 011: тексти форм одразу стають текстами сайту.
- **Блокуючі рішення.** Закрито автором 2026-11-18 → C-84…C-86.
- **Джерела.** Б9 §13, §22; C-63; відгук автора 2026-11-18.

### 010d — Спрощення локалізації

`done` · Фаза 2 · [запис](./implementation/010d-simplify.md)

- **Ціль.** Прибрати непропорційну складність 010 / 010b, не змінюючи модель «база + переклад».
- **Будуємо.**
  - Незмінна мова оригіналу без конвертації (C-87).
  - Стабільні id елементів колекцій із коду (C-88).
  - «Тексти» як другий вхід у ті самі чернетки, publish і lock, зокрема для оригіналу. Публікація
    вибраних сторінок із перевіркою версії, page-mutex (C-89).
  - Playground англійською.
- **Anti-scope.** Окрема мова URL, hash застарілих перекладів, чернетки текстів сайту, автоматичний
  реєстр, translation service / TranslationUnit, `legacyId`, публікація окремих полів, CSV (010c), rich
  text у «Текстах».
- **Залежності.** 010, 010b.
- **Блокуючі рішення.** Закрито автором 2026-11-18 → C-87…C-89.
- **Джерела.** C-78, C-83…C-86; обговорення автора.

### 010c — Переклад файлом

`todo` · Фаза 2, **після 014** (рішення автора 2026-11-18)

- **Ціль.** Перекласти весь сайт за раз: вивантажити, перекласти (людина чи AI), завантажити.
- **Будуємо.**
  - «Вивантажити для перекладу»: CSV з колонками `id | контекст | оригінал | переклад`.
    `id` — `page:<key>:<адреса>`, `text:<ключ>`, після 014 — `<колекція>:<id>:<поле>`.
  - Rich text у файлі — підмножина HTML (`<p>`, `<strong>`, `<em>`, `<a href>`, `<br>`), при
    завантаженні — назад у формат C-49 через той самий allow-list.
  - «Завантажити переклад»: перевірка (мова, поля ще існують, оригінал не змінився), перегляд
    («нових N, змінених M, пропущено K»), запис **у чернетку** через `cms_page_set_texts` (C-89);
    публікація — «Опублікувати переклад» (C-86). Тексти сайту — одразу.
  - Сторінки, відкриті в редакторі, пропускаються зі звітом.
- **Anti-scope.** XLIFF / інтеграції з TMS, машинний переклад усередині CMS.
- **Залежності.** 010b, 014 (колекції — своїми рядками).
- **Блокуючі рішення.** Немає: формат (CSV) і куди пише імпорт (чернетка) закрито автором.

### 011 — Forms infrastructure

`done` · Фаза 3 · [запис](./implementation/011-forms.md)

- **Ціль.** Lifecycle форм у Core; поля конкретної форми задає Client.
- **Будуємо.** Form і Submission — різні сутності; реєстрація форми runtime-кодом Client;
  `POST /api/forms/[key]` → server validation → honeypot + rate limit → збереження →
  secondary notifications; Admin: список форм, submissions з фільтрами
  (unread/read/archived/spam), detail, mark read / mark all read, archive, spam, CSV export,
  enable/disable.
  - *Факт 011:* форми — декларація `cms.forms.ts` (C-90), маршрут — `POST /api/cms/forms/[key]`
    (C-91); адмінка — один інбокс «Заявки» замість списку форм (C-94); сповіщень немає (013).
- **Anti-scope.** Form builder, `form_fields` / EAV, conditional logic, CRM, обов'язкова CAPTCHA,
  webhooks, auto-reply, Draft/Publish для форм. Нотифікації — 013; форми працюють і без них.
- **Залежності.** 003; Activity-події — 012; attachments (якщо будуть) — 009.
- **Блокуючі рішення.** Закрито автором 2026-11-19 → C-90…C-95 (було D-31…D-36).
- **Джерела.** §23; Б14; дизайн-ТЗ §5.

### 012 — Activity (Admin UI + Restore)

`done` · Фаза 3 · [запис](./implementation/012-activity.md)

- **Ціль.** Журнал значущих мутацій і Restore там, де це повернення Revision у Draft.
- **Будуємо.** Хто / що / коли / яка сутність; запис із repositories (не з Vue); фільтри;
  групування по датах; Restore для подій, прив'язаних до ревізій.
- **Anti-scope.** Infrastructure backup log, «відновити базу з Activity», field-level diff
  для всіх подій.
- **Залежності.** 007 (ревізії), 011 (події форм).
- **Блокуючі рішення.** Закрито автором → C-96 (було D-37). Activity у 007 не будувалась (C-56): запис
  Publish / Restore — insert у RPC.
  - *Факт 012:* запис — у RPC і тригерах БД, не з repositories; Restore — наявний у History, з Activity
    лише перехід (`?history=`); фільтри — категорії без «Мої дії».
- **Джерела.** Б8, Б21; дизайн-ТЗ §7.

### 013 — Integrations (перший живий provider)

`todo` · Фаза 3

- **Ціль.** Capability-based integrations із першим реальним споживачем.
- **Будуємо.** Малі контракти (`NotificationProvider`, далі `EmailProvider`, `AnalyticsProvider`);
  `registerIntegration({ key, provider })` runtime-кодом; SDK лише server-side; перший provider —
  Telegram для Forms; стани Connected / Not connected / Needs attention (+ last checked / error);
  Test connection; GA/GTM-скрипти лише якщо integration enabled + configured.
- **Anti-scope.** Marketplace, event bus, queues, OAuth framework, Zapier, WhatsApp, платежі в Core,
  webhooks, hooks `afterPublish` тощо. Картки Soon — лише для найближчого.
- **Залежності.** 011; secure secrets (D-38).
- **Блокуючі рішення.** D-38, D-39, D-40.
- **Джерела.** §28–29; Б15; дизайн-ТЗ §8.

### 014 — Collections UI (інфраструктура Core)

`todo` · Фаза 4

- **Ціль.** Універсальні Admin-патерни для бізнес-колекцій Client Project. Core не знає Products.
- **Будуємо.** Runtime-реєстрація колекції (key, label, repository з мінімальним list-контрактом,
  summary columns, прапорці routable / SEO / draftable); generic Admin list (search, status
  filter, pagination, count, updated, archive/soft delete з confirm); Edit — у Edit Mode
  template page або custom UI Client; lock на record; playground — один демо-тип.
- **Anti-scope.** Universal entity engine, `collection_fields` / EAV, universal taxonomy,
  обов'язкова generic edit form, `CmsCollection` для `benefits[]` (це 008).
- **Залежності.** 005–008 (патерн на Pages), 009, 010, 012.
- **Блокуючі рішення.** D-41, D-42, D-43, D-44.
- **Джерела.** §7, §13; Б12, Б13; дизайн-ТЗ §2–3.

### 015 — Решта Admin + Configuration growth

`todo` · Фаза 4

Екран за екраном, коли є дані. Не «намалювати всю адмінку».

1. Pages list (статуси, Edit / View / History / Publish) — після 007–008. Soft delete Pages (C-34):
   рядки-сироти, маршрут яких зник з коду.
2. Settings → Users (C-19) — в ТЗ цього екрану немає, треба додати.
3. Settings → SEO / Social / Advanced / Navigation — окремі таблиці/поля; maintenance і robots
   на публічному сайті (C-35; maintenance — server middleware, 503).
4. System — Owner-only, read-only overview (версії, environment, diagnostics); в ТЗ розділу
   немає — треба додати; багато пунктів лишаються Soon.
5. Dashboard як агрегатор — коли є Forms + Activity + (опційно) Analytics.
6. `cms.config.ts` розширюється по факту потреби епіку, не окремим «конфіг-епіком».

- **Anti-scope.** Власний аналітичний рушій (Analytics = інтеграція GA), Sessions / 2FA,
  запуск оновлень з Admin, редагування env через UI.
- **Блокуючі рішення.** D-45, D-46, D-47, D-48, D-49, D-58.
- **Джерела.** §27; Б10, Б11; дизайн-ТЗ §1, §6, §9.

### 016 — CLI / Updates / Deploy / Publishing

`todo` · Фаза 5

- **Ціль.** Автоматизувати вже стабільний процес.
- **Будуємо.** `nuxt-cms create` (обгортка над офіційним Nuxt generator), `add`, `update`,
  `doctor` (лише читає); idempotent, не чіпає код Client і Runtime Settings; bootstrap Owner;
  schema version у БД + compatibility check з попередженням в Admin; перший publish на npm;
  CI для Core (typecheck, tests, build, migration check); Production Checklist.
- **Anti-scope.** Власний генератор / package manager, cloud installer, wizard, автофікс
  конфліктів, Docker як вимога, Kubernetes / IaC, власний backup engine.
- **Залежності.** Усі попередні.
- **Блокуючі рішення.** D-50, D-51, D-52, D-53, D-55.
- **Джерела.** §30–32, §35–37; Б16, Б20, Б21.

---

## 5. Наскрізні обмеження

Кожен план епіку перевіряє ці пункти.

| Тема | Правило |
| --- | --- |
| Performance (Б17) | Public не тягне Admin/Editor/Tiptap/admin CSS — перевірка бандла в DoD. Дані на рівні сторінки, без N+1 (`mediaId` резолвляться пакетно). Pagination і server search в Admin. Draft поза public cache. Третьосторонні скрипти — лише через увімкнену integration. |
| Testing (Б18) | Vitest + Nuxt Test Utils. Unit: permissions, validation, status transitions, error mapping. Integration на локальному Supabase: Publish → Revision, Content Lock, FormsService. Component: `CmsText` / `CmsImage` / `CmsCollection` (stable ids). Smoke-тест міграцій, bundle regression. Без E2E, snapshots, coverage-цілей. |
| Security (Б6, Б11) | `can()` в UI ≠ захист; RLS на кожну mutation; secret key лише server-side; заборона self-escalation у `cms_users`; останній Owner захищений у БД. |
| Configuration (Б10) | П'ять рівнів (C-28) не змішуються; `cms.config.ts` серіалізований (C-27). |
| Data Layer (Б5, Б12) | UI → Composable → Repository → Backend Adapter; domain types на виході; нормалізовані помилки (`CmsDataError` розширюється по факту: `validation`, `conflict`, `locked`, `lock_lost` — у 007). |
| Deployment (Б20) | Деплоїться Client Project; окрема БД на environment; міграція → deploy; backward-compatible міграції; noindex і вимкнений GA поза Production. |
| Backup (Б21) | Помилка редактора → Revision / Trash. Інфраструктура → backup провайдера. Storage-файли провайдер не бекапить — потрібен задокументований скрипт синхронізації (R-08). Власний backup engine не пишемо. |

---

## 6. Реєстр відкритих рішень

Рішення закриваються автором **перед планом** вказаного епіку. «Рекомендація» — пропозиція
з аудиту, не рішення. Після закриття рішення переходить у §2.

### Фаза 0–1

Відкритих немає: рішення 009 закрито (C-71…C-77).

### Фаза 2–3

| ID | Епік | Питання | Варіанти | Рекомендація |
| --- | --- | --- | --- | --- |
| D-38 | 013 | Secrets першого provider | Env (найпростіше); Supabase Vault + UI (Owner-only) | Env для першого provider; Vault + UI — коли буде реальна потреба |
| D-39 | 013 | Де зберігаються несекретні integration settings і статус | Таблиця `integrations`; поля у формі | Таблиця `integrations` |
| D-40 | 013 | Notifications: глобальні чи per-form; retry | Destination у інтеграції / у формі; `notification_status` на submission | Recipients per form; manual retry — пізніше |

### Фаза 4–5

| ID | Епік | Питання | Варіанти | Рекомендація |
| --- | --- | --- | --- | --- |
| D-41 | 014 | Реєстрація колекцій і list-контракт | Runtime `registerCollection` (C-27); мінімум `list({page, search, status})`, `count`, `updatedAt`, `toggleStatus?`, `archive?` | Так |
| D-42 | 014 | Права для клієнтських колекцій | Таблиця `role_permissions`; client-migration перевизначає `cms_can`; generic `collection.<key>.<action>` за роллю | Generic правило за роллю |
| D-43 | 014 | Edit колекції | Edit Mode template page; admin-форма від Client | Template page, якщо є; інакше форма Client |
| D-44 | 014 | Статус колекцій і місце в навігації | Active/Hidden (ТЗ) vs Draft/Publish; «Типи контенту» в Pages (ТЗ) vs пункт сайдбару | Статус на тип колекції; колекції всередині Pages (як у ТЗ) |
| D-45 | 015 | Site URL | Runtime setting; env `NUXT_PUBLIC_SITE_URL` | Env (canonical залежить від environment) |
| D-46 | 015 | Деталізація прав Settings, Languages, custom scripts | `settings.update` для всього; per-section; custom scripts Owner-only | Per-section лише там, де роль відрізняється; scripts — Owner-only |
| D-47 | 015 | Custom scripts у `<head>`/`<body>` (ТЗ Advanced) | V1 з Owner-only і рендером лише в Public Runtime; не у V1 | Не у V1 (stored-XSS канал, конфлікт із §33) |
| D-48 | 015 | Brand → основний колір | CSS variable від Core, яку споживає Client; прибрати з V1 | CSS variable-контракт, якщо Client хоче; інакше поза V1 |
| D-49 | 015 | Dashboard health-checks і SEO-попередження | Спільне джерело з System Diagnostics; визначити критерії | Спільне джерело; лише перевірки з чітким критерієм |
| D-50 | 016 | Модель міграцій | (a) CLI копіює Core-міграції в `supabase/migrations` з новим timestamp; (b) окрема схема `cms` + власний runner; (c) одна історія, Core-міграції лише additive | (a) або (c) — без власного runner |
| D-51 | 016 | Schema version | Таблиця в БД + константа в Core; manifest-файл | Таблиця в БД (manifest лише службовий) |
| D-52 | 016 | Preview-environments і спільна Stage DB | Supabase Branching (платно); одна Stage-гілка; preview без міграцій | Одна Stage DB, міграції лише з main |
| D-53 | 016 | Хто застосовує міграції в Production | Розробник локально (`supabase db push`); CI | Розробник локально на старті |

### Додано після аудиту (дрібніші суперечності доки)

| ID | Епік | Питання | Варіанти | Рекомендація |
| --- | --- | --- | --- | --- |
| D-55 | 016 | Набір CI-перевірок: Б18 §29 — typecheck, lint, test, build; Б20 §15 — без lint; release Core — + migration check | Мінімальний (typecheck, test, build); повний (+ lint); release Core + migration check | typecheck + lint + test + build для Core; + migration smoke перед release; Client Project — typecheck + critical tests + build |
| D-58 | 015 | Чи мають Settings ревізії (DB v1 «History» включала налаштування; Б8 §26 — Draft/Revisions лише там, де є work-in-progress) | Revisions для settings; лише Activity-запис змін; нічого | Без ревізій у V1, лише Activity-запис значущих змін (після 012) |

---

## 7. Технічні ризики

Факти, які дока не враховувала. Кожен уже прив'язаний до рішення або епіку.

| ID | Ризик | Наслідок | Де вирішується |
| --- | --- | --- | --- |
| R-01 | RLS рядкова | Draft / приватні поля в рядку, видимому anon, витікають | C-06, C-50 |
| R-02 | Supabase JS не має клієнтських транзакцій | Publish / Restore / Lock неатомарні без RPC | C-07 |
| R-03 | Validation з Vue-компонентів сервер не бачить | Прямий API-запит публікує невалідний контент | C-52: прийнятий ризик (лише довірена роль, безпечний рендер) |
| R-04 | Статичний import editable-гілки primitive | Editor-код у public bundle | Вирішено в 008: async-гілка + перевірка Network |
| R-05 | Nuxt не рендерить чужий page-компонент із layout «з коробки» | Edit Mode не відтворює сайт | Вирішено в 008 (C-59); лишається залежність від `PageRouteSymbol` |
| R-06 | Supabase CLI — одна лінійна історія міграцій | «Два незалежні джерела» не працюють as-is | D-50 |
| R-07 | `"private": true`, немає `bin`; `npx nuxt-cms` резолвиться за назвою пакета | Пакет не публікується, CLI не запускається | C-30, 016 |
| R-08 | Supabase не бекапить Storage-файли; daily DB backups — лише на платних планах | Втрата медіа при видаленні bucket/файлів | §5 Backup, 016 Checklist |
| R-09 | Image transformations Supabase — платні | Немає ресайзу / WebP на free-плані | C-73: оригінали у 009, ресайз — 016 |
| R-10 | In-memory rate limit у serverless не спільний; `X-Forwarded-For` можна підробити без довіреного проксі | Захист форм від спаму не працює | Ліміти в Postgres (C-91). Жодному заголовку за замовчуванням не довіряємо: джерело адреси — `NUXT_CMS_CLIENT_ADDRESS` (Vercel визначається сам; `proxy[:N]` лише з приватного peer; `cloudflare` — лише коли origin закритий для всіх, крім Cloudflare). Без адреси — лише стеля форми, без спільного бакета. Netlify й інші адаптери — `none`, доки заголовок не перевірено (016) |
| R-11 | Custom JWT claims застарівають до refresh (~1 год) | Деактивація / пониження ролі не миттєві | C-16 |
| R-12 | `inviteUserByEmail` падає для існуючого email; немає події `invited → active` | Invite існуючого користувача ламається | 015.2 |
| R-13 | Replace у той самий storage path | Застарілий CDN/браузерний кеш | Вирішено в 009: новий випадковий path при тому самому `mediaId` |
| R-14 | `@nuxtjs/i18n` в Core layer | Злиття locales із Client, vue-i18n у public | Вирішено в 004c (C-36) |
| R-15 | `cms.config.ts` серіалізується в client bundle | Функції губляться, «приватні» значення стають публічними | C-27 |
| R-16 | Custom scripts в Admin | Навмисний stored-XSS канал | D-47 |
| R-17 | GA4 Data API для Analytics/Dashboard потребує OAuth / service account | Сторінка Analytics із ТЗ — окремий проєкт | 015, D-49 |
| R-18 | `navigator.sendBeacon` не передає `Authorization` | Release lock при закритті вкладки не автентифікується | Вирішено в 008: `fetch keepalive` з кешованим токеном (C-69) |
| R-19 | SMTP-бібліотеки потребують Node runtime | Не працюють на edge-хостингах | 013 (HTTP-API провайдер) |
| R-20 | Поле, яке мовою за замовчуванням ніколи не редагували (дефолт із коду), перекладене іншою мовою | Після зміни мови за замовчуванням стара мова показує там текст нової, а не дефолт із коду | **Закрито в 010d:** мова оригіналу незмінна, зміни й конвертації немає (C-87) |
| R-21 | `cms_activity.actor_email` — персональні дані; знімок лишається після видалення користувача, автоматичного очищення в V1 немає (C-96) | Безстрокове зберігання email не завжди допустиме юридично (право на видалення) | Відкладено: політика зберігання / анонімізації — TODO §3, перед сайтами з такими вимогами |

---

## 8. Дизайн-ТЗ ↔ архітектура

Макет — приклад UI (C-01). Розбіжності, які треба врахувати в планах екранів:

**Немає в ТЗ, але потрібно архітектурі**

- Settings → Users (015.2).
- Розділ System (Owner-only) — на нього посилаються Diagnostics, schema warning, secrets.
- UI Content Lock: «Anna is editing», read-only, Force unlock, «сесія більше не активна».
- Save status Error / Retry.
- Archive / Spam / Restore у модалі submission; Test connection в Integrations.

**Розходиться з архітектурою**

| Місце в ТЗ | Конфлікт | Рішення / ID |
| --- | --- | --- |
| Edit Mode: тулбар форматування на кожному тексті | Plain-text поля без форматування; тулбар — лише `CmsRichText` | 008b |
| Edit Mode: History «останні 10 змін» | Плутає Undo і Revisions | C-12; назвати розведено |
| Edit Mode: логотип як обов'язкове поле | Логотип — Settings → Brand | D-19 |
| Edit Mode: перемикач мов EN/UA/DE | Лише після 010 | 010 |
| Pages: статус Hidden, дія Publish/Hide | Немає в моделі Draft/Publish | C-53: без Hidden для статичних сторінок |
| Dashboard: «Create page» | Статичні сторінки задає розробник | C-43: запис template-типу колекції |
| Collections: Active/Hidden; Delete | Draft/Publish; soft delete | D-44, C-34 |
| Activity: Restore з diff | Restore лише в History, Activity веде туди; diff немає | C-96 |
| Media: Replace «з медіатеки» | Змішує Replace Media і Change Image | 009: Replace — лише новий файл; інше зображення вибирають у полі |
| Integrations: 8 провайдерів | V1 — Telegram, Email, GA, GTM; решта Soon / Client | 013 |
| Settings → SEO: GA ID | GA в трьох місцях (SEO, Integrations, Analytics) — одне джерело: Integrations | 013, 015 |
| Settings → Brand: основний колір | Механізм передачі в CSS Client не визначений | D-48 |
| Settings → Languages: «увімкнення мультимовності» | Конфлікт із config-прапорцем | Прибрано: мов > 1 (C-81) |
| Settings → Advanced: custom scripts | Безпека і performance | D-47 |
| Analytics: повна сторінка | Потребує GA4 Data API + OAuth | R-17 |

---

## 9. Поза V1

Не планувати й не закладати модулі «про запас» (§38, Б19):

Plugin Marketplace, Visual Page Builder, Workflow / approval engine, Dynamic Form Builder,
черги / Redis, multi-tenant SaaS, власна CRM / email platform, 2FA / sessions / login history,
scheduled publish, коментарі, AI-фічі (translation, SEO, alt), image optimization pipeline,
crop / WebP / AVIF, version history файлів, Backup Manager / Restore Wizard / Recovery Mode UI,
Update Checker, Setup Wizard, webhooks і retry, WhatsApp / Zapier / Slack / Discord,
платежі в Core, розширена аналітика (custom reports, goals), E2E / visual regression,
Docker / Kubernetes / IaC, canary / blue-green.

В адмінці Soon — лише те, що реально наступне, не десятки карток.

---

## 10. Errata до доки

Почищена копія [`docs/source/architecture.md`](./source/architecture.md) відрізняється від
Google Doc такими правками. Цей список — і чекліст для синхронізації Google Doc.

### Видалено

1. Блок 9 «Localization / Multilingual Architecture» (v1) — повністю; корисні правила
   перенесено в Б9 §22 «Доповнення з ранньої версії».
2. Блок «ТУТ БУДЕ ТЕКСТ, ЯКИЙ ПРИБИРАЄ СУПЕРЕЧКИ» у кінці доки — його 12 правок застосовано
   (див. нижче).
3. Фрагмент «Основний принцип Content Model» у Блоці 11 — дубль Summary §6 / §13.
4. Розмовні вставки AI-чату: після Б6, Б7, Б8 (рос.), Б11, Б12, Б13, «Єдине, що я б додав»
   (DB v1 — переписано як «Правило нової сутності»), службова примітка «НАЗВУ КРАЩЕ ЗМІНИТИ»
   перед Б17, «Cursor повинен / визначає».
5. «Content Manager» серед ролей (Б11 §3); FAQ Items серед Business Collections (Б13 §1).

### Замінено глобально

6. `@igor/cms-core` → `nuxt-cms-core`; `create-igor-cms` → `nuxt-cms create`;
   `igor-cms` → `nuxt-cms`; «Igor CMS» → «CMS».
7. `/edit/*` → `/admin/edit/*` (Summary §10, Б3 §4, §32, Б6, Б17).
8. «приватний npm-пакет» → «публічний npm-пакет» (TF, Б16, Б21).
9. `content.edit` / `content.publish` → `pages.edit` / `pages.publish` (Б6 §23, Б8 Lock).
10. `SUPABASE_PUBLIC_KEY` → `SUPABASE_KEY` + `SUPABASE_SECRET` (Б20 §11–12).

### Переписано

11. Summary §1 — ієрархія джерел з MASTER_PLAN на першому місці.
12. Summary §3, TF «Основний стек» — без Tailwind і SCSS у Core; VueUse; Pinia лише з Editor Engine; Playwright прибрано.
13. Summary §27 — publishable / secret ключі, `NUXT_*` override.
14. Summary §32 — additive міграції в minor.
15. Дизайн-ТЗ — заголовки розділів + примітка «приклади, не обмеження».
16. TF — «Client не містить логіку CMS» → wiring дозволений; секрети двох типів; `cms.config.ts`
    серіалізований; Manifest без версії Nuxt, стан схеми — у БД; мови — Owner, без видалення;
    міграції не синхронізуються автоматично; `page_translations` — лише з Localization;
    Editable* → Cms*.
17. DB v1 — Page як routable entity; repositories лише з потрібними методами; Products у Client;
    Business Collection ≠ local repeatable; History без Undo; media default + override;
    статуси інтеграцій; JSON-правило узгоджено з Summary §12.
18. Б3 §32 — у потік редагування додано acquire / release Content Lock; §34.18 — без конкуренції з ієрархією.
19. Б4 — `Base*` читати як `Admin*`; public primitives не будуються на admin UI; layouts.
20. Б5 §11 — плаский `CmsPage` без `translations[]`; дубль «§24» → §26.
21. Б6 правила 19–21 — з розмовної вставки (public signup ≠ CMS access; invite лише server-side).
22. Б7 «Ключовий принцип» — правило про alt / focal override.
23. Б8 §21–22 і правило 17 — Content Lock як основний механізм; Publish-транзакція — ревізія як відкрите рішення, RPC, revalidation після commit.
24. Б9 §2 — slug у перекладі, «permissions» прибрано з полів сутності.
25. Б10 §3 — `historyLimit` = Undo stack; маркер D-29.
26. Б11 §3 — ролі V1; §7 — integration secrets не в «Environment»; §11 і Б15 §43 — Setup Wizard поза V1.
27. Б16 §4–5 — Admin із layer, структура Nuxt 4.
28. Summary §27 «Project Config» — серед прикладів `cms.config.ts` лишились `registrations`.
    Реєстрації з функціями — runtime-код Client Project, а не конфіг (C-27). Модуль відкидає
    невідомі ключі `cms.config.ts` (після ревʼю 001–004c). При синхронізації Google Doc прибрати.
29. Б3 §18 та інші приклади `import type { … } from 'nuxt-cms-core'` — читати як
    `from 'nuxt-cms-core/types'`. Корінь пакета — `nuxt.config.ts` (Layer entry), тож типи мають
    окремий entry (006). При синхронізації Google Doc виправити.

### Відкриті рішення в тексті

Позначені `⚠ Відкрите рішення` (Summary §10, TF «Міграції», DB v1 «Pages», Б3 §4, Б8 Publish,
Б9 §22, Б10 §3) і посилаються на реєстр §6.

### Не змінено свідомо

Решта формулювань, що розходяться з планом, але є відкритими питаннями, лишились як є —
їх закривають рішення з §6 перед відповідним епіком:

| Формулювання в доці | Рішення |
| --- | --- |
| `v-model` / `modelValue` у прикладах і API primitives (Б3 §5, §9, §31, Б4, Б12) | C-47: читати як `:value` + `field-key`, дефолт — slot |
| Два механізми реєстрації колекцій — config і `registerCollection` (Б13 §5 vs §39) | D-41, C-27 |
| Docker «не вимагається» (Б20 §45) | C-37 |
| Різний набір CI-перевірок (Б18 §29, Б20 §15) | D-55 |
| Restore «створити / оновити Draft» (Б8 §14) | C-57 |
| Force unlock «з відповідними permissions» (Б8 Content Lock) | C-55 |
| History включає налаштування (DB v1) | D-58 |
| «Базова» validation на Save Draft (Б3 §20 vs Б8 §28) | C-58 |
