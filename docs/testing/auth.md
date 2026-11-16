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
