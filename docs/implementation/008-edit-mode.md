# 008 — Edit Mode (перша версія UI)

Перший раз складається головний сценарій CMS. Редактор відкриває `/admin/edit/...`, бачить справжню
сторінку Client Project з її layout і редагує контент прямо на ній. Потім зберігає Draft, публікує й
бачить зміни на сайті.

Обсяг свідомо ширший за план 008. За рішенням автора сюди підтягнуто rich text, колекції,
optional-блоки, Undo / Redo, лічильники й Reset з 008b, а також UI зображень на тимчасовій медіатеці.
Мета — перша версія UI, яку автор тестує наживо на пробному лендингу й править. Рішення закрито в
плануванні (grilling) і перенесено в MASTER_PLAN §2 як C-59…C-70 (було D-15…D-20).

Джерела: architecture.md §8–11, §19–20; Б3; Б8 → Content Lock; дизайн-ТЗ §10; референс Figma
(KitSection «Editable component states»).

## Що зроблено

- **Маршрут Edit Mode** — `app/pages/admin/edit/[...path].vue` (Core) + `app/editor/EditedRoute.vue`.
  `ssr: false` і `no-store` у route rules Core. Core admin-сторінки отримали `layout: false`, щоб
  layout Client не обгортав адмінку.
- **Editor Runtime** — `app/editor/`:
  - `context.ts` — єдиний editor-модуль, який імпортує public: injection keys і типи;
  - `engine.ts` — Editor Engine (чистий TS + Vue reactivity): документ, Undo, валідація, lock;
  - `view.ts` — що показує редактор: вибір, hover, Preview, підсвітка, прев'ю зображень;
  - `kinds.ts` — типи полів, типізований `api` кожного типу і таблиця властивостей `KIND_TRAITS`;
  - `inject.ts` — `useEditor()` / `injectRequired()`;
  - `paths.ts` — адреси полів з id-сегментами колекцій;
  - `field.ts` — реєстрація полів (`data-cms-field`, `data-cms-kind`);
  - `session.ts` — Save / Publish з фідбеком, guard незбережених змін, навігація;
  - `ui.ts` — toasts і діалоги;
  - `geometry.ts`, `link-kind.ts`, `page-title.ts`, `plain-text.ts`, `rich-text.ts` (нормалізація
    Tiptap JSON → формат C-49);
  - компоненти: `EditorRoot`, `EditorToolbar`, `OverlayLayer`, `LockBanner`, `HistoryPanel`,
    `EditorDialog`, `EditorToasts`;
  - `fields/Editable*.vue` — editable-гілки primitives;
  - `panels/*` — панелі вибраного поля і контроли елемента колекції;
  - `editor.css` (C-23).
- **Primitives** (`app/components/cms/`):
  - кожен має editable-гілку через `defineAsyncComponent(() => import(...))`, яка рендериться лише
    за наявності `CMS_EDITOR`;
  - нові props: `fieldLabel` (назва в UI редактора), `required`, `maxLength` (`CmsText`,
    `CmsRichText`), `decorative` (`CmsImage`);
  - нові primitives: `CmsBackground`, `CmsCollection`, `CmsOptional`.
- **Типи** (`app/types/primitives.ts`, публічні через `nuxt-cms-core/types`): `CmsCollectionItem`,
  `CmsCollectionValue`, `CmsOptionalValue`. В `app/types/pages.ts` — `CmsPageRevision`,
  `CmsPageLockStatus`.
- **Дані:**
  - міграція `20261115170000_cms_page_lock_status.sql` — RPC `cms_page_lock_status(key)`: хто тримає
    lock і з якого часу, без токена (C-54);
  - `PagesRepository.listRevisions()`, `getLockStatus()`, `prepareUnloadRelease()` /
    `releaseLockOnUnload()` — release lock при закритті вкладки (R-18).
- **Спільне поза editor:** `app/auth/paths.ts` (`isAdminPath` / `isEditPath` / `isLoginPath` — лише
  на межі сегмента, `/administer` не адмінка), `app/primitives/collection.ts` (id `default-N`),
  `app/primitives/media.ts` (focal → `object-position`), `app/assets/runtime.css` (перший технічний
  стиль public primitives, C-23: `.cms-background`).
- **Конфіг:** `editor.historyLimit` у `cms.config.ts` (1–500, дефолт 100) — розмір Undo-стека (C-12).
  `resolveCmsConfig` зливає вкладені групи ключ за ключем.
- **UI kit:** `AdminButton` отримав розмір `xs` (28px, на touch — 44px), `AdminInput` — `hint`,
  `size="sm"` і `multiline`. Панелі й тулбар редактора побудовані на них. Фокус-кільце
  `--cms-focus-ring` — суцільне 2px з відступом (WCAG 1.4.11).
- **`useCmsPage(key)`** в Edit Mode повертає документ з Engine замість Published.
- **Admin:** пункт «Edit site» у сайдбарі, ключі `cms.editor.*` (en / uk).
- **Залежності:** `@vueuse/core`, `@tiptap/vue-3`, `@tiptap/starter-kit`, `@tiptap/pm`,
  `@floating-ui/dom`. Усі потрапляють лише в Editor Runtime. Pinia не знадобилась.
- **Playground — лендинг «Luminary»:**
  - layout `default` з header і footer;
  - секції: Hero на `CmsBackground`, Services (колекція з `min` / `max`), About (content- і
    decorative-зображення, rich text), Work (колекція з картинками), Testimonial (`CmsOptional`), FAQ
    (колекція в `<dl>`), Contact;
  - SVG-плейсхолдери в `public/media/`;
  - діагностика переїхала на `/dev`, seed `home` оновлено під лендинг.
- **Тести:**
  - `tests/editor-engine.test.ts` — шляхи, dirty, save / publish, required / maxLength, undo-сесії,
    ліміт history, reset, колекції з defaults, lock: read-only, lost, take over;
  - `tests/editor-helpers.test.ts` — `normalizeRichText`, `dropIndex`, `linkKind`;
  - розширено `tests/pages-repository.test.ts`;
  - `supabase/tests/database/cms_page_lock_status.test.sql`.

Як це використовує Client Project:

```vue
<CmsBackground field-key="hero.background" src="/media/hero.svg" class="hero">
  <CmsText :value="hero.title" field-key="hero.title" tag="h1" required :max-length="75">
    Default title
  </CmsText>
</CmsBackground>

<CmsCollection
  :value="services.items" field-key="services.items" field-label="Services"
  :defaults="defaultServices" :template="{ title: 'New service' }" :min="1" :max="6"
  class="services" item-class="service"
>
  <template #default="{ item }">
    <CmsText :value="item.title" field-key="title" tag="h3" />
  </template>
</CmsCollection>

<CmsOptional :value="quote.visibility" field-key="quote.visibility" field-label="Testimonial" tag="section">
  …
</CmsOptional>
```

## Ключові рішення

**Рендер сторінки Client під `/admin/edit` (C-59, spike D-15).**
1. Core-сторінка `[...path]` резолвить `/about` через `router.resolve()`.
2. `loadRouteLocation()` вантажить lazy-компоненти маршруту.
3. `RouterView` рендерить маршрут з prop `route`. `viewDepthKey` скинуто на 0, тож рендер починається
   з першого matched-запису, а вкладені `<NuxtPage>` працюють.
4. Layout — `<NuxtLayout :name="meta.layout">`.

`useRoute()` усередині сторінки Client повертає її власний маршрут: ми провайдимо Nuxt
`PageRouteSymbol`. Це внутрішній API Nuxt (`#app/components/injections`). Якщо оновлення Nuxt його
перенесе, сторінки в Edit Mode побачать маршрут `/admin/edit`.

Route middleware самої сторінки Client в Edit Mode не виконується. Діє лише `cms-auth`.

Edit Mode рендериться лише в браузері (`ssr: false`): Draft і lock належать сесії редактора, а SSR
вантажив би контент двічі.

**Прив'язка сутності — через `useCmsPage` (C-60, D-16).** У сторінці Client код не змінюється.
`useCmsPage(key)` бачить `CMS_EDITOR` і викликає `bindPage(key)`. Engine бере lock, вантажує
`Draft ?? Published` і повертає `computed` над своїм документом. Сторінка далі передає `:value` у
primitives (C-47 у силі).

Мінімальний Draftable-контракт — `EditorRepository`: `getByKey`, `getDraft`, `saveDraft`, `publish`,
`restore`, `listRevisions`, lock-методи. Одна сутність на сторінку Edit Mode. Другий `useCmsPage` з
іншим ключем отримує той самий документ і dev-warning.

**Overlay Layer замість стилів на елементах Client (C-65).** Усе, що малює редактор, живе в одному
`position: fixed` шарі поверх сторінки (Teleport у `body`):
- пунктирні контури полів;
- SVG-маска затемнення з «дірками» над полями;
- hover-chip типу поля;
- рамка вибраного поля;
- контроли елемента колекції;
- floating-панелі.

Позиції — з `getBoundingClientRect` кожен кадр (`useRafFn`). Hit-test перекриття через
`elementFromPoint` перераховується, коли щось зрушило або з'явилось / зникло, і раз на 20 кадрів
(вміст, що перекриває поле без руху, наприклад меню). Тому `transform`, `overflow` і
stacking contexts у CSS Client нічого не ламають, а admin CSS не протікає на сайт.

Поле, яке перекриває вміст сторінки (наприклад, sticky header), ховається або обрізається зверху.
Інакше контури малювалися б поверх header. Шар сам ігнорує курсор, кліки беруть лише його контроли.

Виняток — текст: `contenteditable="plaintext-only"` і Tiptap живуть на справжньому елементі, тож
редагування WYSIWYG.

**Рамка Edit Mode тримає `fixed` / `sticky` елементи сайту під тулбаром.** Сторінка скролиться всередині
`.cms-edit__scroller`, а обгортка має `transform`. Тож `position: fixed` Client позиціонується
відносно рамки, а `sticky` — відносно скролера.

Ціна: `window.scrollY` в Edit Mode завжди 0. Ефекти сайту, прив'язані до скролу вікна (тінь header
після прокрутки), у редакторі не спрацюють. `IntersectionObserver` працює.

**Модель взаємодії** (Figma: Normal → Hover → Selected → Editing; C-66):
- **Hover.** Контур + chip типу («Text», «Button», «Image», «Services · 2»). На touch той самий шлях
  відкриває tap.
- **Клік по тексту.** Одразу редагування. Під полем — лічильник `n / max`, «Обов'язкове» і Reset. Над
  rich text — B / I / Link / Unlink + Reset.
- **Клік по Cms-кнопці або лінку.** Вибір без переходу + popover: підпис, адреса з виведеним типом
  («Сторінка цього сайту», «Email», «Недозволена адреса…»), нова вкладка, «Відкрити ↗», «Готово».
  Cmd / Ctrl + клік — одразу перехід.
- **Звичайні лінки сайту** (навігація, footer) працюють як на сайті, але лишають у Edit Mode:
  `/about` → `/admin/edit/about`. Якщо є незбережені зміни, з'являється діалог Save / Discard /
  Cancel.
- **Клік по зображенню.** Панель: вибір з медіатеки, upload, alt, «Декоративне», focal point (клік або
  стрілки на мініатюрі).
- **Клік по порожній зоні `CmsBackground`.** Та сама панель для фону.
- **Колекції.** Клік по полю всередині картки редагує поле. Контроли картки видно, поки курсор або
  фокус у ній: handle, ↑, ↓, дублювати, видалити, а також «+» між картками (додати після). Esc
  піднімає вибір рівнем вище: поле → елемент → колекція.
  - Reorder — pointer-drag за handle (працює для рядка, колонки й сітки). Альтернатива без
    перетягування: кнопки ↑ / ↓ і стрілки на handle (WCAG 2.2 Dragging Movements).
  - Delete виконується одразу, з toast «Undo», без модалки.
  - `min` / `max` вимикають delete / add.
- **Optional-блок.** Клік по порожній зоні → Hide. Прихований блок лишає пунктирну плашку «Hidden:
  Testimonial · Show».
- **Затемнення.** Нередаговане затемнюється одразу при вході. Toggle «Highlight» у тулбарі вимикає
  затемнення й лишає тонкі контури. Утримання Alt тимчасово повертає карту полів. Змінені відносно
  Published поля мають помаранчевий контур.
- **Клавіатура.**
  - Tab по полях; поля, що не фокусуються самі (зображення, фон, елементи), отримують `tabindex=0`.
  - Enter / Space вибирає поле, Esc — рівень вище.
  - Cmd+S — зберегти, Cmd+Z / Cmd+Shift+Z — Undo / Redo.

**Колекції: стабільні id і відносні адреси (C-67).**
- Значення — `[{ id, ...поля }]`, порядок масиву = порядок показу.
- Адреса поля в елементі — `services.items.<id>.title`, тож reorder не плутає значення.
- `CmsCollection` провайдить scope, і в slot пишеться просто `field-key="title"`.
- Дефолти з коду отримують id `default-N` і копіюються в документ при першій зміні будь-чого
  всередині колекції (`registerCollectionDefaults` + `materialize`).
- Новий елемент береться з `template` і отримує випадковий 6-символьний id.
- Елементи рендеряться в обгортках `itemTag` / `itemClass`: редактору потрібен елемент на кожен item.

**Undo — сесія редактора, не ревізії (C-64, D-20, C-12).**
- Знімки документа, ліміт 100.
- Одна сесія друку в полі = один крок (`beginEdit` / `endEdit`).
- Undo для rich text — теж Engine; власний `undoRedo` Tiptap вимкнено.
- Publish очищує стек.
- History у тулбарі — це список публікацій (ревізій) з Restore, і в UI так і названо: «Це не скасування
  дій».

**Save і Publish (C-61, D-17).**
- Явний Save draft, автозбереження немає.
- Publish зі незбереженими змінами спершу зберігає, потім публікує збережене (C-55 у силі).
- Publish вимкнено, коли публікувати нічого або є блокуючі проблеми (`required`, `maxLength`).
- Editor без `pages.publish` бачить лише Save draft.
- Статус у тулбарі: Опубліковано / Є незбережені зміни / Збереження… / Чернетка не опублікована /
  Не збережено + Повторити.
- `beforeunload` і route guards захищають від втрати змін.

**Content Lock UI (C-69).**
- Lock береться при вході, heartbeat кожні 30 с, release на виході й при переході між сторінками.
- При закритті вкладки — `fetch` з `keepalive` і заздалегідь закешованим access token. `sendBeacon`
  не підходить: він не передає `Authorization`.
- Чужий lock → read-only + банер «X редагує цю сторінку з 19:38». «Забрати редагування» доступне з
  `pages.unlock`, а будь-кому — якщо чужа сесія протермінована.
- Втрачений lock (друга вкладка, force unlock) → банер «Сесія більше не активна» з «Забрати назад і
  продовжити». Незбережені зміни лишаються в пам'яті й зберігаються вже з новим токеном.

**Зображення — лише в сесії до 009 (C-68).** Формат `CmsImageValue` — D-24 (009), а контент
зберігає `mediaId`, не URL (C-14). Тому заміна, alt, decorative і focal живуть в `Engine.media` і
**не зберігаються**. Панель каже про це прямо.

Медіатека-заглушка — це всі зображення сторінки плюс файли з пристрою (object URL). `CmsImage`
отримав prop `decorative`: alt завжди порожній, поля alt у панелі немає. `CmsBackground` — `<img>`
з `object-fit: cover` позаду slot. Це не CSS background: так фон лишається полем, яке можна вибрати.

**Rich text на Tiptap, у межах формату C-49.**
- Tiptap монтується прямо в тег поля (`element: { mount }`), без зайвого `div`.
- Увімкнено лише doc / paragraph / text / hardBreak / bold / italic / link.
- `isAllowedUri` — той самий allow-list, що й `toSafeHref`.
- Перед записом JSON проходить `normalizeRichText`: зникають `rel`, `class`, `target: null` та
  невідомі вузли.
- В `inline`-полях Enter дає `hardBreak`, не абзац.

## Перевірено

- `npm test`: 19 файлів, 224 тести. `npm run test:db`: 3 файли, 75 перевірок, PASS.
- `npm run typecheck`, `npm run lint`: exit 0.
- `npm run build` + `npm run check:bundle`: `/` і `/about` OK.
- **Network на production-збірці** (`.output`, браузер): `/` після завантаження, руху миші й прокрутки
  вантажить 30 assets. У жодному немає маркерів Editor:
  - `ProseMirror`, `data-cms-overlay`, `useEditorField`, `cms-editor-ui`;
  - `--cms-primary`, `createBrowserClient`, `floating-ui`.
- **Браузер, dev, owner:**
  - `/admin/edit/` рендерить layout і сторінку Client: 61 поле, без помилок у консолі;
  - inline-текст, Reset;
  - popover кнопки;
  - панель зображення;
  - toolbar rich text;
  - «+» додає картку;
  - Cmd+S → «Чернетка не опублікована»;
  - Undo / Redo в rich text;
  - Publish → «Опубліковано»;
  - Preview;
  - навігація лінком header із незбереженими змінами: діалог → «Вийти без збереження» →
    `/admin/edit/about`;
  - drag першої картки в кінець;
  - Hide optional-блоку → плашка «Hidden: Testimonial · Show».
- **Lock:**
  - admin у другому браузері бачить банер «owner@example.com редагує…» і `contenteditable="false"`;
  - «Забрати редагування» → редагування доступне;
  - у вкладці owner наступний Save дає банер втраченої сесії, а введений текст лишається.

## Після ревʼю

- **`ready` у `bindPage` не резолвився.** Це стосувалось `useCmsPage`, викликаного після
  завантаження: `watch` з `immediate` звертався до `stop` до його ініціалізації. Тепер `ready` одразу
  резолвиться, якщо завантаження вже завершилось.
- **Вихід із втраченим lock мовчки губив зміни.** Тепер guard-и (`beforeunload`, route guards,
  лінки) питають і в стані `lost`. Діалог пропонує «Забрати назад і зберегти».
- **«Забрати редагування» лишав застарілий документ.** Якщо інший користувач встиг опублікувати, Save
  + Publish повертав старе. `takeOver()` тепер перечитує сервер. Без локальних змін документ
  замінюється, а Undo очищується. З локальними змінами вони лишаються, а оновлюється Published, з яким
  їх порівнюють. Тест на обидва випадки.
- **Інші виправлення:**
  - Save серіалізовано (Cmd+S з автоповтором);
  - lock, отриманий після закриття редактора, одразу звільняється (`dispose`);
  - Reset поля дефолтного елемента колекції повертає дефолт із коду, а не порожнє;
  - `publishedValue` читає закешований документ;
  - hit-test більше не крутиться кожен кадр через приховані поля;
  - «Undo» у toast видалення працює, лише поки видалення — останній крок;
  - read-only сторінка перечитує власника lock кожні 30 с, тож кнопка для протермінованої сесії
    з'являється сама;
  - `#якір` і відносні адреси резолвляться від сторінки сайту, а не від `/admin/edit/...`; лінк на
    `/admin` виходить з Edit Mode;
  - `CmsText` в Edit Mode веде текст імперативно (`textContent`). Vue-вузол міг бути вже
    від'єднаний браузером, і Undo / Reset не оновлювали екран.
- **Release при закритті вкладки — метод repository** (`createLockBeacon()`), а не прямий URL з
  компонента.
- **`check:bundle`:** Tiptap / ProseMirror тепер `expected: true`. Додано маркери editor-коду
  (`data-cms-overlay`, `useEditorField`, `cms-editor-ui`).

Свідомі відповіді на питання ревʼю:
- `maxLength` — м'який ліміт: лічильник червоніє, Publish блокується, друк не обрізається (як у
  дизайн-ТЗ). Жорсткий ліміт C-58, який не дає ввести більше, — окремий prop, коли знадобиться.
- Read-only глядач бачить Published, а не чужий Draft. Чужий Draft — незавершена робота іншої людини,
  до того ж без її незбережених змін.
- `cms_page_lock_status` — окрема міграція 008. Вона додає функцію і не змінює таблиці 007.

## Код-ревью 2 (`/code-review` + Web Interface Guidelines)

Чотири осі: баги, стандарти репо, відповідність плану, UI / a11y. Виправлено:

- **Дані.**
  - Текст читається через `textContent` (`plain-text.ts`), а не `innerText`. Раніше `text-transform:
    uppercase` зберігав «CREATIVE STUDIOx».
  - Знімки документа — `stableStringify`: jsonb повертає ключі в іншому порядку, і без цього було
    хибне «Є незбережені зміни».
  - Дефолт поля — завжди зі slot. `LinkPanel` пише лише змінену частину значення, без копіювання
    дефолтів коду.
  - Перемістити першу картку вгору або видалити неіснуючу більше не створює кроку Undo.
- **Lock.**
  - Невдале «Забрати назад» лишає стан `lost`, тож guard-и далі захищають зміни. Restore і take over
    чекають на Save, що ще виконується.
  - Після повернення з bfcache lock береться знову. Release при закритті вкладки — метод repository.
- **Одна сутність.** Редактор отримує лише сторінка (`EditedRoute` провайдить `CMS_EDITOR`), layout
  лишається звичайним кодом. Другий `useCmsPage` з іншим ключем показує Published, і його primitives
  публічні. `refresh` перечитує контент, не беручи lock заново.
- **Preview.**
  - Поля не редагуються.
  - Лінки лишаються в Edit Mode: на публічній сторінці немає Draft.
  - Esc виходить з Preview.
- **Клавіатура й фокус.**
  - Вибір з клавіатури (`click.detail === 0` або Enter на `role=button`) переводить фокус у панель або
    контроли картки. Esc повертає його на поле.
  - Esc обробляється у bubble-фазі: діалог, історія й форми закривають себе, не скидаючи вибір.
  - Cmd+Z / Cmd+S працюють у будь-якій розкладці (`event.code`) і не чіпають поля вводу та відкритий
    діалог. Cmd+S більше не викидає з тексту.
  - Видимий фокус на всіх полях.
  - Діалог: кнопка X, фокус на «Скасувати» для деструктивних дій, повернення фокусу.
  - Drawer історії бере фокус і повертає його на кнопку.
  - Після видалення картки фокус переходить на сусідню.
- **Доступність.**
  - Поля мають `role`, назву, `aria-required` / `aria-invalid`.
  - Переміщення картки оголошується.
  - Лічильник оголошується лише при наближенні до ліміту.
  - Toasts стоять на паузі при hover / focus, мають кнопку закриття, помилки — `role=alert`.
  - Мітки тулбара на вузьких екранах лишаються для зчитувачів.
  - Touch-цілі 44px.
  - `lang` адмінки на UI редактора.
- **Взаємодія.**
  - Клік по кнопці лише вибирає її і не запускає `@click` сайту.
  - Картинку або картку в лінку можна вибрати.
  - Cmd+клік відкриває нову вкладку.
  - Контури полів видно й без затемнення.
  - Список проблем у тулбарі веде до поля. Publish з проблемами переходить до першої.
  - «Скасувати зміни» в тулбарі, «Скинути сторінку до опублікованої» в історії.
  - Reset у панелях колекції й optional.
  - «Забрати редагування» питає підтвердження.
- **Стандарти.**
  - Кольори й z-index — токени та змінні `--cms-edit-*`.
  - Рядки «Home» і «· Edit» перекладено.
  - Inline-стилі `CmsBackground` перенесено в `runtime.css`.
  - Magic values стали константами; `until` з VueUse.
  - Типізований `api` замість кастів, одна таблиця `KIND_TRAITS` замість повторюваних `if` по `kind`.
  - Дублікати винесено.
  - View-стан виокремлено з Engine.
  - Невикористані ключі i18n прибрано, множини переформульовано.
- **Лендинг.**
  - Reduced motion.
  - `scroll-padding` / `scroll-margin` під sticky header.
  - Skip-link.
  - Lazy-зображення нижче першого екрана; фон hero — eager з високим пріоритетом.

Сценарії ручної перевірки, зокрема Content Lock у двох браузерах:
[docs/testing/edit-mode.md](../testing/edit-mode.md).

## Виправлено пізніше

- **Перетягування елементів колекції в сітці** (під час 009). `dropIndex` визначав сітку як один ряд і
  вирішував «до / після» лише за горизонтальною половиною картки. Через це картку не можна було
  перетягнути вниз, вгору чи на ліву половину сусідньої. Тепер елемент займає місце того, на який його
  кинули, а між елементами — найближчого (`app/editor/geometry.ts`). Тести на сітку — у
  `tests/editor-helpers.test.ts`, сценарій — EM-COLL-05.
- **Тулбар картки колекції прилипав до старої картки** (під час 009). Фокус у тулбарі закріплював його
  за карткою навіть після кліку мишею (а після reorder редактор сам повертає фокус на ручку), і вибрана
  картка мала пріоритет над наведенням. Тепер тулбар закріплюється фокусом лише при вводі з клавіатури,
  а наведення важливіше за вибір (`OverlayLayer.vue`). Сценарій — EM-COLL-06.
- **Адмін-сторінка в регістрі, відмінному від `/admin`, рендерилась усередині редактора** (аудит 006–012,
  2026-11-22). vue-router за замовчуванням зіставляє шляхи без урахування регістру. Тому
  `/admin/edit/ADMIN/settings` відкривав Settings як «сторінку Client», а `/admin/edit/ADMIN/edit/x` —
  сам редактор усередині себе. Перевірка `isAdminPath` бачила лише введений рядок. Привілеїв це не
  давало: editor і так відкриває ці сторінки, а дані захищає RLS. Виправлено:
  - `isPathUnder` (`app/auth/paths.ts`) порівнює без регістру, як роутер. Це стосується й гейту
    `cms-auth` (`/admin/EDIT/...` — теж Edit Mode), `safeRedirect` і навігації в Edit Mode;
  - `[...path].vue` відмовляє, якщо будь-який зіставлений запис маршруту лежить під `/admin`.

  Тест — `auth-paths`, сценарій — EM-NAV-06.

## Обмеження

- Зображення не зберігаються до 009 (C-68).
- `window.scrollY` в Edit Mode — 0 (рамка зі скролером).
- Route middleware сторінки Client в Edit Mode не виконується.
- Одна сутність на сторінку Edit Mode. Глобальний контент (header, footer) — звичайний код Client і не
  редагується (C-63).
- `PageRouteSymbol` — внутрішній API Nuxt (C-59).
- Page switcher показує лише статичні маршрути Client: динамічні параметри Edit Mode не вгадує.
- Ревізії показують лише час: автора (email) дасть Activity / profiles (012, 015.2).
- Device preview (мобільна ширина) відкладено: без iframe медіа-запити не перемикаються чесно.
- Колір у rich text (дизайн-ТЗ) поза V1: формат C-49 його не має.
- Тести UI — лише через браузер, автоматичних UI-тестів немає (C-33).

## Що свідомо не робили

- Перемикач мов (010), Translate у міні-тулбарі поля (010).
- Справжня медіатека, upload у Storage (009).
- Activity-записи (012, C-62).
- Автозбереження (C-61).
- Редагування header / footer як сутності (C-63).
- Business Collections і template pages (014).
