# 007 — Draft / Publish / Revisions (дані)

Контракт даних редагування до появи UI. Saved Draft, Published і Revision лежать окремо, Publish і
Restore атомарні, спільний Draft захищений Content Lock. UI немає: споживачі — Edit Mode (008) і
Activity / History (012).

Блокуючі рішення закрито до плану: MASTER_PLAN C-50…C-58 (було D-09…D-14, D-56, D-57, D-59).

Джерела: architecture.md Б8 (Publish Engine, Revisions, Content Lock), Б3 §20–22, §28–29.

## Що зроблено

- Міграція `supabase/migrations/20261115150000_cms_page_drafts.sql`:
  - таблиці `cms_page_draft`, `cms_page_revisions`, `cms_page_locks`;
  - RPC `cms_page_lock_acquire`, `_heartbeat`, `_release`, `_force_unlock`, `cms_page_save_draft`,
    `cms_page_publish`, `cms_page_restore` і внутрішні хелпери, недоступні клієнтам.
- Правки на місці, бо пакет ще не опубліковано (`project.mdc`, C-31): домен `cms_locale` — у міграції
  pages (005), на ньому `cms_page_published.locale`; право `pages.unlock` — у `cms_can()` міграції
  cms_users. Після правки — `supabase db reset`.
- Seed: ревізія для опублікованої `home`, тож і для seed-даних остання ревізія дорівнює Published.
- `PagesRepository` (`app/data/repositories/pages.repository.ts`): `getDraft`, `saveDraft`, `publish`,
  `restore`, `acquireLock`, `heartbeatLock`, `releaseLock`, `forceUnlock`. `getByKey` не змінився.
- `CmsDataError`: нові коди `validation`, `conflict`, `locked`, `lock_lost`; мапінг у
  `app/data/supabase.ts`; ключі `cms.errors.*` в обох словниках адмінки.
- Право `pages.unlock` (owner, admin) у `app/types/auth.ts` і `app/auth/permissions.ts`.
- Domain type `CmsPageDraft` (`app/types/pages.ts`). У публічний `nuxt-cms-core/types` не
  експортується: Client Project Draft не читає.
- Тести: `supabase/tests/database/cms_page_publish.test.sql` (pgTAP, 52 перевірки), розширені
  `tests/pages-repository.test.ts`, `tests/settings-repository.test.ts`, `tests/auth-permissions.test.ts`.

Потік запису:

```
Edit Mode (008) → PagesRepository.saveDraft / publish / restore (session client, dynamic import)
  → rpc cms_page_* (security definer) → право + lock + інваріанти → одна транзакція
```

## Ключові рішення

**Draft існує лише тоді, коли є що публікувати (C-53).** Publish видаляє рядок Draft. Save Draft з
контентом, що дорівнює Published (`jsonb =`), теж його видаляє. Тому статус обчислюється з наявності
рядків, без колонки `status`, яка могла б розійтися з даними. Edit Mode завантажує
`draft ?? published ?? дефолти`. Restore останньої ревізії при наявному Draft скидає сторінку до
Published, без окремої функції Reset.

**Publish не приймає контент.** Він просуває збережений Draft: `delete … returning` → insert revision →
upsert published, з одним `now()` на всі три записи. Опублікувати можна лише те, що збережено (частина
D-20). Немає Draft → `not_found`. Атомарність перевіряє pgTAP: тригер валить останній крок, і Draft,
Published та ревізії лишаються як були.

**Ревізія — нова версія, published самодостатній (C-51).** Остання ревізія дорівнює Published. Public
read лишається одним запитом без join на ревізії. `created_by` у ревізії відповідає на питання «хто
опублікував», тож Activity у 007 не потрібна (C-56).

**Сервер перевіряє інваріанти, а не правила полів (C-52, C-58).** Обидва check-constraints на
`cms_page_draft` (object і ≤ 512 KB) застосовуються і до Save Draft, і до Restore. Published і ревізії
отримують контент лише з Draft, тож обмеження діє і на них. `required` / `maxLength` — справа
Validation Engine у 008. R-03 — прийнятий ризик.

**Токен lock не читається клієнтами (C-54).** RLS рядкова (C-06): рядок lock, видимий іншим
редакторам, віддав би їм токен, і з ним можна зберігати від чужого імені. Тому в `cms_page_locks` немає
policy і grants. «Хто редагує» для UI буде окремою RPC без токена (008). Lock пов'язаний і з токеном, і
з `auth.uid()`.

**Протермінований lock не зникає сам.** Через 2 хв без heartbeat lock можна забрати, але поки його
ніхто не забрав, стара сесія ним користується (ноутбук прокинувся — робота триває). Забрати lock чи
зробити force unlock означає змінити токен або видалити рядок, і тоді стара сесія отримує `lock_lost`.
Перевірка lock бере рядок `for update`, тож force unlock чекає на поточний Save / Publish і не
вклинюється в нього. Той самий користувач у другій вкладці забирає свій lock одразу: перша вкладка
отримує `lock_lost`, а не вічний read-only.

**Рядок сторінки створює `acquire` (C-42).** Перший вхід у Edit Mode — це взяття lock, тож lazy-insert
у `cms_pages` живе там. Невалідний `key` дає `validation` (check-constraint).

**Помилки — SQLSTATE, мапінг в адаптері.** `42501` → `permission_denied`, `P0002` → `not_found`,
`23514` / `23502` → `validation`, власні `CMSCF` / `CMSLK` / `CMSLL` → `conflict` / `locked` /
`lock_lost`. Мапінг — таблиця з `Object.hasOwn`, тож `constructor` як код не стане помилкою. Побічний
ефект: `23514` у Settings тепер `validation`, а не `unknown`, тому текст `cms.errors.validation`
нейтральний («Дані не збережено…»), не про контент.

**Session-клієнт — через dynamic import.** Як у `SettingsRepository.update()`: `useCmsPage` на public
сторінці імпортує той самий репозиторій, і статичний import потягнув би `@supabase/ssr` у public
bundle. `check:bundle` це підтверджує.

**Свідомо не зроблено.** `listRevisions` і composable для Draft: перших споживачів немає до 008 / 012.
Revalidation після Publish: публічного кешу ще немає (C-11). Soft delete Pages: перенесено в 015
(C-34). Hidden / Unpublish для статичних сторінок (C-53).

## Перевірено

- `supabase db reset`: усі міграції і seed застосовуються.
- `npm run test:db`: 2 файли, 67 тестів, PASS. Нові перевірки:
  - внутрішні хелпери (`cms_page_write_draft` та ін.) не виконуються ні anon, ні authenticated;
  - anon не читає Draft / ревізії / lock і не викликає RPC;
  - редактори не читають токени й не пишуть таблиці напряму;
  - editor не публікує і не робить force unlock;
  - Draft не видно в public read;
  - Publish створює ревізію, оновлює Published і видаляє Draft; збій на останньому кроці нічого не
    змінює;
  - Save Draft з опублікованим контентом не лишає Draft;
  - Restore без Draft / з Draft без підтвердження (`CMSCF`) / з підтвердженням (скидання), а також
    неіснуюча ревізія, ревізія іншої сторінки й тієї самої сторінки в іншій мові;
  - чужий / перехоплений / force-unlocked токен і друга вкладка дають `CMSLL`, свіжий чужий lock —
    `CMSLK`;
  - не-object, понад 512 KB і `en-gb` дають `23514`.
- `npm test`: 14 файлів, 167 тестів. `npm run typecheck`, `npm run lint`: exit 0.
- `npm run build` + `npm run check:bundle`: `/` і `/about` OK.
- SSR із `.output` на `/about`: після Save Draft (SQL під admin) сторінка показує дефолти. Після Publish
  видно новий заголовок, без перезапуску. Тестові рядки видалено.
- `gen:types`: домен `cms_locale` генерується як `string`, тож запасний варіант без домену не
  знадобився.

## Обмеження

- UI немає: викликати функції можна лише з коду або SQL.
- Сервер не знає правил полів. Owner / admin прямим викликом RPC може опублікувати сторінку з порожнім
  required-полем (C-52).
- Ревізії не мають ліміту й очищення.
- Немає RPC «хто тримає lock»: з'явиться в 008 разом з UI.
- Locale — значення з `cms.config.ts`. Lock спільний для всіх мов, Publish — на одну мову.
- Session-клієнт у RPC-методах на сервері створюється після `await import(...)`, тобто поза Nuxt-контекстом
  (той самий патерн, що `SettingsRepository.update()`). Працює, коли клієнт уже закешований на event
  middleware. Перевірити в 008 для SSR-завантаження Draft.
