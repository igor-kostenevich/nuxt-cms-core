# 003 — Auth, CMS Users, Permissions

Третій implementation step: відокремити identity від доступу до CMS. `auth.users` відповідає
на питання «хто це». `cms_users` — «чи є доступ до CMS і з якою роллю». Запис у `auth.users`
сам по собі не відкриває `/admin`.

## Що зроблено

- Сесійний адаптер: `app/data/supabase-auth.ts`. Єдине місце, яке імпортує `@supabase/ssr`.
- Anon-клієнт у `app/data/supabase.ts` лишився з `persistSession: false`.
- Таблиця `cms_users`, RLS на читання лише свого рядка, функції `is_active_cms_user()` і `cms_can()`.
- Статична матриця прав у `app/auth/permissions.ts` і та сама матриця в SQL.
- `useCmsAuth()`, `usePermissions()`, named middleware `cms-auth`.
- Сторінки `/admin/login` і `/admin`. Редагування сайту теж під адмінкою: playground
  доводить гейт сторінкою `/admin/edit`.
- Локальний `supabase/seed.sql`: owner, editor, customer без рядка, disabled.
- Тести `roleCan()` і `safeRedirect()`.

Потік:

```
/admin → cms-auth → useCmsAuth() → auth adapter + CmsUsersRepository → Supabase Auth + cms_users
/             → useSiteSettings() → anon client → site_settings
```

## Ключові рішення

**`auth.users` і `cms_users` — різні відповіді.** Authenticated customer може існувати в Auth і
не мати рядка в `cms_users`. Тоді `/account` у майбутньому клієнтському сайті йому доступний, а
`/admin` — ні. Публічну реєстрацію в Supabase не вимикали: вона не створює CMS access.

**Anon-клієнт не отримав сесію.** Другий клієнт, а не `persistSession: true` на старому.
Публічне читання лишається роллю `anon`, навіть якщо в браузері є CMS cookie. `@supabase/ssr`
потрапляє лише в чанк сторінок, які викликають `useCmsAuth()`.

**Серверний клієнт живе на запиті.** Його створюють у middleware або setup, поки є Nuxt-контекст,
і кладуть у `event.context`. Після `await` контекст зникає, тому повторний виклик читає вже
створений клієнт і не кличе `useRequestEvent()`. У module scope серверний клієнт не кешується:
інакше cookie одного запиту дісталися б наступному. Особу читає `getUser()`, не `getSession()`.

**Матриця продубльована в TypeScript і SQL.** UI кличе `can('pages.edit')` і ніколи
`role === 'admin'`. Це не захист. Запис у 004 піде через `cms_can('settings.update')`, а не через
список ролей у кожній таблиці. Два копії тримаються однаковими навмисно: спільної генерації немає,
бо вона була б окремим механізмом заради чотирьох рядків.

**Editor не публікує.** `pages.edit` є в owner, admin і editor. `pages.publish` — лише owner і
admin. `users.manage` є тільки в owner, інакше owner і admin у V1 не відрізняються. Екрана для
цього permission ще немає.

**Middleware не глобальний.** Глобальний middleware затягнув би auth у кожен публічний роут.
Його ставлять на сторінки `/admin`, включно з `/admin/edit`. У V1 усі три ролі проходять
`pages.edit`; перевірка стоїть уже на `/admin/edit`, щоб viewer-роль потім не вимагала
переписувати middleware.

**Невдалий CMS-login робить `signOut`, middleware — ні.** Форма сама щойно створила сесію. Якщо
після пароля немає active membership, сесію закривають і показують одне повідомлення і для
customer, і для disabled. Якщо людина вже була залогінена (майбутній `/account`) і просто відкрила
`/admin`, middleware відправляє на головну і не розлогінює: це одна Auth-система, і вихід із CMS був би
виходом із сайту. Окремого екрана про відсутність доступу немає.

**Немає `SUPABASE_SECRET` і invite.** Login працює publishable-ключем, ідентичність запиту — user
JWT у cookie. Invite через Admin Auth API потребує секрету і з'явиться разом із Settings → Users.

**Owner seed лежить у `seed.sql`, не в міграції.** Core-міграція їде в усі клієнтські проєкти.
`supabase db reset` застосовує seed, `supabase db push` — ні. Хмарний bootstrap Owner лишається за
CLI. Пароль `local-dev-password` — фікстура локального CLI, не секрет продакшена.

**`safeRedirect` пускає лише шляхи `/admin`.** `?redirect=https://evil.example` після логіну
веде на `/admin`. Сторінка login теж не є ціллю, інакше виходить цикл.

## Перевірено

- `supabase db reset` створює чотирьох користувачів. Owner і editor логіняться. Customer і
  disabled отримують одне `no_cms_access` і не лишають cookie.
- Хибний пароль дає `invalid_credentials`, без підказки, чи існує email.
- Без сесії `/admin` і `/admin/edit` йдуть на `/admin/login?redirect=...`.
- `?redirect=https://evil.example` після логіну відкриває `/admin`.
- Owner бачить `pages.publish = true` і `users.manage = true`. Жорстке перезавантаження `/admin`
  лишає сесію.
- Editor бачить `pages.publish = false`, `users.manage = false`, і відкриває `/admin/edit`.
- Якщо active-користувача вимкнути в базі, не чіпаючи cookie, `/admin` відправляє на головну і не
  розлогінює сам.
- Публічний `/` читає site settings. Запит `site_settings` не несе user JWT.
- У production HTML `/` немає `@supabase/ssr`. `build:manifest` прибирає `dynamicImports`,
  інакше Vite ставить prefetch на кожну async-сторінку і публічна сторінка стягує auth-чанк.
  Посилання playground на `/admin` має `prefetch: false`. Чанк `@supabase/supabase-js` на `/` є,
  бо публічне читання settings уже залежить від нього з блоку 002; рядок `signInWithPassword`
  усередині цього SDK, а не наш login.
- `npm test` (матриця і redirect), `npm run build`.

## Обмеження

- Немає invite, deactivate, change role і захисту останнього Owner.
- Немає `SUPABASE_SECRET` і server-only клієнта.
- Хмарний проєкт не отримує seed. Першого Owner там ще нічим створити, крім ручного SQL.
- Запису `site_settings` досі немає. Функція `cms_can` уже є, write-політика прийде з `update()`.
- Нові таблиці Supabase більше не отримують Data API grant автоматично. У цій міграції
  `site_settings` явно отримала `select` для `anon` і `authenticated`, інакше публічне читання
  після `db reset` падає з `permission denied`, попри наявну RLS-політику.

## Що свідомо не робили

Invite, Settings → Users, admin layout, запис settings, `profiles`, public `/register`,
database-driven RBAC, custom JWT claims, 2FA, sessions UI, `@nuxtjs/supabase`.
