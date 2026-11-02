# Implementation roadmap

Тезисний порядок епіків для `nuxt-cms-core`. Це не плани реалізації.

Повноцінний план пишемо окремо на кожен наступний епік — у тому ж форматі, що
план 002 (Data Layer + Site Settings): чому саме цей блок, anti-scope,
конкретні файли, перевірка, що свідомо не робимо.

Джерело вимог: [архітектурний документ](https://docs.google.com/document/d/1iL23fjzqbNOZZedsEpg-Qgf7vGQROQdYSCVScSt9q3o/edit).
Нумерація «Блок 3–21» у доці — тематичні розділи, не порядок збірки.

---

## Як користуватися цим файлом

1. Беремо наступний епік зі статусом `todo`.
2. Перед планом перечитуємо примітки епіка + «Канонічні правки» нижче.
3. Якщо в епіку є відкрите рішення — питаємо, не вигадуємо схему чи API.
4. Після реалізації з’являється `docs/implementation/00N-....md` і статус тут стає `done`.
5. Не стрибаємо через епік: послідовність виведена з залежностей, не з нумерації доки.

Головний принцип розробки (вже зафіксований користувачем):
маленькі завершені зрізи, рішення — лише коли вони реально потрібні.
Не проєктуємо Draft, Media, Lock і Edit Mode одночасно.

---

## Канонічні правки до документа

У кінці доки є блок «прибрати суперечки». Поки документ фізично не почищений,
ці правила важливіші за ранні формулювання:

- **Localization тільки v2.** Перекладаються бізнес-дані, не структура сторінки.
  Блок 9 v1 ігнорувати.
- **Page — routable content entity, не дерево секцій.** Структура живе у Vue/Nuxt
  Client Project. CMS не зберігає `sections[]` / component tree.
- **Repository має лише ті методи, які потрібні його сутності.** Не універсальний
  CRUD/Publish на всі репозиторії.
- **Core vs Client repositories.** Core: Pages, Media, Forms, Languages, Settings,
  Activity, Revisions, Users. Client: Products, Doctors, будь-яка бізнес-сутність сайту.
- **Secrets двох типів.** Bootstrap (`SUPABASE_URL`, ключі, без яких CMS не стартує)
  — лише `.env` / hosting. Owner-managed (Telegram, SMTP, Stripe) — пізніше, окремий
  secure layer, не звичайні runtime settings. Підключення самого Supabase не може
  бути сторінкою всередині вже запущеної CMS.
- **Concurrency = Content Lock.** Одна entity → один active editor. Version checking
  — лише додаткова страховка, не основний механізм.
- **History ≠ Undo.** Undo/Redo — локальна editor-session. Revisions — server-side
  snapshot, мінімально при Publish. Restore створює Draft, не переписує Published.
- **E2E за замовчуванням немає.** Vitest + Nuxt Test Utils. Playwright у стеку доки
  — застаріле.
- **Назва пакета — `nuxt-cms-core`.** Ігнорувати `@igor/cms-core`, `igor-cms` у доці.
- **Business Collection ≠ local repeatable.** Product/Doctor/Blog — окремі сутності
  (часто в Client Project). `Hero.benefits[]`, FAQ секції — масив у контенті сторінки
  через `CmsCollection`, не глобальний розділ Content.
- **Media metadata.** Entity має default alt/focal point; конкретний `CmsImage` може
  мати override (і по мовах).
- **Дизайн-ТЗ адмінки — макет, не ліміт.** Home/About/4 сторінки/5 форм/Products —
  приклади UI, не hardcoded набір Core.
- **Client Project може містити wiring.** Не дублює універсальну CMS-логіку, але має
  власні repositories, registrations, `cms.config.ts`, бізнес-інтеграції.

Архітектурний пріоритет при неоднозначності: цей файл → Architecture Summary →
найновіша версія блоку → найпростіше рішення.

---

## Зроблено

### 001 — Package foundation

`done` · [запис](./001-foundation.md)

Пакет існує як Nuxt Layer + внутрішній Module, `cms.config.ts`, `#cms/config`,
`useCms()`, playground.

### 002 — Data Layer + Site Settings (read-only)

`done` · [запис](./002-data-layer-site-settings.md)

Зафіксована межа `Repository → Backend Adapter` на одній сутності.
Є `SettingsRepository.get()`, `useSiteSettings()`, міграція `site_settings`,
RLS тільки на `select`, `CmsDataError`, lazy anon-клієнт.

Наступні епіки не створюють `BaseRepository` / factory, поки дві реальні
сутності не почнуть дублювати код.

### 003 — Auth, CMS Users, Permissions

`done` · [запис](./003-auth.md)

`auth.users` — identity, `cms_users` — доступ до CMS. Login, сесія в cookie,
статична матриця `can()`, middleware на `/admin`, включно з `/admin/edit`. Invite і
`SUPABASE_SECRET` не входять: вони потрібні Settings → Users.

---

## Принцип послідовності

```
Auth  →  перший запис (Settings + Admin shell)
      →  Pages (published) + public primitives
      →  Draft / Publish / Revisions
      →  Edit Mode (текст)
      →  Media → зображення в Edit Mode
      →  Localization v2
      →  Forms → Activity UI → Integrations
      →  Collections UI (інфраструктура, не Products)
      →  решта Admin + CLI
```

Чому не з Edit Mode і не з адмінки «як у макеті»:
без Auth немає жодного безпечного запису; без Data Layer на Pages немає чого
редагувати; без Draft/Publish Edit Mode писав би в Published напряму — це заборонено.

---

## Епіки

### 004 — Admin shell + запис Site Settings

`todo` · джерело: дизайн-ТЗ (навігація, Settings → General), Блок 10, 17

**Чому тут.** Найдешевший write-зріз: сутність уже є, Auth уже є.
Одночасно з’являється Admin Runtime як окрема зона, не завантажена на публічному сайті.

**Що будуємо.**

- `/admin` layout, сайдбар (пункти можуть бути заглушками).
- Settings → General: те, що вже є в `site_settings`
  (`siteName`, `contactEmail`, `contactPhone`, `maintenanceMode`).
- `SettingsRepository.update()`, RLS write для cms-користувачів із permission.
- Мінімальні `BaseInput` / `BaseButton` — лише ті, що реально потрібні формі.
  Не UI-kit «на майбутнє».

**Anti-scope.** Dashboard віджети, Brand/SEO/Social/Languages/Navigation,
System, Analytics. Навігація сайту — окрема таблиця, не колонка в `site_settings`
(уже зафіксовано в 002).

**Примітка для плану.** Перевірити isolation: публічний playground не тягне
admin chunk / admin CSS.

---

### 005 — Pages як content entity (published read)

`todo` · джерело: Блок 5, 12, 13; канонічна правка про Page

**Чому тут.** Edit Mode і Admin → Pages не мають сенсу без репозиторію сторінки.
Але Draft ще не чіпаємо: спочатку публічне читання, як у 002 зі settings.

**Що будуємо.**

- Таблиця `pages` + `PagesRepository` з методами, потрібними для read
  (наприклад `getBySlug` / `getAll`). Без generic CRUD.
- Playground-сторінка рендерить published контент.
- Сторінка тягне дані **одним** запитом і передає в компоненти.
  Primitive сам у базу не ходить (Блок 5, п. 15).

**Відкрите рішення — обов’язково спитати перед планом.**

Як фізично зберігати page field values. Документ забороняє зберігати структуру
сторінки, але не фіксує storage model самих полів. Це те саме питання, яке
свідомо відклали після foundation. Не вигадувати JSONB vs колонки vs EAV
у плані без відповіді користувача.

**Anti-scope.** Draft, Revisions, Edit Mode, локалізація сторінки, колекції,
SEO-сутності «на майбутнє».

---

### 006 — CMS Primitives, тільки Public Runtime

`todo` · джерело: Блок 4, 3 (розділення runtime), 17

**Чому тут.** Щоб Client Project (playground) почав виглядати як справжній сайт
з editable-контрактом, ще до редактора. Легше перевірити, що Editor Runtime
пізніше не просочиться в public bundle.

**Що будуємо.**

- `CmsText`, `CmsImage` (поки можна URL або placeholder; `mediaId` — після 009),
  `CmsButton`, `CmsLink`. `CmsRichText` — лише renderer, без Tiptap.
- У Public Mode це легкі render-компоненти. Жодного імпорту editor/admin.
- `CmsOptional` / `CmsCollection` — тільки якщо вже є конкретний споживач
  на playground-сторінці. Інакше пізніше, разом з Edit Mode.

**Anti-scope.** Tiptap, toolbar, hover/selection, Media Picker, будь-який
`editor/` import з public primitive.

---

### 007 — Draft / Publish / Revisions (дані)

`todo` · джерело: Блок 8; канонічні правки 5–6

**Чому перед Edit Mode.** Редактор не має права писати в Published.
Спочатку контракт даних і атомарний Publish, потім UI.

**Що будуємо.**

- Чотири різні поняття: Editor State (ще не тут), Saved Draft, Published,
  Revision.
- `saveDraft` / `getDraft` / `publish` у `PagesRepository`.
- Publish: permission → validation → Revision snapshot → оновлення Published →
  (пізніше Activity). Або все, або Published не змінюється.
- Revision immutable. Не на кожен кейстрок. Restore = новий Draft, не rollback
  Published.
- Один спільний Draft на сутність, не персональні чернетки.

**Anti-scope.** Editor Engine, Undo/Redo, Content Lock UI, Scheduled Publish,
approval workflow, персональні drafts, realtime collaboration.

**Примітка.** Content Lock — з Edit Mode (008), не з цього епіка.
Activity write на Publish можна покласти тонкий хук, якщо 012 ще немає —
або відкласти рядок логу до 012, щоб не будувати таблицю «про запас».
Спитати в плані, що дешевше на той момент.

**Тести.** Друге місце, де тести потрібні: Publish атомарний, Draft не світиться
в public read.

---

### 008 — Edit Mode (мінімальний вертикальний зріз)

`todo` · джерело: Блок 3, 4, 8 (lock), дизайн-ТЗ «Edit Mode»

**Чому тут.** Уже є Auth, Pages, Draft/Publish, public primitives.
Це перший раз, коли складається головний сценарій CMS.

**Що будуємо в першому зрізі.**

- Маршрут `/admin/edit/...` рендерить **ту саму** сторінку, що й public.
  Немає `EditableAboutPage.vue`.
- Editor Runtime — dynamic import тільки після входу в Edit Mode.
- Editor Engine: current draft, dirty, selected field, save status.
- `CmsText` стає inline-editable. Save Draft + Publish.
- Preview: draft без контролів.
- Content Lock: одна entity → один editor, heartbeat, timeout, іншим — read-only.

**Друга хвиля того ж епіка або 008b — не планувати зараз, лише пам’ятати:**

- Undo/Redo (локально), валідація лімітів, Reset до Published.
- Toolbar, hotkeys, leave-without-saving.
- `CmsRichText` + Tiptap — тільки коли з’явиться реальне rich-поле.
- `CmsCollection` (add/delete/duplicate/reorder локального масиву).
- Language switcher — після 010.

**Anti-scope.** Page builder, окремий editable tree, Media Picker (009),
колаборативне редагування полів, History UI як Undo.

**Примітка для плану.** Public не імпортує Editor. Перевірка бандла — частина
Definition of Done, не «потім».

---

### 009 — Media + Storage Adapter

`todo` · джерело: Блок 7; канонічна правка 10

**Чому після текстового Edit Mode.** Текстовий зріз не повинен чекати Storage.
Зображення в Edit Mode без Media Entity були б тупиком (заборонено зберігати
сирий URL як джерело істини).

**Що будуємо.**

- Файл у Storage ≠ рядок у `media`. CMS працює з Media Entity (`mediaId`).
- `MediaRepository` + Storage Adapter. Supabase Storage ізольований так само,
  як SDK у 002.
- Admin → Media: upload, list, delete/replace. Usage tracking — якщо дешево
  на першому зрізі; інакше наступним кроком.
- `CmsImage` переходить на `mediaId`. Edit Mode: вибір з бібліотеки.
- Settings → Brand (лого / favicon) може прийти сюди, бо потребує Media.

**Anti-scope.** Image pipeline, auto WebP/AVIF, crop, version history файлів
(Блок 19). Власний CDN. Прив’язка UI до публічного Supabase URL як до контракту.

---

### 010 — Localization v2

`todo` · джерело: Блок 9 **v2 only**

**Чому не раніше.** Спочатку один locale повинен повністю пройти
read → draft → edit → publish. Інакше локалізація проєктується на незафіксовану
модель контенту.

**Що будуємо.**

- `languages` — окрема сутність, source of truth. Не `locales` у `cms.config.ts`.
- Патерн: основна таблиця + `*_translations`. Нелокалізовані поля
  (status, media relations, sort) не дублюються.
- Repository приховує join і віддає `product.title`, не `translations[0]`.
- Settings → Languages: add / disable / default. Одна default locale завжди.
- Edit Mode редагує **поточну** мову; структура сторінки не змінюється.
- Fallback — політика в Project Config, коли з’явиться друга мова.

**Anti-scope.** AI translation, per-locale page trees, окремий Translator role
без потреби.

---

### 011 — Forms infrastructure

`todo` · джерело: Блок 14, дизайн-ТЗ Forms

**Що будуємо.**

- Form і Submission — різні сутності. Не Form Builder.
- Client Project задає поля конкретної форми. Core — lifecycle:
  accept, validate, store, read/unread/archive/spam, Admin list.
- Публічний submit іде в репозиторій, не в Supabase зі сторінки.

**Anti-scope.** Dynamic field builder, CAPTCHA marketplace, auto-reply templates,
webhook retries (Блок 19). Нотифікації в Telegram — епік 013, форми мають
працювати і без нього.

---

### 012 — Activity (Admin UI + Restore)

`todo` · джерело: Блок 8 (activity у Publish), дизайн-ТЗ Activity, Блок 21

**Що будуємо.**

- Журнал мутацій: хто / що / коли / на якій сутності.
- Фільтри й Restore там, де restore = повернути Revision у Draft.
- Писати в Activity з репозиторіїв, не з Vue-компонентів.

**Примітка.** Якщо тонкий write-sink з’явився раніше (007/004) — тут лише UI
і Restore. Не будувати другий лог.

**Anti-scope.** Infrastructure backup log, «відновити всю базу з Activity».

---

### 013 — Integrations (перший живий provider)

`todo` · джерело: Блок 15; канонічна правка 4 (secrets)

**Що будуємо.**

- Не один інтерфейс `connect/send/charge/track`.
- Малі capability contracts: наприклад `NotificationProvider`.
- Перший provider — той, який уже має споживача (ймовірно Telegram для Forms).
- Реєстрація `registerIntegration({ key, provider })`.
- Admin → Integrations: connected / not / needs attention.
- Owner-managed secrets — не в `site_settings` і не в `.env` хостингу через UI.

**Anti-scope.** Marketplace, Zapier, WhatsApp, платежі «бо вони в макеті».
Платежі — Client/пізніше, якщо не повторюються між проєктами. Картки Soon —
тільки для найближчого.

---

### 014 — Collections UI (інфраструктура Core)

`todo` · джерело: Блок 13; канонічні правки 3, 9, 11

**Чому пізно.** Патерн list/edit/publish уже має існувати на Pages.
Core не знає Products.

**Що будуємо.**

- Універсальні Admin-патерни: таблиця, пошук, статус, create/edit/archive.
- Client Project реєструє свою колекцію (репозиторій + поля + можливо template).
- Playground може показати один фейковий/демо тип — не «Products у Core».

**Anti-scope.** Universal entity engine, `collection_fields` / EAV,
taxonomy engine для всіх типів, page builder для template pages.
`CmsCollection` для `benefits[]` сюди не входить — це 008.

---

### 015 — Решта Admin + Configuration growth

`todo` · джерело: дизайн-ТЗ, Блок 10, 11

Екран за екраном, коли є дані. Не окремий «намалювати всю адмінку».

Орієнтовний внутрішній порядок:

1. Pages list (статуси, Edit / View / History / Publish) — після 007–008.
2. Settings → Users (якщо не закрито в 003).
3. Settings → SEO / Social / Advanced / Navigation (окремі таблиці/поля).
4. Dashboard як агрегатор — коли є Forms + Activity + (опційно) Analytics.
5. System (версії, environment read-only, diagnostics) — Owner-only, багато
   пунктів можуть лишитися Soon.
6. `cms.config.ts` розширюється **по факту потреби** епіка (modules/flags),
   не окремим «конфіг-епіком».

Analytics у макеті = інтеграція GA, не власний аналітичний рушій.

---

### 016 — CLI / Developer workflow

`todo` · джерело: Блок 16, 20

**Чому останній серед V1-продукту.** CLI автоматизує вже існуючий процес.
Поки процес нестабільний, CLI фіксує зайве.

**Що будуємо, коли дійдемо.**

- Обгортка над `nuxi`, не власний генератор Nuxt.
- Підключити Core, скопіювати/застосувати Core migrations, створити
  `cms.config.ts`, bootstrap Owner.
- Оновлення Core + перевірка schema version vs package version.

**Anti-scope.** Marketplace, auto-fix усіх конфліктів, власний backup engine.

---

## Не епіки (наскрізні обмеження)

Ці блоки доки не мають окремого місця в черзі. Кожен план епіка перевіряє їх.

| Тема | Правило |
| --- | --- |
| Performance (17) | Public не тягне Admin/Editor/Tiptap. Перевірка бандла в DoD. |
| Testing (18) | Тести — permissions, Publish, критичні repository workflows. Не UI snapshots, не E2E. |
| Security (11) | UI `can()` ≠ захист. RLS обов’язковий на кожну mutation. |
| Configuration (10) | Чотири рівні: Core defaults / `cms.config.ts` / DB settings / env. Не змішувати. |
| Deployment (20) | Деплоїться Client Project, не Core. Локальний CLI і хмара — ті самі міграції, різна env. |
| Backup (21) | Помилка редактора → Revision/Trash. Інфраструктура → backup провайдера. Не писати власний backup engine. |

---

## Поза V1

З Блоку 19 і «Не перевантажувати V1». Не планувати, не закладати модулі «про запас»:

Plugin Marketplace, Visual Page Builder, Workflow Engine, Dynamic Form Builder,
черги / Redis, multi-tenant SaaS, власна CRM / email platform, 2FA, scheduled
publish, AI-фічі, image optimization pipeline, Backup Manager UI.

В адмінці Soon — лише те, що реально наступне, не десятки карток.

---

## Карта «блок доки → епік»

| Блок у доці | Куди в черзі |
| --- | --- |
| Architecture Summary, Foundation | 001 (зроблено) |
| 5 Data Layer, 10 Config (env), 12 Contract | 002 (зроблено), далі росте з кожною сутністю |
| 6 Auth | 003 |
| Дизайн-ТЗ Admin, 4 UI primitives за потреби | 004, 015 |
| 5/12 Pages | 005 |
| 4 CMS primitives, 17 public runtime | 006 |
| 8 Draft/Publish/Revisions | 007 |
| 3 Edit Mode, 8 Content Lock | 008 |
| 7 Media | 009 |
| 9 Localization **v2** | 010 |
| 14 Forms | 011 |
| Activity у 8 + дизайн-ТЗ | 012 |
| 15 Integrations | 013 |
| 13 Collections | 014 |
| 10/11 решта Settings/System | 015 |
| 16 CLI, 20 Deploy | 016 |
| 17 / 18 / 21 | наскрізні обмеження |
| 19 Future | поза V1 |
