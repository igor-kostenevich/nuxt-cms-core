# 004c — Alignment (вирівнювання перед 005)

Епік без нових фіч: код і правила приведено до канонічних рішень MASTER_PLAN, щоб 005
стартував з чистої бази. Блокуючі рішення закрито перед планом: D-01 → C-36, D-54 → C-37.

## Що зроблено

- **Admin i18n без `@nuxtjs/i18n` (C-25, C-36).** Модуль прибрано з layer і з `dependencies`,
  `i18n/i18n.options.ts` і `i18n/i18n.config.ts` видалено. Новий `app/composables/useAdminI18n.ts`
  повертає `{ t, locale, locales, setLocale }` над `app/admin/locales/{en,uk}.json` (перенесено з
  `i18n/lang/`: коренева `i18n/` — дефолтна папка `@nuxtjs/i18n`, вона вводила б в оману і
  підхопилася б модулем, якщо в layer колись з'явиться ключ `i18n:`). Корінь словників
  `admin` перейменовано на `cms`, усі ключі в коді — `cms.*`. Чисті функції, типи і константи
  лежать в `app/admin/i18n.ts`, а не в `composables/`: кожен export із `app/composables` layer
  стає глобальним auto-import у Client Project, і `translate` засмітив би простір імен сайту.
- **Public bundle перевірено** (C-21, C-26): на `/` немає vue-i18n, vee-validate, admin CSS і
  текстів словників.
- **Скрипти й тестове середовище.** `npm run typecheck` (`nuxi typecheck playground && tsc -p src`),
  `npm run lint` (ESLint 10 + `@nuxt/eslint-config`), Vitest через `defineVitestConfig` з
  `@nuxt/test-utils`.
- **Тест синхронності прав** `tests/permissions-sync.test.ts`: `roleCan()` ↔ `cms_can()`.
- **`package.json` під публічний npm (C-30):**
  - без `"private": true`;
  - `bin.nuxt-cms` → `bin/nuxt-cms.mjs` (заготовка, exit 1);
  - `bin` у `files`;
  - `postinstall` → `prepare`.
- **Правила й документація:**
  - `.cursor/rules/project.mdc` — нативний CSS замість Tailwind (C-23) і правило про
    `useAdminI18n()`;
  - `.claude/CLAUDE.md` — команди, структура;
  - README — Docker / хмарний dev (C-37), розділ «Admin translations»;
  - MASTER_PLAN — C-36, C-37, D-01 / D-54 прибрано з реєстру, R-14 вирішено, drift-таблицю
    закрито.

## Ключові рішення

**Чому не `@nuxtjs/i18n` з префіксом ключів.** У build до 004c entry-чанк статично імпортував
чанк із vue-i18n: Nuxt не ріже плагіни по роутах, тож модуль у layer вантажить vue-i18n на кожну
публічну сторінку. Крім того, locales (en, uk), `strategy: no_prefix` і `detectBrowserLanguage`
Core зливалися б із конфігом Client Project. Сайт отримав би `uk`, якого не оголошував. Префікс
ключів жодну з цих проблем не знімає.

**Як влаштований `useAdminI18n()`:**
- `translate()` — dotted lookup, `{param}`-інтерполяція, fallback на `en`, потім сам ключ.
- `resolveAdminLocale()` — cookie `cms_locale`, потім найвагоміша підтримувана мова з
  `Accept-Language`, потім `en`.
- Обидві — чисті функції й тестуються без Nuxt.
- Locale живе в `useState('cms-admin-locale')`. Сервер обчислює його один раз на запит, і він
  приходить у payload, тож перший візит без cookie гідрується тією ж мовою.
- `setLocale()` пише state і cookie (рік, `path=/`, `SameSite=Lax`). Так само поводився
  `@nuxtjs/i18n` з `useCookie: true`.

**Словники імпортуються статично.** Обидві мови разом — кілька KB. Composable викликають лише
admin-компоненти, тому JSON потрапляє тільки в admin-чанк (перевірено нижче). Lazy per-locale —
коли словники виростуть.

**`name{'@'}company.com` → `name@company.com`.** Екранування з 004a було потрібне linked-синтаксису
vue-i18n. Власний `t()` `@` не інтерпретує.

**Тест синхронності парсить SQL, а не ходить у БД:**
- Бере останню за іменем міграцію з `create [or replace] function public.cms_can`, тож майбутнє
  перевизначення стане джерелом. Підтримує pg_dump-стиль (`"public"."cms_can"`, `$function$`,
  `WHEN` у верхньому регістрі) і не плутає дефініцію з `grant ... on function`.
- Якщо файл перевизначає `cms_can`, але тіло не розібралося, тест падає. Мовчки брати старішу
  міграцію він не може.
- Розбирає гілки `when '<perm>' then role in (...)` / `role = '<role>'` і звіряє кожну пару
  role × permission з `roleCan()`.
- Перевіряє, що множини прав збігаються і є `else false`.
- Непарсована гілка — падіння з поясненням, не пропуск.
- Тест працює в `npm test` без Docker.

**TypeScript 5.9, не 7.** `typescript@latest` — 7.0, нативний компілятор без JS API, на якому
працює `vue-tsc`. Стабільного 6.x немає, тому `~5.9.3`.

**ESLint без stylistic.** Lint тут для коректності. Форматування робочого коду — anti-scope.
Конфіг standalone (`createConfigForNuxt`), модуль `@nuxt/eslint` у layer не реєструється, тож
Client Project нічого не успадковує.

**`@nuxt/test-utils` без Nuxt-тестів.** `defineVitestConfig` (4.4) ділить тести на два projects:
`nuxt` для файлів `*.nuxt.test.ts` і `tests/nuxt/**`, `node` для решти. `rootDir` — playground.
`npm test` щоразу піднімає Nuxt-конфіг playground, тому навіть node-тести стартують ~0.5 s.
`happy-dom` не ставили: він знадобиться з першим Nuxt-тестом. Перший запуск записав `playground/.nuxtrc`
(`setups.@nuxt/test-utils`) — це маркер модуля, його комітять.

**`postinstall` → `prepare`.** `postinstall` виконується і в Client Project при
`npm install nuxt-cms-core`: там би запускався `nuxi prepare playground`, якого в пакеті немає.
`prepare` виконується лише при локальному install і перед pack / publish.

**`tsBuildInfoFile` винесено в `node_modules/.cache`.** `src/tsconfig.json` — composite (на нього
посилається кореневий tsconfig), тож `tsc -p src` пише buildinfo. Поруч із джерелами він
потрапив би в npm-пакет.

## Знайдено й виправлено

- `app/pages/admin/settings/index.vue`: у `defineField<boolean>('maintenanceMode')` generic у
  vee-validate — це шлях поля, не тип значення. Typecheck падав. Тепер тип виводиться з
  `initialValues`.
- `app/auth/redirect.ts`: мертве початкове присвоєння `decoded` (`no-useless-assignment`).
  Поведінка не змінилась.

## Перевірено

- `npm test` — 7 файлів, 59 тестів.
- Sync-тест падає, якщо дати `pages.publish` editor'у. Це перевірено двома тимчасовими правками,
  обидві прибрано:
  - правкою існуючої міграції (файл відновлено з git);
  - новою міграцією в pg_dump-стилі з `$function$` і `grant` перед дефініцією.
- Після ревʼю: `translate`, `resolveAdminLocale` і константи більше не в `.nuxt/imports.d.ts`.
  `PASSWORD_MIN_LENGTH` і `FieldRule` там лишались, бо жили в `useAdminValidation.ts`. Після
  повторного ревʼю вони в `app/admin/validation.ts`. Реекспорт `CmsAuthSnapshot` з `useCmsAuth`
  теж прибрано.
  `lookup` і інтерполяція не ходять по прототипу (`Object.hasOwn`).
- `npm run typecheck`, `npm run lint` — exit 0.
- `npm run build` + ручна bundle-перевірка скриптом поза репо (автоматизація — 006). Кроки, щоб її
  повторити: запустити `node playground/.output/server/index.mjs`, взяти з HTML `/` усі
  `<script src>` і `<link rel="modulepreload|stylesheet|prefetch">`, рекурсивно пройти статичні
  `import … from "./X.js"` у кожному JS (без `import()`), у кожному файлі шукати маркери
  `cms-admin`, `--cms-`, `cms_locale`, тексти словників (`Content Management System`,
  `Система керування`) і `validateOnBlur` (vee-validate):
  - production-сервер, HTML `/`, рекурсивний обхід статичних імпортів (15 assets);
  - у графі `/` немає vue-i18n, vee-validate, `--cms-` / `.cms-admin` і текстів словників;
  - маркери спрацьовують на admin-чанках, тобто перевірка не порожня;
  - vue-i18n немає в жодному файлі `_nuxt/`;
  - vee-validate лише в одному admin-чанку.
- SSR `/admin/login`:
  - `Accept-Language: uk` → українська, `cms-admin-locale: "uk"` у payload;
  - cookie `cms_locale=en` перемагає заголовок `uk`;
  - без підказок → англійська;
  - placeholder рендериться як `name@company.com`.
- `npm pack --dry-run`:
  - є `bin/nuxt-cms.mjs`, `app` (разом з `app/admin/locales/*.json`), `src`, міграції;
  - немає `playground`, `tests`, `docs`, `.tsbuildinfo`.
- `bin/nuxt-cms.mjs` друкує повідомлення і виходить з кодом 1.

Не перевірено в браузері: перемикач мови в шапці `/admin` після reload і відсутність hydration
warning у консолі. SSR-частину цих сценаріїв перевірено запитами вище.

Після ревʼю знайшовся конкретний шлях до розбіжності: помилка з `useAsyncData` втрачала код
`CmsDataError`. Тому сервер і клієнт могли показати різний текст, а `not_found` і
`permission_denied` завжди ставали `unknown`. Виправлено: код тепер у `data.cmsCode`, див. 002,
«Змінено пізніше». Без рядка settings `/admin/settings` рендерить «not found», а в payload є
`cmsCode`. У браузері це досі не перевірено.

## Після ревʼю 001–004c

- `useAdminI18n`, `useAdminSettings`, `useAdminValidation` перенесено в `app/admin/` і імпортуються
  явно (MASTER_PLAN C-40). У `.nuxt/imports.d.ts` їх більше немає.
- Хук `build:manifest` переїхав з `nuxt.config.ts` у `src/module.ts`. Раніше він очищав
  `dynamicImports` усюди, і Client втрачав prefetch власних lazy-компонентів. Тепер лишаються
  тільки модулі з `srcDir` Client поза `pages/admin` і поза `node_modules`. Shared-чанки не мають
  шляху до джерела, тому їх і далі прибрано. Сторінки Nuxt 4.5 сам вилучає з `dynamicImports`
  entry. Перевірено тимчасовим `<LazyProbeLazy>` на `/`: його чанк отримав prefetch, а
  bundle-перевірка вище не знайшла маркерів адмінки (17 assets).
- Словники:
  - `cms.home.title|yes|no` видалено;
  - спільні ключі (`mark`, `caption`, `emailPlaceholder`, `logout`) переїхали в `cms.common`;
  - додано `cms.roles.*`: роль на дашборді й dev-кнопки логіну тепер перекладені.
- `AdminButton` отримав `to`, тому «Переглянути сайт» тепер посилання, а не `navigateTo`.
- Шапка адмінки:
  - пункти без екрана більше не мають `aria-disabled` на `<span>`, вони тьмяніші й мають
    прихований «(незабаром)»;
  - підписи груп переведено на `--cms-neutral-500` (4.9:1);
  - помилка `logout()` показується алертом.
- `AdminRoot` ставить `<html lang>` за мовою адмінки.
- Settings:
  - «лише перегляд» показується з tone `info` (`role="status"`);
  - після збереження з'являється success-алерт, а форма перезаповнюється збереженими
    значеннями.
- Розміри перемикача і 10px у знаку винесено в токени (`--cms-switch-*`, `--cms-type-micro-size`).

## Що свідомо не робили

- CI-пайплайн (016).
- Скрипт bundle-перевірки в репо (006).
- `npm publish`, ліцензія, `repository` / `description` у `package.json` — рішення автора, 016.
- Pluralization і linked messages в `useAdminI18n()`.
- Lazy-завантаження словників.
- `happy-dom` і Nuxt-тести.
- Integration-тест `cms_can()` на локальній БД.
- Правки стилю коду.
