# 009 — Media + Storage Adapter

Зображення в CMS стали справжніми даними. Файл лежить у Storage, його CMS-ідентичність — рядок
`cms_media`, а контент зберігає `mediaId`, а не URL (C-14). Головний сценарій для зображень складається
повністю: upload → вибір в Edit Mode → Save / Publish → серверний рендер на публічному сайті. Замінює
сесійну заглушку з 008 (C-68).

Рішення закрито перед планом і перенесено в MASTER_PLAN §2 як C-71…C-77 (було D-21…D-25, плюс нове
D-61 про резолв `mediaId` → URL). Пропущене зведено в реєстр TODO (MASTER_PLAN §3).

Джерела: architecture.md §22; Б7 (Storage & Media); дизайн-ТЗ §4; макет Figma «Media» (node 18:11399,
лише сітка). Модал файла, Picker і Brand макетів не мають: зроблені в стилі сітки на `Admin*` і
`--cms-*`, автор править після першої версії.

## Що зроблено

- **Міграція** `20261117100000_cms_media.sql`:
  - `cms_media`: display name, storage path, mime, size, width / height (null для SVG без розмірів),
    default alt / focal, `created_by`, `deleted_at` (soft delete);
  - RLS — `select` лише живих рядків для anon і authenticated; колонки без `created_by`; запис — лише
    через функції;
  - бакет `cms-media` створюється в міграції (у `config.toml` його немає), тож хмара отримає той самий:
    public, 5 МБ, JPG / PNG / WebP / SVG;
  - policies на `storage.objects`:
    - insert — `media.upload` і лише ім'я формату `<uuid>.<розширення>`;
    - delete — `media.edit` і лише файла, на який не посилається жоден рядок `cms_media`, живий чи
      видалений (`cms_media_path_in_use`);
    - select — для Storage API;
  - RPC `cms_media_create` / `update` / `replace` / `delete` / `usage`;
  - `cms_page_get_published` / `cms_page_get_draft` — документ і media, на які він посилається, одним
    запитом (`cms_media_of`: `lax $.**.mediaId`);
  - `cms_site_settings.logo_media_id` / `favicon_media_id` (FK, `on delete set null`);
  - `cms_can` перевизначено з `media.upload`, `media.edit`, `media.delete`.
- **Data Layer:**
  - `app/data/storage/storage-adapter.ts` — контракт `CmsStorageAdapter { upload, remove, publicUrl }`;
  - `app/data/storage/supabase-storage.ts` — Supabase-реалізація; запис через клієнт із сесією, URL —
    через anon-клієнт (public не тягне session client);
  - `app/data/media-row.ts` — рядок → `CmsMedia`, масив media сторінки → `CmsMediaMap`;
  - `app/data/repositories/media.repository.ts` — `list` / `get` / `getUsage` / `upload` / `update` /
    `replace` / `remove`;
  - `PagesRepository.getByKey` / `getDraft` — через нові RPC, повертають `media`;
  - `SettingsRepository` — brand media вбудовані через FK, `updateBrand()`.
- **Типи** (`app/types/media.ts`, публічні через `nuxt-cms-core/types`): `CmsMedia`, `CmsMediaMap`,
  `CmsImageValue`, `CmsFocalPoint`; `CmsPage.media`, `CmsPageDraft.media`, `SiteSettings.logo` /
  `favicon`.
- **Primitives:**
  - `CmsImage` / `CmsBackground` — новий prop `value` (адитивно до C-47); рендерять `width` / `height`
    з media;
  - `app/primitives/media.ts` — `resolveImage()` (пріоритети C-74), `toImageValue()`,
    `provideCmsMedia()` / `injectCmsMedia()`;
  - `useCmsPage` провайдить мапу media primitives сторінки.
- **Edit Mode:**
  - `Engine.media` — media з читань і з Picker; `addMedia()`;
  - `EditableImage` / `EditableBackground` рендерять значення з документа, тому вибір входить у Draft,
    Undo, Reset і Publish;
  - `ImagePanel` — Picker, upload з пристрою, alt / decorative / focal цього використання;
  - сесійний `view.media` і `ResetButton media` прибрано.
- **Admin UI:**
  - `/admin/media`: пошук, сегменти All / Images / SVG, сортування, Upload, drag & drop, картки з
    «Використовується» / «Не використовується»;
  - модал файла (`AdminMediaDialog`): превʼю, ім'я, default alt і focal, факти, usage, Replace,
    Delete з попередженням;
  - `AdminMediaPicker` — один Picker для Edit Mode і Settings (Б7 §22);
  - Settings → Бренд: логотип і favicon через Picker, «Прибрати»;
  - спільне: `AdminDialog` (нативний `<dialog>`), `AdminFocalPicker`, `AdminMediaLibrary`,
    `AdminMediaCard`;
  - `AdminSelect` — селект UI kit за макетом Figma «Select controls» (node 17:7471): combobox +
    listbox замість нативного `<select>`, стани default / hover / focus / open / disabled / error,
    клавіатура за WAI-ARIA (стрілки, Home / End, Enter, Esc, type-ahead). Відкритий — поле й список
    одним блоком з роздільником (Figma 17:7533). Позиціонує `@floating-ui/dom` (`fixed`, тож
    прокручуваний контейнер на кшталт тіла модалу його не обрізає): внизу; вгорі — лише коли знизу не
    влазить, а вгорі є місце; не влазить ніде — лишається внизу. Використано в сортуванні медіатеки й у перемикачі мови адмінки. Searchable і
    multi-select з макета — коли з'явиться споживач; `app/admin/useAdminMedia.ts`, `app/admin/media/files.ts`, `usage.ts`;
  - пункт Media в сайдбарі тепер посилання; ключі `cms.media.*`, `cms.settings.brand.*`.
- **Playground:** лендинг передає `:value` в усі зображення і фон hero; layout показує логотип і
  favicon з `useSiteSettings()`.

## Ключові рішення

- **Upload напряму в Storage (C-71).** Сервер Core не бачить файла: немає `SUPABASE_SECRET`, server route
  і ліміту тіла serverless (на Vercel 4.5 МБ, менше за 5 МБ). Довіру забезпечують три рівні:
  - бакет обмежує тип і розмір;
  - `cms_media_create` бере size з об'єкта (фактичний), а mime — з `Content-Type`, який клієнт заявив і
    бакет пропустив, і звіряє розширення шляху з типом;
  - зареєструвати можна лише свій файл (`owner_id`).

  Вміст файла не перевіряється: magic bytes і санітизація SVG — TODO. Розміри читає браузер: якщо вони
  хибні, постраждає лише `<img>`.
- **Шлях — випадковий uuid + розширення типу.** Об'єкт ніколи не перезаписується (`upsert: false`),
  тому `cache-control` — рік. Replace пише новий об'єкт під тим самим `mediaId` і видаляє старий
  (R-13). Якщо видалення не вдалося, лишається зайвий файл у Storage, а не битий сайт.
- **Usage рахується з контенту (C-72).** `cms_media_usage` шукає `mediaId` у published, draft і Brand.
  Синхронізувати при Save нічого не треба. Revisions не враховуються: старі публікації не блокують
  видалення.
- **Резолв у репозиторії (C-76).** Сторінка і її media — один запит, SSR рендерить URL без N+1. Мапа
  йде через provide від `useCmsPage`. Тому `CmsImage` поза сторінкою з `useCmsPage` (наприклад, у
  layout) резолвить лише media сторінок, які вже прочитані вище по дереву. Логотип — окремо, через
  `useSiteSettings()`.
- **Видалене media** RLS ховає від усіх клієнтів. Контент, що на нього посилається, рендерить дефолт з
  коду: на сайті не буває битих картинок. Файл лишається (revisions), Storage-policy не дає його видалити
  навіть editor-у з `media.edit`. Прибирання — TODO.
- **SVG чиститься в браузері перед upload (C-75).** Storage віддає SVG як `image/svg+xml` без CSP,
  тому відкритий напряму файл виконує свої скрипти (перевірено: обидва `alert` спрацювали).
  `app/admin/media/svg.ts` розбирає файл через `DOMParser` і перебудовує його за allow-list:
  - лишаються елементи малювання, градієнти, фільтри, `<style>` без `@import` і зовнішніх `url()`;
  - прибираються `script`, `foreignObject`, `animate` / `set`, `image`, атрибути `on*`, посилання не
    на `#фрагмент`, `javascript:` / `data:` у значеннях;
  - `<a>` розгортається у вміст; doctype, коментарі й processing instructions зникають.

  Файл, який не розбирається як SVG, відхиляється з поясненням. Без нових залежностей. Це не межа
  безпеки: прямий upload через API очистку обходить, серверна перевірка — TODO.
- **Значення зображення — недовірений вхід.** `toImageValue()` збирає значення заново з перевірених
  частин: `focal` — лише два числа 0–100, `alt` — рядок, `decorative` — `true`. Рядок у `focal` не
  потрапляє в `style` публічного HTML.
- **Alt (C-74):** перший непорожній з override → default alt медіа → `alt` з коду. Порожній override
  означає «не задано»; зображення без alt — це `decorative`.
- **Нове зображення в полі починається з чистого значення** `{ mediaId }`: alt і focal попереднього
  файла до нього не пасують.
- **Replace у модалі лише завантажує новий файл.** «Вибрати інше» — це Change Image у конкретному полі,
  а не Replace (MASTER_PLAN §8).
- **Без alt-оверрайдів для дефолтного зображення з коду.** Формат вимагає `mediaId`, тому панель просить
  спершу вибрати файл із медіатеки.

## Перевірено

- `npm test`: 19 файлів, 265 тестів (нові `media.test.ts`, `media-repository.test.ts`).
- `npm run test:db`: 4 файли, 106 перевірок (нові 31 у `cms_media.test.sql`), PASS.
- `npm run typecheck`, `npm run lint`: exit 0.
- `npm run build` + `npm run check:bundle`: `/` і `/about` OK.
- **Network на production-збірці** (`.output`): `/` — 32 запити, жодного admin / editor / медіатеки;
  зображення про студію — зі Storage.
- **Браузер, dev, admin:**
  - upload PNG у `/admin/media` → картка, мініатюра, 320 × 200 у модалі;
  - SVG: агресивний файл (script, `onload` / `onclick`, `@import`, `javascript:`-лінки, `animate`,
    `set`, `foreignObject`, зовнішній `image`, `use` з `data:`) лягає в Storage очищеним, і відкритий
    напряму не дає жодного `alert`; нормальний логотип (градієнт, `use #dot`, `<style>`) — без змін;
    зламаний файл відхилено;
  - Settings → Бренд: вибір логотипа через Picker → «Brand saved», header `/` показує `<img class="logo__image">`
    зі Storage; заданий favicon при цьому не змінився; «Прибрати» очищує лише логотип;
  - в Edit Mode фото студії → Picker → вибір → alt override → Publish;
  - серверний HTML `/`: `<img src="…/cms-media/….png" alt="Gradient from the QA run">`;
  - помилок у консолі немає.

Сценарії ручної перевірки: [docs/testing/media.md](../testing/media.md).

## Після ревʼю

Агент `review`. Виправлено:
- **CSS-ін'єкція через `focal`.** `toImageValue` пропускав `focal` як є, і рядок на кшталт
  `"0; position:fixed; inset:0"` доходив до `style` у SSR. Тепер значення збирається з перевірених
  частин; додано тести.
- **Editor міг фізично видалити файл soft-deleted media.** `cms_media_path_in_use` враховує й видалені
  рядки (C-77).
- **Insert-policy приймала будь-яке ім'я в бакеті.** Тепер лише `<uuid>.<розширення>`.
- **`decorative` зі значення видаленого media** більше не обнуляє alt дефолту з коду.
- **`cms_media_of`** шукає за PK (uuid), а не через `id::text`, і пропускає неправильні id.
- **Помилки Storage** враховують `statusCode` (RLS-відмова як 400 / `"403"`). FK `23503` →
  `validation`.
- **Upload з панелі** читає помилки з результату `upload()`, а не з внутрішнього масиву карток.
- **Дока:** mime — заявлений клієнтом і пропущений бакетом, а не «з об'єкта».

За рішенням автора після ревʼю:
- **SVG зі скриптами** — очистка в браузері (вище). Варіанти «прибрати SVG з V1» і «SVG через server
  route» відхилено.
- **Replace видаляє старий файл одразу** — лишається, записано техборгом на 016 (MASTER_PLAN §3).
- **Точку фокусу можна тягнути** (`AdminFocalPicker`, pointer events: миша, перо, touch). Жест від
  натискання до відпускання — один крок Undo в Edit Mode (`beginEdit` / `endEdit`), як сесія друку.
  Клік ставить точку, стрілки зсувають.
- **Точка фокусу — лише там, де вона щось змінює.** Точка — це `object-position`, вона діє тільки при
  `object-fit: cover`, коли пропорції рамки на сторінці й файла різні. `app/admin/media/crop.ts`
  (`visibleFrame`, `useImageCrop`) міряє справжній `<img>` поля (ResizeObserver + `load`). Немає обрізки
  (наприклад, фото студії на лендингу: `height: auto`) — панель пише, що точка не потрібна. Є обрізка —
  мініатюра затемнює невидиме і показує рамку видимої частини, яка рухається з точкою. У модалі медіатеки
  рамки немає: default focal не прив'язаний до конкретного місця.
- **Кнопки панелі редактора завжди видно.** `.ed-card > .ed-actions` — sticky-футер картки (ImagePanel,
  LinkPanel): вміст прокручується, Reset / Done лишаються внизу. `FloatingPanel` обмежує висоту картки
  місцем на екрані (`size` з floating-ui → `--ed-available-height`).
- **Brand пише лише змінений слот.** `saveBrand({ logoMediaId })` оновлює одну колонку. Раніше сторінка
  дописувала другий id зі свого стану, і застаріле значення могло затерти favicon, щойно змінений іншим
  адміном.

Свідомо лишено:
- Storage Adapter створюється всередині `PagesRepository` / `SettingsRepository`, як і Supabase-клієнт.
  Заміна провайдера — це правка `createSupabaseStorage`, а не репозиторіїв.
- Pgtap не перевіряє Storage-policies викликом Storage API: об'єкти в тесті вставляє власник міграції.

## Після аудиту 006–012 (2026-11-22)

- **`mediaId` з ключем прототипу.** Мапа media — звичайний об'єкт, тож `mediaId` `"constructor"`,
  `"__proto__"` чи `"toString"` з недовіреного контенту знаходив успадковану властивість. Зображення
  тоді не рендерилось зовсім замість дефолту з коду. XSS чи pollution це не давало. `resolveImage` тепер
  бере лише власні ключі (`Object.hasOwn`). Тест — `media`.
- **Видалення чужого незареєстрованого файла** (Storage delete-policy без `owner_id`) лишено свідомо.
  Перевірка власника зламала б прибирання старого файла після Replace, коли файл завантажив інший
  користувач. Шкода обмежена: CMS-користувач із `media.edit` може зірвати чужий upload у вікні між
  завантаженням і реєстрацією, а Replace дає йому сильніші можливості й без цього.
- **SVG при прямому відкритті** (C-75). Перевірено на локальному `storage-api v1.69.0`: Storage віддає
  `Content-Type: image/svg+xml` без CSP, без `X-Content-Type-Options` і без `Content-Disposition`, тож
  `onload` і `<script>` виконуються. Скрипт працює на origin Storage, а не сайту; через `<img>` SVG
  скриптів не виконує. Заголовки hosted Supabase не перевірено (хмарного проєкту немає) — TODO 016
  (MASTER_PLAN §3).

## Обмеження

- Оригінали без ресайзу й WebP (C-73). `width` / `height`, задані в коді Client, перекривають розміри
  з media.
- `CmsImage` у layout бачить media лише сторінок, прочитаних вище по дереву (C-76).
- Пошук — за назвою; підписи «Використовується» — ключі сторінок, а не назви полів (вони живуть у коді
  Client).
- Немає пагінації медіатеки: на V1 бібліотека невелика.
- Favicon і логотип Client підключає сам: Core не додає `<link rel="icon">` автоматично.

## Що свідомо не робили

Повний список із цільовими епіками — реєстр TODO в MASTER_PLAN §3.

- Серверна перевірка файлів (magic bytes, SVG), документи й відео (і таби Documents / Videos з макета).
- `@nuxt/image` / ресайз (016), crop, версії файлів.
- Usage для клієнтських колекцій (014); alt по мовах (010, D-28); caption.
- Private files / signed URLs (011), фізичне прибирання soft-deleted і невикористаних файлів.
- Copy URL у модалі: URL не є контрактом контенту.
