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
5. Реалізація → запис `docs/implementation/00N-*.md` → агент `review`.
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
- **C-08. Mutations через RLS.** Кожна mutation має RLS policy; UI `can()` — не захист.
  Update/delete, відфільтровані RLS, повертають 0 рядків, а не помилку — repository мапить
  це на `permission_denied` / `not_found`.
- **C-09. Схема бізнес-зрозуміла.** Окремі таблиці на сутність, без EAV/`entities`.
  JSON — лише для immutable snapshot або справді неструктурованих даних (§12). Навігація,
  мови, інтеграції — окремі таблиці, не колонки `cms_site_settings` (002).
- **C-10. Generated Supabase types** — з 005. Smoke-тест міграцій — з 005.

### Контент

- **C-11. Draft / Published / Revision розділені.** Public ніколи не читає Draft. Один
  спільний Draft на сутність. Revision immutable, мінімально — на Publish. Restore створює
  Draft, не переписує Published. Cache invalidation після Publish — частина 007 (§18–19).
- **C-12. History ≠ Undo.** Undo/Redo — локальна editor-session. Revisions — server-side.
  `editor.historyLimit` у config — розмір Undo stack (§19).
- **C-13. Concurrency = Content Lock.** Одна entity → один active editor, heartbeat,
  expiration, force unlock за правом, read-only для інших. Version checking — лише
  страховка (§20, Б8 Content Lock).
- **C-14. Media metadata.** Media entity має default alt/focal point; конкретне використання
  `CmsImage` — override (і по мовах). Контент зберігає `mediaId`, не URL (§22).
- **C-15. Localization = v2 + Summary §21.** Перекладаються бізнес-дані, не структура.
  Патерн `entity` + `entity_translations`; slug — у перекладі; мови — у БД, нова мова без
  migration/deploy; мова не видаляється, лише вимикається. Правила з ранньої v1 —
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
- **C-20. Server routes із secret key** спершу верифікують користувача (`getUser()` /
  `getClaims()`, не `getSession()` з cookie) і перевіряють `cms_can()`.

### Runtime і UI

- **C-21. Три runtime-зони.** Public не завантажує Editor/Admin/Tiptap/admin CSS. Перевірка
  бандла — частина Definition of Done; ручна з 004a, автоматизація з 006 (§9, §33).
- **C-22. Edit Mode — `/admin/edit/...`**, рендерить **ту саму** клієнтську сторінку.
  Немає `EditableAboutPage.vue`. Editor Runtime — dynamic import після входу в Edit Mode (§10).
- **C-23. Стилі Core — нативний CSS.** CSS-змінні (токени UI kit) + scoped CSS. Без Tailwind
  і SCSS у Core; Client може використовувати Tailwind для свого сайту. Токени адмінки — під
  `.cms-admin`; `runtime.css` — з 006, `editor.css` — з 008. Ізоляція — через компонент-обгортку,
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

- **C-34.** Soft delete / Trash — по сутностях: Pages у 007, Media у 009, Collections у 014.
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
  `useCmsAuth`, `usePermissions`, `useSiteSettings`.

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

### Drift код ↔ план

Відкритого drift немає: усе, що було тут, закрито в 004c.

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

`todo` · Фаза 1

- **Ціль.** Перша контентна сутність із публічним читанням, як 002 для settings.
- **Будуємо.** Таблиця `pages` + `PagesRepository` лише з read-методами (`getBySlug`,
  можливо `getAll`); playground-сторінка рендерить published контент **одним** запитом;
  generated Supabase types; smoke-тест міграцій.
- **Anti-scope.** Draft, Revisions, Edit Mode, локалізація UI, колекції, SEO-сутності «на
  майбутнє», generic CRUD.
- **Залежності.** 002, 003.
- **Блокуючі рішення.** D-02, D-03, D-04, D-05. Storage model вибирається **з урахуванням**
  007 (де живе Draft, C-06) і 010 (locale-ключ), щоб не робити міграцію даних пізніше.
- **Джерела.** §6–7, §12, §15; Б5, Б12; DB v1 → Pages.

### 006 — CMS Primitives, тільки Public Runtime

`todo` · Фаза 1

- **Ціль.** Playground виглядає як справжній сайт з editable-контрактом ще до редактора.
- **Будуємо.** `CmsText`, `CmsImage` (URL/placeholder до 009), `CmsButton`, `CmsLink`,
  `CmsRichText` як renderer без Tiptap. Легкі render-компоненти, жодного editor/admin import.
  `runtime.css`. Автоматична перевірка public bundle (скрипт).
  `CmsOptional` / `CmsCollection` — лише якщо є конкретний споживач на playground.
- **Anti-scope.** Tiptap, toolbar, hover/selection, Media Picker, `v-model`-контракт, generic `CmsField`.
- **Залежності.** 005.
- **Блокуючі рішення.** D-06, D-07 (формат rich text — якщо `CmsRichText` входить), D-08.
- **Джерела.** §8–9; Б3 §3, §5, §31; Б4; Б17.

### 007 — Draft / Publish / Revisions (дані)

`todo` · Фаза 1

- **Ціль.** Контракт даних і атомарний Publish до появи UI редактора.
- **Будуємо.** Editor State (ще не тут) / Saved Draft / Published / Revision як різні поняття;
  `saveDraft` / `getDraft` / `publish` у `PagesRepository`; Publish як Postgres-функція:
  permission → серверна validation → revision snapshot → promote → publish metadata,
  revalidation після commit (C-07, C-11); Restore = новий Draft; soft delete Pages (C-34).
  Тести: Publish атомарний, Draft не світиться в public read.
- **Anti-scope.** Editor Engine, Undo/Redo, Lock UI, scheduled publish, approval workflow,
  персональні drafts, realtime collaboration, per-locale publish.
- **Залежності.** 005.
- **Блокуючі рішення.** D-09, D-10, D-11, D-12, D-13, D-14, D-56, D-59.
- **Примітка.** Activity на Publish — тонкий хук або відкласти до 012 (D-14).
- **Джерела.** §18–20; Б8.

### 008 — Edit Mode (мінімальний вертикальний зріз)

`todo` · Фаза 1

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
- **Anti-scope.** Page builder, окремий editable tree, iframe, Media Picker (009),
  collaborative editing, History UI як Undo, language switcher (після 010).
- **Залежності.** 006, 007.
- **Блокуючі рішення.** D-15, D-16, D-17, D-18, D-19, D-20, D-57.
- **DoD.** Public не імпортує Editor — перевірка бандла входить у Definition of Done.
- **Джерела.** §10–11, §20; Б3; Б8 → Content Lock; дизайн-ТЗ §10.

### 009 — Media + Storage Adapter

`todo` · Фаза 1

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
- **Блокуючі рішення.** D-21, D-22, D-23, D-24, D-25.
- **Джерела.** §22; Б7; дизайн-ТЗ §4.

### 010 — Localization v2

`todo` · Фаза 2

- **Ціль.** Мультимовність бізнес-даних після того, як один locale пройшов повний цикл.
- **Будуємо.** `languages` (source of truth, рівно одна active default, add / disable /
  reactivate / set default); патерн `*_translations` для Pages; repository віддає плаский
  `page.title`; Settings → Languages; Edit Mode редагує поточну мову + language switcher;
  fallback-політика в Project Config; дані для hreflang/canonical.
- **Anti-scope.** AI translation, per-locale page trees, Translator role, ручні translation
  statuses / `outdated`, фізичне видалення мови, per-locale lock.
- **Залежності.** 007, 008 (і 009 — для alt по мовах).
- **Блокуючі рішення.** D-26, D-27, D-28, D-29, D-30.
- **Ризик.** `@nuxtjs/i18n` вимагає список locales на build-time для prefix-маршрутів, а мови з
  БД — без deploy. Routing локалізованого сайту — відповідальність Client (`[[locale]]` +
  middleware); Core лише дає дані.
- **Джерела.** §21; Б9 (v2 + §22 «Доповнення»).

### 011 — Forms infrastructure

`todo` · Фаза 3

- **Ціль.** Lifecycle форм у Core; поля конкретної форми задає Client.
- **Будуємо.** Form і Submission — різні сутності; реєстрація форми runtime-кодом Client;
  `POST /api/forms/[key]` → server validation → honeypot + rate limit → збереження →
  secondary notifications; Admin: список форм, submissions з фільтрами
  (unread/read/archived/spam), detail, mark read / mark all read, archive, spam, CSV export,
  enable/disable.
- **Anti-scope.** Form builder, `form_fields` / EAV, conditional logic, CRM, обов'язкова CAPTCHA,
  webhooks, auto-reply, Draft/Publish для форм. Нотифікації — 013; форми працюють і без них.
- **Залежності.** 003; Activity-події — 012; attachments (якщо будуть) — 009.
- **Блокуючі рішення.** D-31, D-32, D-33, D-34, D-35, D-36.
- **Джерела.** §23; Б14; дизайн-ТЗ §5.

### 012 — Activity (Admin UI + Restore)

`todo` · Фаза 3

- **Ціль.** Журнал значущих мутацій і Restore там, де це повернення Revision у Draft.
- **Будуємо.** Хто / що / коли / яка сутність; запис із repositories (не з Vue); фільтри;
  групування по датах; Restore для подій, прив'язаних до ревізій.
- **Anti-scope.** Infrastructure backup log, «відновити базу з Activity», field-level diff
  для всіх подій, другий лог, якщо тонкий sink з'явився в 007.
- **Залежності.** 007 (ревізії), 011 (події форм).
- **Блокуючі рішення.** D-14 (якщо не закрите в 007), D-37.
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

1. Pages list (статуси, Edit / View / History / Publish) — після 007–008.
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
| Data Layer (Б5, Б12) | UI → Composable → Repository → Backend Adapter; domain types на виході; нормалізовані помилки (`CmsDataError` розширюється по факту: `validation` у 007, `conflict` у 008). |
| Deployment (Б20) | Деплоїться Client Project; окрема БД на environment; міграція → deploy; backward-compatible міграції; noindex і вимкнений GA поза Production. |
| Backup (Б21) | Помилка редактора → Revision / Trash. Інфраструктура → backup провайдера. Storage-файли провайдер не бекапить — потрібен задокументований скрипт синхронізації (R-08). Власний backup engine не пишемо. |

---

## 6. Реєстр відкритих рішень

Рішення закриваються автором **перед планом** вказаного епіку. «Рекомендація» — пропозиція
з аудиту, не рішення. Після закриття рішення переходить у §2.

### Фаза 0–1

| ID | Епік | Питання | Варіанти | Рекомендація |
| --- | --- | --- | --- | --- |
| D-02 | 005 | Storage model значень полів сторінки | JSONB-документ на сторінку; колонки на поле; таблиця `page_fields` | Узгодити з D-09 і локалізацією: документ на (page, locale, state) найпростіший для code-defined сторінок |
| D-03 | 005 | Як code-defined сторінка отримує рядок у `pages` | Реєстрація в коді + upsert; seed-міграція Client; auto-create при першому edit | Реєстрація в Client + idempotent upsert |
| D-04 | 005 | Хто володіє slug/route статичної сторінки | Route у коді, slug у БД лише для template-сутностей; slug у БД для всіх | Статичні — route у коді; slug у БД — для template pages (Products тощо) |
| D-05 | 005 | Що означає «Create page» у дизайн-ТЗ | Лише запис template-типу; прибрати для статичних | Лише template-тип (C-01) |
| D-06 | 006 | Контракт значення primitive | `v-model`; `value` prop + `fieldKey`, зміна лише через Editor Engine; primitive читає з контексту за `fieldKey` | `value` + `fieldKey`, без `v-model` |
| D-07 | 006/008 | Формат rich text | Tiptap JSON + власний легкий renderer; sanitized HTML | Вирішувати, коли з'явиться реальне rich-поле |
| D-08 | 006 | Формат field address | `hero.title`, `services.items.<id>.title`; хто генерує id елементів | Dotted path + uuid елементів, генерує клієнт |
| D-09 | 007 | Де живе Draft | Окрема таблиця draft / published; колонки + view; окрема схема | Окреме сховище (C-06) |
| D-10 | 007 | Що знімає revision при Publish | Нову published-версію; попередню | Нову (перша публікація теж має ревізію) |
| D-11 | 007 | Серверна validation при Publish | Правила реєструють компоненти (сервер не бачить); декларативна схема полів у Client; лише required/limits на сервері | Мінімальна декларативна схема полів, спільна для клієнта й сервера |
| D-12 | 007 | Модель статусів сторінки | Draft / Published; + Hidden (з ТЗ); + «published, є неопубліковані зміни» | Derived статус із draft/published + окремий прапорець видимості, якщо Hide реально потрібен |
| D-13 | 007 | Lock-дані: у 007 чи 008 | RPC 007 одразу приймають lock-токен; 008 переписує сигнатури | Таблиця lock і перевірка в RPC — у 007, UI — у 008 |
| D-14 | 007 | Activity на Publish до 012 | Тонкий write-sink у 007; відкласти до 012 | Що дешевше на момент 007 (не будувати таблицю «про запас») |
| D-15 | 008 | Механізм `/admin/edit/[...path]` | `router.resolve().matched` + ручний рендер; той самий маршрут + edit-прапорець; catch-all у Client | Spike на старті 008 |
| D-16 | 008 | Editor binding для сутностей | Context: entity type + id + repository; мінімальний Draftable-контракт (`getDraft` / `saveDraft` / `publish`) | Так, мінімальний контракт |
| D-17 | 008 | Autosave у V1 | Явний Save Draft (як у ТЗ); autosave з debounce | Явний Save Draft; autosave — пізніше |
| D-18 | 008 | Чи пише autosave/Save Draft в Activity | Кожне збереження; лише Publish/Restore | Лише meaningful (Publish, Restore, Reset) |
| D-19 | 008 | Глобальний контент у Edit Mode (header, footer, логотип) | Окрема сутність із Draft/Publish і своїм lock; read-only в Edit Mode; редагується в Settings | Не в першому зрізі; логотип — Settings → Brand |
| D-20 | 008 | Publish з незбереженим Editor State; Undo після Publish | Auto-save перед Publish; Publish лише зі збереженого; очищати Undo | Publish лише зі збереженого Draft (як у ТЗ) |
| D-21 | 009 | Upload | Прямо в Storage з policies; через server endpoint (перевірка magic bytes) | Server endpoint для валідації; або direct + post-check |
| D-22 | 009 | Media usage tracking | Registry `media_usage`; запити по контенту; резолвери для клієнтських таблиць | Registry, якщо дешево; інакше наступним кроком |
| D-23 | 009 | Оптимізація зображень | Оригінали; `@nuxt/image` + IPX / провайдер хостингу; Supabase transformations (платно) | `@nuxt/image` з провайдером хостингу, без власного pipeline |
| D-24 | 009 | Формат `CmsImageValue` | `{ mediaId, altOverride?, decorative, focal?, caption? }` | Цей набір, без caption, поки немає споживача |
| D-25 | 009 | Upload limits і типи | Як у ТЗ (JPG/PNG/WebP, 5MB) + SVG / документи / відео з фільтрів | Почати з ТЗ + SVG; документи/відео — за потребою |

### Фаза 2–3

| ID | Епік | Питання | Варіанти | Рекомендація |
| --- | --- | --- | --- | --- |
| D-26 | 010 | Publish на entity чи entity × locale | Вся entity (Summary §18); по locale | Вирішити разом з D-12; per-locale практичніше для перекладачів |
| D-27 | 010 | Local repeatable і переклади | Спільна структура масиву, перекладаються тексти; масив повністю per locale | Спільна структура («перекладаються дані, не структура») |
| D-28 | 010 | Рівні alt | Media default; + usage override; + per locale | Default мовою за замовчуванням + per-usage override у локалізованому контенті |
| D-29 | 010 | Вмикання мультимовності | `features.multilingual` у config + runtime toggle; «мов > 1» = multilingual | «Мов > 1» (toggle з ТЗ зайвий) |
| D-30 | 010 | Localized settings у V1 | `cms_site_settings_translations` одразу; лише з другою мовою | Лише коли з'явиться друга мова |
| D-31 | 011 | Public submit | Anon insert policy; server route із `SUPABASE_SECRET` (раніше за 015.2) | Server route; server-only клієнт з'являється тут, а не в 015.2 |
| D-32 | 011 | Rate limiting у serverless | Таблиця в Postgres; KV хостингу; механізм хостингу | Таблиця в Postgres |
| D-33 | 011 | Синхронізація `registerForm` із рядком `forms` | Seed; міграція; lazy на першому submit; upsert на старті | Lazy upsert |
| D-34 | 011 | Валідація клієнт + сервер | Спільна схема (напр. Valibot/Zod); vee-validate лише в адмінці | Спільна легка схема в Client, сервер перевіряє ту саму |
| D-35 | 011 | Колонки списку submissions і CSV | Метадані полів у реєстрації форми | Так, label + key у реєстрації |
| D-36 | 011 | Attachments, «View locations» | V1 / пізніше; статична декларація usage | Пізніше; usage — статична декларація |
| D-37 | 012 | Activity Restore з diff «попереднє vs поточне» | Лише для подій із ревізією; field-level before/after у всіх подіях | Лише для подій із ревізією |
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
| D-56 | 007 | Restore, коли вже є незбережений спільний Draft (Б8 §14 «створити / оновити Draft» перезапише чужу роботу) | Restore мовчки перезаписує Draft; вимагає lock + підтвердження; перед перезаписом знімає snapshot поточного Draft | Restore вимагає lock і явне підтвердження «поточний Draft буде замінено» |
| D-57 | 008 | Хто може робити Force Unlock (у доці «користувач із відповідними permissions», право не назване) | Лише Owner; Owner + Admin; окреме право за матрицею | Окреме право (`pages.unlock`, далі `<entity>.unlock`), за матрицею — owner і admin |
| D-58 | 015 | Чи мають Settings ревізії (DB v1 «History» включала налаштування; Б8 §26 — Draft/Revisions лише там, де є work-in-progress) | Revisions для settings; лише Activity-запис змін; нічого | Без ревізій у V1, лише Activity-запис значущих змін (після 012) |
| D-59 | 007 | «Базова» validation на Save Draft (Б3 §20) vs «Save Draft не вимагає повної validation» (Б8 §28) — межа не визначена | Save Draft без валідації; лише типи й жорсткі ліміти; повна | Save Draft перевіряє лише типи й жорсткі ліміти (без required); повна — на Publish. Узгодити з D-11 |

---

## 7. Технічні ризики

Факти, які дока не враховувала. Кожен уже прив'язаний до рішення або епіку.

| ID | Ризик | Наслідок | Де вирішується |
| --- | --- | --- | --- |
| R-01 | RLS рядкова | Draft / приватні поля в рядку, видимому anon, витікають | C-06, D-09 |
| R-02 | Supabase JS не має клієнтських транзакцій | Publish / Restore / Lock неатомарні без RPC | C-07 |
| R-03 | Validation з Vue-компонентів сервер не бачить | Прямий API-запит публікує невалідний контент | D-11 |
| R-04 | Статичний import editable-гілки primitive | Editor-код у public bundle | 006, 008 (async-гілка) |
| R-05 | Nuxt не рендерить чужий page-компонент із layout «з коробки» | Edit Mode не відтворює сайт | D-15 (spike) |
| R-06 | Supabase CLI — одна лінійна історія міграцій | «Два незалежні джерела» не працюють as-is | D-50 |
| R-07 | `"private": true`, немає `bin`; `npx nuxt-cms` резолвиться за назвою пакета | Пакет не публікується, CLI не запускається | C-30, 016 |
| R-08 | Supabase не бекапить Storage-файли; daily DB backups — лише на платних планах | Втрата медіа при видаленні bucket/файлів | §5 Backup, 016 Checklist |
| R-09 | Image transformations Supabase — платні | Немає ресайзу / WebP на free-плані | D-23 |
| R-10 | In-memory rate limit у serverless не спільний | Захист форм від спаму не працює | D-32 |
| R-11 | Custom JWT claims застарівають до refresh (~1 год) | Деактивація / пониження ролі не миттєві | C-16 |
| R-12 | `inviteUserByEmail` падає для існуючого email; немає події `invited → active` | Invite існуючого користувача ламається | 015.2 |
| R-13 | Replace у той самий storage path | Застарілий CDN/браузерний кеш | 009 (новий path) |
| R-14 | `@nuxtjs/i18n` в Core layer | Злиття locales із Client, vue-i18n у public | Вирішено в 004c (C-36) |
| R-15 | `cms.config.ts` серіалізується в client bundle | Функції губляться, «приватні» значення стають публічними | C-27 |
| R-16 | Custom scripts в Admin | Навмисний stored-XSS канал | D-47 |
| R-17 | GA4 Data API для Analytics/Dashboard потребує OAuth / service account | Сторінка Analytics із ТЗ — окремий проєкт | 015, D-49 |
| R-18 | `navigator.sendBeacon` не передає `Authorization` | Release lock при закритті вкладки не автентифікується | 008 (`fetch keepalive` / server route) |
| R-19 | SMTP-бібліотеки потребують Node runtime | Не працюють на edge-хостингах | 013 (HTTP-API провайдер) |

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
| Pages: статус Hidden, дія Publish/Hide | Немає в моделі Draft/Publish | D-12 |
| Dashboard: «Create page» | Статичні сторінки задає розробник | D-05 |
| Collections: Active/Hidden; Delete | Draft/Publish; soft delete | D-44, C-34 |
| Activity: Restore з diff | Restore лише для подій з ревізією | D-37 |
| Media: Replace «з медіатеки» | Змішує Replace Media і Change Image | 009 |
| Integrations: 8 провайдерів | V1 — Telegram, Email, GA, GTM; решта Soon / Client | 013 |
| Settings → SEO: GA ID | GA в трьох місцях (SEO, Integrations, Analytics) — одне джерело: Integrations | 013, 015 |
| Settings → Brand: основний колір | Механізм передачі в CSS Client не визначений | D-48 |
| Settings → Languages: «увімкнення мультимовності» | Конфлікт із config-прапорцем | D-29 |
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

### Відкриті рішення в тексті

Позначені `⚠ Відкрите рішення` (Summary §10, TF «Міграції», DB v1 «Pages», Б3 §4, Б8 Publish,
Б9 §22, Б10 §3) і посилаються на реєстр §6.

### Не змінено свідомо

Решта формулювань, що розходяться з планом, але є відкритими питаннями, лишились як є —
їх закривають рішення з §6 перед відповідним епіком:

| Формулювання в доці | Рішення |
| --- | --- |
| `v-model` у прикладах primitives (Б3, Б4, Б12) | D-06 |
| Два механізми реєстрації колекцій — config і `registerCollection` (Б13 §5 vs §39) | D-41, C-27 |
| Docker «не вимагається» (Б20 §45) | C-37 |
| Різний набір CI-перевірок (Б18 §29, Б20 §15) | D-55 |
| Restore «створити / оновити Draft» (Б8 §14) | D-56 |
| Force unlock «з відповідними permissions» (Б8 Content Lock) | D-57 |
| History включає налаштування (DB v1) | D-58 |
| «Базова» validation на Save Draft (Б3 §20 vs Б8 §28) | D-59 |
