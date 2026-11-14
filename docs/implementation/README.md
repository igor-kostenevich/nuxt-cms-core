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
| 005 | Pages як content entity (published read) | 1 | `todo` | — |
| 006 | CMS Primitives, тільки Public Runtime | 1 | `todo` | — |
| 007 | Draft / Publish / Revisions (дані) | 1 | `todo` | — |
| 008 | Edit Mode (мінімальний вертикальний зріз) | 1 | `todo` | — |
| 009 | Media + Storage Adapter | 1 | `todo` | — |
| 010 | Localization v2 | 2 | `todo` | — |
| 011 | Forms infrastructure | 3 | `todo` | — |
| 012 | Activity (Admin UI + Restore) | 3 | `todo` | — |
| 013 | Integrations (перший живий provider) | 3 | `todo` | — |
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
