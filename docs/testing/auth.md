# Вхід і доступ — сценарії перевірки

Епіки 003, 004a ([003](../implementation/003-auth.md), [004a](../implementation/004a-admin-ui-foundation.md)).
Права — статична матриця `can()` і SQL `cms_can()` (MASTER_PLAN C-16). Середовище — у [README](./README.md).

### AUTH-LOGIN-01 — Вхід і вихід
**Кроки:** `/admin/login` → `owner@example.com` / `local-dev-password` → «Вийти» в адмінці.
**Очікувано:** після входу — `/admin`; після виходу — `/admin/login`, а `/admin` знову веде на логін.
**E2E:** так.

### AUTH-LOGIN-02 — Невірний пароль
**Кроки:** вхід з неправильним паролем.
**Очікувано:** помилка про невірні дані, без деталей, чи існує такий email.
**E2E:** так.

### AUTH-LOGIN-03 — Вимкнений користувач і користувач без доступу до CMS
**Кроки:** вхід як `disabled@example.com`; окремо — як `customer@example.com`.
**Очікувано:** в адмінку не пускає з повідомленням про відсутність доступу. Сесію, створену формою
логіну, закрито (повторний `/admin` веде на логін).
**E2E:** так.

### AUTH-REDIRECT-01 — Повернення після входу
**Кроки:** без сесії відкрити `/admin/settings` → увійти.
**Очікувано:** після входу — `/admin/settings`.
**E2E:** так.

### AUTH-REDIRECT-02 — Redirect лише всередині адмінки
**Кроки:** відкрити `/admin/login?redirect=https://evil.example`, потім `?redirect=//evil.example`,
`?redirect=/administer`, `?redirect=/admin/login` → увійти.
**Очікувано:** щоразу — `/admin`, ніколи на інший сайт чи сторінку поза адмінкою.
**E2E:** так.

### AUTH-ROLE-01 — Зміна ролі діє одразу
**Кроки:** увійти як `editor@example.com`. У Studio: `update cms_users set role = 'admin' where user_id
= (select id from auth.users where email = 'editor@example.com');` → перезавантажити адмінку.
**Очікувано:** права admin одразу (Settings редагується), без повторного входу (C-16).
**E2E:** так.

### AUTH-ROLE-02 — Вимкнення під час сесії
**Кроки:** увійти як editor, у Studio поставити йому `status = 'disabled'` → перейти по адмінці.
**Очікувано:** доступ до адмінки зникає на наступному переході.
**E2E:** так.

### AUTH-NS-01 — Client Project не займає `/admin/*` (C-98)
**Кроки:** у playground тимчасово додати по одному:
- `app/pages/admin/settings/index.vue` — перекриття сторінки Core;
- `app/pages/admin/extra.vue`;
- `app/pages/promo.vue` з `definePageMeta({ alias: ['/admin/promo'] })`;
- `app/pages/[[locale]]/admin/x.vue`.

Потім `npm run build`. Окремо — додати такий файл, поки працює `npm run dev`, і прибрати.
**Очікувано:** build падає з переліком маршрутів і файлів. Dev-сервер показує ту саму `ERROR` і далі
відповідає. Після видалення файлу все працює як раніше, `/admin` веде на логін.
**E2E:** ні — перевіряється збіркою, не браузером.

### AUTH-NS-02 — Гейт `cms-auth` не перекривається
**Кроки:** тимчасово додати `playground/app/middleware/cms-auth.ts` → `npm run build`.
**Очікувано:** build падає з повідомленням, що `cms-auth` зарезервований за Core. `cms-auth.global.ts`
не конфліктує: це інший, глобальний middleware, і він гейт не замінює.
**E2E:** ні — збірка.

### AUTH-NS-03 — Нова сторінка Core без гейта
**Кроки:** тимчасово додати `app/pages/admin/probe.vue` у Core без `middleware: ['cms-auth']` →
`npm run build`.
**Очікувано:** build падає: сторінка Core під `/admin` потребує `cms-auth`. `/admin/login` гейту не
потребує і не падає.
**E2E:** ні — збірка.
