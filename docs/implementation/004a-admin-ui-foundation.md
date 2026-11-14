# 004a — Admin UI foundation + Login

Перший зріз епіка 004: візуальний фундамент адмінки і єдиний уже готовий екран — логін.
Запису в базу, layout і сайдбару тут немає. Їх закриває 004b.

## Що зроблено

- Токени UI kit (колір, тип, відступи, радіус, тіні, висоти контролів) у
  `app/assets/admin/admin.css`. Усі змінні мають префікс `--cms-` і живуть на `.cms-admin`.
- `AdminRoot` імпортує цей CSS і є коренем адмін-зони. Ізоляція не через Nuxt layout:
  клієнтський `app.vue` може бути лише `<NuxtPage />`, і шар не змусить його рендерити layout.
- `AdminButton` (primary, secondary, ghost, destructive, link, плюс квадратний `iconOnly`;
  розміри sm / md / lg; hover, pressed, focus, disabled, loading).
- `AdminAlert` (info, success, warning, danger, dismiss, action).
- `AdminInput` — лише варіант логіна: label, `v-model`, leading icon, focus, disabled,
  нативні атрибути поля. З 004b він використовується і на Settings.
- `/admin/login` зібраний з цих компонентів. Перемикач мови на логіні прибраний; на `/admin`
  він лишається. Логіка `ensure` / `login` / `safeRedirect` / `adminErrorKey` не змінювалась.
- Playground-сторінка `/admin/ui-kit` під `cms-auth`. У пакет вона не входить: `files` не містить
  `playground`.
- Іконки: `@nuxt/icon` і `@iconify-json/lucide` у `dependencies`.

## Ключові рішення

**Токени не на `:root`.** Клієнтський сайт може мати власні `--primary` чи `--border`.
Адмінські змінні називаються `--cms-primary`, `--cms-border` і діють лише під `.cms-admin`.
Глобального reset немає. `body:has(.cms-admin) { margin: 0 }` лежить у тому самому CSS-чанку
і зникає разом із коренем.

**Розміри — з токенів, не з пікселів скріна.** Макет знятий на масштабі 87.5%.
Картка 448px (`28rem`), контрол md 36px, іконка 16px. Відступ картки — `space-6` (24),
бо 28 у шкалі відступів немає. Знак над карткою — статичний «CMS» з i18n, без запиту в базу.
Монограма сайту з макета сюди не переноситься.

**Destructive hover не копіює зламаний макет.** У State matrix hover і pressed майже білі.
Hover бере `--cms-destructive-text`, pressed — той самий колір, змішаний із чорним.

**Disabled і loading — це opacity 0.5**, як у State matrix, а не світлий `--cms-primary-disabled`.
Focus кнопки — кільце 3px / 30% primary. Focus поля — бордер `--cms-ring` і кільце 2px / 20%.

**Іконки локальні.** `mode: 'svg'`, `provider: 'server'`, `fallbackToApi: false`,
`serverBundle.collections: ['lucide']`, `clientBundle.scan: false`. Колір іконки йде з
`currentColor`. Запиту до `api.iconify.design` немає. `clientBundle.scan` не вмикали:
скан зібрав би дані іконок у клієнтський граф.

**`@` у перекладі екранується.** Vue I18n читає `@` як посилання на інший ключ.
Плейсхолдер `name@company.com` у production падав з `SyntaxError` «10»
(`INVALID_LINKED_FORMAT`). У словниках це `name{'@'}company.com`.
Замінено в 004c: vue-i18n прибрано, `useAdminI18n()` не має linked messages, тож `@` пишеться як є.

**Підпис під знаком перекладений.** Український екран каже «Система керування контентом».
У макеті на українській сторінці лишився англійський рядок; для i18n це переклад, не копія макета.

## Перевірено

- Логін: картка 448px, кнопка 36px, колір primary `#2271B1`, іконки inline `<svg>` по 16px.
  Focus поля дає бордер `#2271B1` і тінь 2px на 20%. Під час submit поля disabled, кнопка
  `aria-busy`. Хибний пароль показує danger-алерт.
- `/admin/ui-kit`: п'ять варіантів, icon-only 36×36, висоти 32 / 36 / 40, disabled з opacity 0.5,
  loading, п'ять алертів з правильними ролями і тонами.
- Owner входить і бачить `pages.publish = true`. Editor входить і бачить `pages.publish = false`.
  Customer лишається на логіні з тим самим повідомленням, що й хибний пароль.
  `/admin/edit` без сесії веде на `/admin/login?redirect=/admin/edit`, після входу відкривається
  `/admin/edit`.
- Production HTML `/` не містить `cms-admin`, `--cms-`, `@nuxt/icon`, `lucide` і не посилається
  на CSS адмінки. `/admin/login` віддає 200, містить `--cms-` і два inline `<svg>` з `currentColor`.
  Запиту до `api.iconify.design` немає.
- Порожній логін і хибна пошта показують текст під полем, без браузерної бульбашки.
  Короткий пароль не йде на сервер. Хибна пара з правильною формою лишає alert над формою.
- `npm test` (31) і `npm run build`.

Плагін `@nuxt/icon` потрапляє в app entry: Nuxt не ріже плагіни по роутах. Це налаштування
локального ендпоінта, без SVG-даних Lucide. Чанк компонента `Icon` на `/` не вантажиться —
він у dynamic import сторінок, які іконку рендерять. Дані колекції лишаються в server bundle.

## Обмеження

- У поля є текст помилки під контролом. Правила (обов’язкове, пошта, телефон, довжина пароля,
  збіг паролів) дає `useAdminValidation()`. Логін перевіряє пошту і пароль.
  Телефон і підтвердження пароля готові для наступних форм. Textarea, select і helper-стан
  лишаються до першого екрана, якому вони потрібні.
- `/admin` після 004a ще не мала оболонки. Її дає 004b.
- Перевірка бандла ручна. Скрипт на це — з 006.

## Що свідомо не робили

Решта form controls, Table / Tabs / Badge / Dropdown / Card, Tailwind, SCSS, темна тема,
інші набори іконок, зміна auth. Оболонку адмінки і запис Settings зроблено окремо в 004b.
