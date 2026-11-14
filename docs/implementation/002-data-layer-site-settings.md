# 002 — Data Layer + Site Settings (read-only)

Другий implementation step: провести один вертикальний зріз від бази даних до Vue-компонента і
зафіксувати межу `Repository → Backend Adapter`.

Site Settings обрані як перша сутність не через їхню цінність, а тому що це найдешевший реальний
споживач Data Layer: немає draft/publish, revisions, локалізації та permissions.

Джерела (звірено під час ревʼю 001–004c): architecture.md Summary §15–17, §27–28, §31; DB v1 → Settings.

## Що зроблено

- Backend adapter: `app/data/supabase.ts` — єдиний файл у пакеті, який знає про Supabase SDK.
- Модель помилок: `app/data/errors.ts` (`CmsDataError` з кодом).
- Domain type: `app/types/settings.ts` (`SiteSettings`).
- Repository: `app/data/repositories/settings.repository.ts` з єдиним методом `get()`.
- Composable: `app/composables/useSiteSettings.ts` на `useAsyncData`.
- Перша Core-міграція: `supabase/migrations/20260920121920_cms_site_settings.sql`.
- `src/module.ts` прокидає `SUPABASE_URL` / `SUPABASE_KEY` у `runtimeConfig.public.cms`.
- Додано залежність `@supabase/supabase-js`.

Потік даних:

```
playground/app/pages/index.vue → useSiteSettings() → SettingsRepository → Supabase adapter → Postgres
```

## Ключові рішення

**Data Layer побудований рівно під одну сутність.** Немає `BaseRepository`, `CrudRepository`,
`RepositoryFactory`, generic mapper чи `Result<T>`. Існує один `SettingsRepository` і один вузький
адаптер. Критерій появи спільної абстракції в майбутньому: мінімум дві реальні сутності, які
справді дублюють код. До того моменту дублювання дешевше за неправильну абстракцію.

**Supabase ізольований в одному файлі.** Назовні не виходять `SupabaseClient`, `PostgrestError`,
`PostgrestResponse` і SQL-структури. Саме це робить backend замінним: щоб перейти на інший backend,
змінюється адаптер і внутрішня частина репозиторію, а не UI і composables.

**Інфраструктура живе в env, а не в `cms.config.ts`.** `cms.config.ts` описує можливості проєкту і
є build-time рішенням розробника. URL і ключ backend — це властивість середовища, тому вони пішли в
`runtimeConfig.public.cms`. Ці два джерела конфігурації свідомо не змішані.

**Локальний CLI і хмара — один і той самий код.** У кодовій базі немає жодного URL чи порту
Supabase і немає перемикача `local / cloud`. Різниця між `supabase start` і хмарним проєктом
зводиться до двох env-змінних, а та сама міграція застосовується через `supabase db reset`
локально і `supabase db push` у хмарі.

**Build-time default проти рантайм-override.** `process.env.SUPABASE_URL`, прочитаний у `setup()`
модуля, запікається на момент білду. Для локальної розробки цього достатньо, але при хмарному
деплої білд і рантайм — різні середовища, і запечене значення з білд-машини було б хибним. Тому env
задає лише default, а на рантаймі значення перекривається штатною конвенцією Nuxt:
`NUXT_PUBLIC_CMS_SUPABASE_URL` / `NUXT_PUBLIC_CMS_SUPABASE_KEY`. Власного механізму override не
писали.

**`cms_site_settings` — single-row таблиця з явними колонками.** Не один великий JSON з усіма
налаштуваннями: явні колонки залишають схему бізнес-зрозумілою і портабельною. Один логічний рядок
гарантується на рівні схеми через `check (id = 1)`. Сутності, які самі є списками (мови, навігація,
інтеграції), сюди не належать і отримають власні таблиці.

**RLS має тільку політику на `select`.** Політик на запис свідомо немає, тому таблиця read-only для
будь-якого клієнтського ключа. Запис вимагає CMS-автентифікації і permissions, тобто зʼявиться
разом з блоком Auth.

**Одна модель помилок замість ієрархії.** `CmsDataError` з кодом `not_found | permission_denied |
unknown`. Ієрархія класів не створювалась, бо зараз ніщо в CMS не розгалужується глибше за код.
Мапляться лише реально досяжні випадки: `PGRST116`, `42501`, `PGRST301`.

**Один lazy-інстанс клієнта.** Клієнт створюється з `persistSession: false` і
`autoRefreshToken: false`, бо доступ анонімний і сесії немає. Request-scoped клієнт стане потрібним
разом із сесіями користувача в блоці Auth — це свідомо відкладено, а не пропущено.

**Міграції входять у published package.** До `files` у `package.json` додано `supabase/migrations`,
інакше Core-міграція не доїхала б до клієнтського проєкту.

## Перевірено

- Міграція застосовується через `supabase db reset`; playground рендерить дані з локальної БД.
- Anon-ключ читає рядок; `insert` відбивається RLS з кодом `42501`, а `update` не змінює даних.
- Зміна рядка в БД одразу відображається на новому запиті.
- Порожній env дає зрозумілу помилку з підказкою, які змінні виставити, а не тихий `undefined`.
- `NUXT_PUBLIC_CMS_SUPABASE_URL` на зібраному сервері перекриває значення, з яким робився build.
- `npm run build` і `npm run preview` працюють.
- `@supabase/supabase-js` імпортується рівно в одному файлі — `app/data/supabase.ts`.

Автотестів не додавали: у блоці немає бізнес-логіки, вартої тесту. Тести стають доречними на
Draft/Publish і Permissions.

## Обмеження

- Тільки читання. Запис налаштувань потребує Auth і permissions.
- Немає generated Supabase types: форма рядка описана вручну в репозиторії. Поки сутність одна, це
  дешевше за генерацію типів у CI.
- Немає server-only клієнта і `SUPABASE_SECRET`. У `public` секрет не потрапляє ніколи.
- `CmsDataError`, кинутий під час SSR, доходить до клієнта як `NuxtError`, тому на клієнті
  перевірка `instanceof CmsDataError` не працює — доступні лише `message` і статус. Якщо колись
  знадобиться розгалуження за кодом на клієнті, код треба буде передавати через `data` помилки.

## Змінено пізніше

- Після ревʼю міграції 002, 003 і 004b переписано на місці, бо пакет ще не опублікований і
  хмарної бази немає. Поправки ревʼю не стали окремими міграціями: правило — одна міграція
  на фічу. Міграція 002 тепер:
  - створює `cms_site_settings` одразу з префіксом `cms_` (MASTER_PLAN C-38);
  - сама видає `select` для `anon` і `authenticated` (раніше grant лежав у міграції 003);
  - створює тригер `cms_touch_updated_at()`, щоб `updated_at` ставила БД, а не годинник браузера.
- 004b: зʼявились `SettingsRepository.update()`, update-політика і request-scoped клієнт
  (`app/data/supabase-auth.ts`), тож «тільки читання» і «один файл з SDK» вже не так.
- Після ревʼю: обмеження про `NuxtError` закрито. `CmsDataError` дублює код у `data.cmsCode`.
  `createError()` у `useAsyncData` і SSR payload зберігають `data`, а `adminErrorKey()` читає
  код звідти (тест `admin-error-key`).
- Після ревʼю: тест `settings-repository` покриває `update()` (payload, `id = 1`, 0 рядків →
  `permission_denied`) і мапінг `toCmsDataError`.

## Що свідомо не робили

Admin UI, запис налаштувань, Auth, Users/Roles, Pages, Draft/Publish, Revisions, Media, Storage
Adapter, Forms, Localization, Activity, CLI, generic CRUD-абстракції.
