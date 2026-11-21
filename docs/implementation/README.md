# Журнал епіків

Статуси епіків `nuxt-cms-core` і посилання на записи реалізації.

- **Головний план** (фази, епіки, канонічні рішення, реєстр відкритих рішень):
  [`docs/MASTER_PLAN.md`](../MASTER_PLAN.md).
- **Архітектурна дока** (почищена копія): [`docs/source/architecture.md`](../source/architecture.md).

Цей файл не дублює план. Опис епіку, anti-scope і блокуючі рішення — у MASTER_PLAN §4;
канонічні правила — у MASTER_PLAN §2.

---

## Як користуватися

1. Беремо наступний епік зі статусом `todo` нижче.
2. Читаємо його розділ у MASTER_PLAN §4 і закриваємо блокуючі рішення з реєстру §6.
3. Пишемо план епіку у форматі 002: чому саме цей блок, anti-scope, конкретні файли,
   перевірка, що свідомо не робимо.
4. Після реалізації з'являється `docs/implementation/00N-....md`, статус тут і в MASTER_PLAN
   стає `done`.
5. Не стрибаємо через епік: послідовність виведена із залежностей.

---

## Статуси

| Епік | Назва | Фаза | Статус | Запис |
| --- | --- | --- | --- | --- |
| 001 | Package foundation | 0 | `done` | [001](./001-foundation.md) |
| 002 | Data Layer + Site Settings (read-only) | 0 | `done` | [002](./002-data-layer-site-settings.md) |
| 003 | Auth, CMS Users, Permissions | 0 | `done` | [003](./003-auth.md) |
| 004a | Admin UI foundation + Login | 0 | `done` | [004a](./004a-admin-ui-foundation.md) |
| 004b | Admin shell + запис Site Settings | 0 | `done` | [004b](./004b-admin-shell-settings.md) |
| 004c | Alignment (вирівнювання перед 005) | 0 | `done` | [004c](./004c-alignment.md) |
| 005 | Pages як content entity (published read) | 1 | `done` | [005](./005-pages.md) |
| 006 | CMS Primitives, тільки Public Runtime | 1 | `done` | [006](./006-primitives.md) |
| 007 | Draft / Publish / Revisions (дані) | 1 | `done` | [007](./007-draft-publish.md) |
| 008 | Edit Mode (перша версія UI) | 1 | `done` | [008](./008-edit-mode.md) |
| 009 | Media + Storage Adapter | 1 | `done` | [009](./009-media.md) |
| 010 | Localization v2 | 2 | `done` | [010](./010-localization.md) |
| 010b | Переклад усього сайту | 2 | `done` | [010b](./010b-texts.md) |
| 010d | Спрощення локалізації | 2 | `done` | [010d](./010d-simplify.md) |
| 010c | Переклад файлом (після 014) | 2 | `todo` | — |
| 011 | Forms infrastructure | 3 | `done` | [011](./011-forms.md) |
| 012 | Activity (Admin UI + Restore) | 3 | `done` | [012](./012-activity.md) |
| 013 | Analytics (замість Integrations, C-97) | 3 | `todo` | — |
| 014 | Collections UI (інфраструктура Core) | 4 | `todo` | — |
| 015 | Решта Admin + Configuration growth | 4 | `todo` | — |
| 016 | CLI / Updates / Deploy / Publishing | 5 | `todo` | — |

---

## Зроблено — коротко

### 001 — Package foundation

Пакет існує як Nuxt Layer + внутрішній Module, `cms.config.ts`, `#cms/config`,
`useCms()`, playground.

### 002 — Data Layer + Site Settings (read-only)

Зафіксована межа `Repository → Backend Adapter` на одній сутності.
Є `SettingsRepository.get()`, `useSiteSettings()`, міграція `cms_site_settings`,
RLS тільки на `select`, `CmsDataError`, lazy anon-клієнт.

### 003 — Auth, CMS Users, Permissions

`auth.users` — identity, `cms_users` — доступ до CMS. Login, сесія в cookie,
статична матриця `can()`, middleware на `/admin`, включно з `/admin/edit`. Invite і
`SUPABASE_SECRET` не входять: вони потрібні Settings → Users.

### 004a — Admin UI foundation + Login

Токени і компоненти адмінки під `.cms-admin`. Логін зібраний з `AdminRoot`, `AdminInput`,
`AdminButton`, `AdminAlert`.

### 004b — Admin shell + запис Site Settings

Оболонка `/admin` з сайдбаром. Settings → General пише `siteName`, `contactEmail`,
`contactPhone`, `maintenanceMode`. Запис іде через `SettingsRepository.update()` і RLS
`cms_can('settings.update')`.

### 004c — Alignment

Переклади адмінки — власний `useAdminI18n()` з ключами `cms.*` замість `@nuxtjs/i18n`.
Public `/` не вантажить vue-i18n, vee-validate і admin CSS. Є скрипти `typecheck` / `lint` і
`@nuxt/test-utils`. Тест звіряє `permissions.ts` з `cms_can()`. `package.json` готовий до
публічного npm: без `private`, із заготовкою `bin`, `prepare` замість `postinstall`.

### 005 — Pages як content entity (published read)

`cms_pages` (identity за `key`) + `cms_page_published` (JSONB-документ на page × locale), RLS лише
на `select`. `PagesRepository.getByKey()` читає одним запитом, `useCmsPage(key)` повертає `null`
для сторінки без контенту, і шаблон рендерить дефолти. Locale береться з `defaultLocale` у
`cms.config.ts`. Є generated Supabase types (`npm run gen:types`) і pgTAP smoke-тест міграцій
(`npm run test:db`).

### 006 — CMS Primitives, тільки Public Runtime

`CmsText`, `CmsRichText`, `CmsLink`, `CmsButton`, `CmsImage`: `:value` + `field-key`, дефолт — slot,
без `v-model` (C-47). Rich text — Tiptap JSON і власний renderer без `v-html` (C-49), `href` — через
allow-list. Адреса поля — dotted path у вкладеному документі (C-48). Типи для Client —
`nuxt-cms-core/types`. Public bundle перевіряє `npm run check:bundle`. `runtime.css` не знадобився.

### 007 — Draft / Publish / Revisions (дані)

`cms_page_draft` (рядок лише поки є неопубліковані зміни), `cms_page_revisions` (знімок кожної
публікації), `cms_page_locks` (токен на editor-сесію, клієнтам не читається). Запис — лише через RPC
у транзакції: право → lock → інваріанти (object, ≤ 512 KB). Publish просуває збережений Draft, Restore
без `replace_draft` не перезаписує наявний Draft. Нове право `pages.unlock`, коди `CmsDataError`
`validation` / `conflict` / `locked` / `lock_lost`. Revalidation і soft delete Pages перенесено
(C-11, C-34).

### 008 — Edit Mode (перша версія UI)

`/admin/edit/[...path]` рендерить сторінку Client з її layout (C-59). `useCmsPage` в Edit Mode віддає
документ Editor Engine: Draft, dirty, Undo / Redo, validation, Content Lock. Усе, що малює редактор,
живе в Overlay Layer поверх сторінки (C-65):
- inline-текст і rich text на Tiptap;
- popover для лінків, кнопок і зображень;
- колекції з reorder / duplicate / delete;
- optional-блоки, затемнення нередагованого.

Нові primitives — `CmsCollection`, `CmsOptional`, `CmsBackground`. Зображення до 009 лише
попередньо переглядаються (C-68). У playground — лендинг «Luminary». Перша версія UI: далі — правки
автора (008b).

### 009 — Media + Storage Adapter

Зображення стали даними: файл у бакеті `cms-media`, рядок `cms_media`, контент зберігає
`{ mediaId, alt?, decorative?, focal? }` (C-74), не URL. Upload іде напряму в Storage, рядок реєструє
RPC, яка бере mime і розмір із самого об'єкта (C-71). Читання сторінки повертає документ разом із
media одним запитом, тож SSR рендерить зображення без N+1 (C-76). Є:
- `/admin/media`: upload, drag & drop, пошук, фільтр, Replace (новий path, R-13), soft delete з
  попередженням про usage;
- один Media Picker для Edit Mode і Settings → Бренд (логотип, favicon);
- права `media.upload` / `media.edit` / `media.delete`.

Сесійна заглушка зображень з 008 (C-68) прибрана. Пропущене — у реєстрі TODO (MASTER_PLAN §3).

### 010 — Localization v2

Мови живуть у `cms_languages`, Settings → Мови керує ними без deploy (право `languages.manage`, owner).
Документ мови за замовчуванням — база. Документ іншої мови — плаский переклад листів за адресами
(C-78), тож структура, медіа й посилання спільні, а неперекладене показується мовою за замовчуванням.
Є:
- читання з fallback одним RPC, `useCmsLocale()` / `useCmsLanguages()`, дані для hreflang;
- перемикач мов і режим перекладу в Edit Mode: структура read-only, оригінал у панелях;
- link-резолвер Client для префіксів `/en/...` (C-79);
- назва сайту по мовах.

*Змінено в 010d:* зміни мови за замовчуванням із конвертацією більше немає — перша мова лишається мовою
оригіналу (C-87).

Playground маршрутизує `/[[locale]]` сам: Core дає лише дані.

### 010b — Переклад усього сайту

Усі тексти сайту в одному місці — екран «Тексти».
- Edit Mode записує поля сторінки разом із текстами з коду (реєстр, C-84).
- Тексти, яких немає на сторінках (меню, футер, тости, `<title>`), Client оголошує в `cms.texts.ts` і
  бере через `useCmsText()`. Owner / admin змінюють і перекладають їх без deploy (C-85).
- Інша мова — «оригінал | переклад»: сторінки в чернетку з публікацією всієї мови однією кнопкою,
  тексти сайту — одразу, ↗ відкриває редактор на полі (C-86).

### 010d — Спрощення локалізації

- Мова оригіналу незмінна: конвертацію й «Зробити основною» прибрано, захист — тригери в БД (C-87).
- Елементи колекцій із коду мають власні id. Колекція з наявними перекладами закріплює `default-N` явно
  (C-88).
- «Тексти» — другий вхід у ті самі чернетки, що й Edit Mode (C-89):
  - основною мовою тексти сторінок редагуються там само;
  - один RPC запису з перевіркою за реєстром;
  - публікація вибраних сторінок із діалогом, який не позначає сторінки зі змінами з редактора, і
    перевіркою версії чернетки;
  - page-mutex `FOR NO KEY UPDATE`, конкурентні тести через dblink.
- Playground і seed: оригінал — англійська, українська — переклад.

### 011 — Forms infrastructure

- Форми оголошує розробник у `cms.forms.ts`; тексти форм — тексти сайту, змінюються на «Текстах» (C-90, C-92).
- Заявку пише лише server route Core із секретним ключем: валідація, honeypot, ліміти, повтор без дубля
  (C-91).
- Адмінка «Заявки»: один інбокс для всіх форм, деталі з контактами, архів / спам, CSV, керування формами.
  Лише Owner і Admin (C-93, C-94).
- Адмінка працює на телефоні: висувне меню (C-95).
- *Доповнення C-97:* хук `cms:forms:submitted` — подія нової заявки для сповіщень сайту (email,
  Telegram, CRM) без реєстру й таблиць; не більше 3 с, без повтору.

### 012 — Activity

- Журнал важливих дій пише лише БД у транзакції самої дії: RPC і тригери. Клієнт тільки читає, owner і
  admin (`activity.view`) (C-96).
- Події: публікації й Restore, медіа, мови, форми, налаштування (без значень контактів), масові дії із
  заявками однією подією. Save draft і тексти сайту не логуються.
- `/admin/activity`: категорії, «Сьогодні / Вчора / дата», «Показати ще», посилання лише на те, що існує.
- Подія публікації веде в History редактора з підсвіченою версією; старшу за 50 показує окремим рядком.
  Restore — наявний.
