# 006 — CMS Primitives, тільки Public Runtime

Client Project тепер будує контент сторінки з `Cms*` render-компонентів, а не з ручного
`hero.title ?? 'Default'`. Кожне поле має адресу, і в 008 до primitive додасться editable-гілка,
а API не зміниться. Головне в епіку — формати значень (rich text, link), бо їх почне зберігати
Draft у 007. Тому рішення D-06…D-08 закрито до плану (MASTER_PLAN C-47…C-49).

Джерела: architecture.md Summary §8–9; Б3 §3, §5, §9, §14–16, §30–31; Б4 §5–6, §13; Б17 §7–8,
§37–38.

## Що зроблено

- **Типи значень** — `app/types/primitives.ts`:
  - `CmsRichTextValue`: Tiptap JSON — `doc`, `paragraph`, `text`, `hardBreak`; marks `bold`,
    `italic`, `link`;
  - `CmsLinkValue`: `{ label?, href?, newTab? }`.
- **Entry `nuxt-cms-core/types`** (`app/types/index.ts`) — типи для Client Project:
  `CmsPage`, `CmsPageContent`, `CmsRichText*`, `CmsLinkValue`.
- **Helpers поза auto-imports** — `app/primitives/`:
  - `field-key.ts` — `CMS_FIELD_KEY_PATTERN`, `isCmsFieldKey()`, dev-warning
    `warnInvalidFieldKey()`;
  - `link.ts` — `toSafeHref()`, `resolveCmsLink()`, dev-warning `warnUnsafeHref()`;
  - `rich-text.ts` — `renderRichText(value, { inline })` через `h()`.
- **Компоненти** — `app/components/cms/`: `CmsText`, `CmsRichText`, `CmsLink`, `CmsButton`,
  `CmsImage`.
- **Скрипт `npm run check:bundle`** (`scripts/check-public-bundle.mjs`) — автоматична перевірка
  public bundle (C-21) замість ручної процедури з 004c.
- **Тести**: `tests/link.test.ts`, `tests/rich-text.test.ts`.
- **Playground**: `/` і `/about` переписано на primitives. У seed `hero.lead` став rich text, і
  з'явився `hero.cta`. Додано `playground/public/placeholder.svg`.

Як це використовується:

```vue
<CmsText :value="hero.title" field-key="hero.title" tag="h1">Default title</CmsText>
<CmsRichText :value="hero.lead" field-key="hero.lead" tag="p" inline>Default lead</CmsRichText>
<CmsButton :value="hero.cta" field-key="hero.cta" href="/about">About us</CmsButton>
```

## Ключові рішення

**Значення йде лише вниз (C-47).** Сторінка передає `:value` і `field-key`, primitive нічого не
емітить. У 008 значення змінюватиме Editor Engine, а `useCmsPage` в Edit Mode віддаватиме Draft.
Дефолт із коду — вміст slot:
- `value == null` → рендериться slot;
- `''` — валідне порожнє значення, бо редактор міг свідомо очистити поле.

У `CmsLink` / `CmsButton` кожна частина значення з БД перемагає свій дефолт окремо: `label` —
slot, `href` — prop `href`.

**`fieldKey` обов'язковий уже зараз, хоча Public Mode його не читає.** Зробити prop обов'язковим
після publish було б breaking change (Б3 §31). Формат (C-48) перевіряється лише в dev
(`import.meta.dev`), тож у production-бандлі тексту warning немає. В HTML адреса не потрапляє:
`data-*` атрибути додасть editable-гілка в 008.

**Rich text рендериться без Tiptap і без `v-html` (C-49).** Документ приходить з БД неперевіреним,
тому вхід renderer'а — `unknown`:
- кожен вузол і mark перевіряються, невідоме (заголовки, `textStyle`, зображення, нерядковий
  `text`) пропускається;
- повторний mark застосовується один раз, перший mark стає зовнішнім;
- текст екранує сам Vue;
- `rel` і `class` з даних ігноруються, `target: '_blank'` дає `rel="noopener noreferrer"`.

**Rich text у заголовку — явний prop `inline`.** Варіант «один абзац → без `<p>`» відкинуто: тоді
DOM залежав би від вмісту, і другий абзац дав би `<p>` усередині `<h1>`. `inline` рендерить
абзаци в `tag`, а межі між ними — як `<br>`.

**Allow-list для `href`, а не block-list.** Запис іде з браузера редактора через RLS, тож `href` —
недовірений вхід. `toSafeHref()` повторює нормалізацію URL-парсера:
- прибирає C0-символи й пробіли по краях;
- видаляє `\t`, `\n`, `\r` усередині (`java\tscript:` → `javascript:`);
- після цього відкидає будь-які керівні символи.

Дозволено:
- `http(s):`, `mailto:`, `tel:`;
- `//host`;
- шляхи сайту `/…` і якорі `#…`.

Усе інше, зокрема `javascript:`, `data:` і «голі» `about` / `www.example.com`, рендериться
текстом: `<span>` у `CmsLink`, `<button>` у `CmsButton`. У плані були ще `./`, `../` і `?`.
Їх прибрано: споживача немає, а відносний шлях від поточного URL на сайті з вкладеними
маршрутами — це пастка. Додати їх можна адитивно.

**Тип посилання не зберігається.** Тип (internal, section, email, phone, external) однозначно
виводиться з `href`, а окреме поле `kind` могло б з ним розійтися. Функцію виведення в 006 не
будували, бо `NuxtLink` сам розрізняє внутрішні й зовнішні адреси. Знадобиться вона UI вибору типу
(008b).

**`CmsButton` без безпечного `href` — це `<button type="button">`.** `@click` Client Project
доходить до нього як fallthrough attribute. CMS редагує лише підпис.

**`CmsImage` поки не має `value`.** Контент зберігатиме `mediaId`, а не URL (C-14), а формат
значення — D-24 (009). Тому зараз `src` — лише дефолт з коду, а `value` з'явиться в 009 адитивно.
`alt` за замовчуванням `''`, тобто decorative. Без `src` компонент нічого не рендерить.

**`runtime.css` не створено.** Жоден primitive не потребує технічних стилів, а порожній файл
«про запас» суперечить правилам. C-23 у силі: файл з'явиться з першим реальним технічним стилем.

**Helpers лежать в `app/primitives/`, а не в `app/utils/`.** `app/utils` layer'а став би
глобальним auto-import у Client (та сама причина, що й C-40).

**Як працює `check:bundle`:**
1. запускає production-сервер з `playground/.output` на вільному порту;
2. бере HTML `/` і `/about`;
3. рекурсивно проходить статичні імпорти від `<script src>` і `<link rel=modulepreload|stylesheet|prefetch|preload>`
   (`import()` не проходить);
4. шукає маркери адмінки, vee-validate, session-клієнта, Tiptap / ProseMirror у HTML і в кожному
   файлі графа.

Два нюанси:
- **Ціль `__vite__mapDeps`.** Entry містить імена файлів усіх lazy-чанків (у тому числі
  `AdminShell.*.css`), тому рядки-шляхи до assets вирізаються перед пошуком. Без цього перша ж
  перевірка дала хибне спрацьовування.
- **Чек не має бути холостим.** Кожен маркер з `expected: true` мусить знайтися в якомусь
  не-public чанку, інакше скрипт падає з «the check may be stale».

## Перевірено

- `npm test`: 14 файлів, 141 тест. Нові:
  - `link` — небезпечні схеми, зокрема `JaVaScRiPt:`, `java\tscript:`, `\u0001javascript:`,
    `data:`, `vbscript:`, `file:`; нерядкові значення; дозволені адреси; нормалізація;
  - `rich-text` — marks та їх вкладеність, повторний mark, `hardBreak`, безпечний і небезпечний
    link, екранування `<script>`, невідомі вузли й marks, сміття на вході, `inline`.
- **Помилка, знайдена тестом.** Дедуплікація marks у зворотному порядку ставила повторний mark
  всередину. Виправлено.
- `npm run typecheck`, `npm run lint`: exit 0.
- `supabase db reset` + `npm run test:db`: 15 тестів, PASS.
- `npm run build` + сервер з `.output`:
  - SSR `/` рендерить з БД `<h1>`, `lead` з `<strong>` усередині `<p>` (без вкладеного `<p>`) і
    CTA `<a href="/about">Про нас</a>`;
  - `/about` без рядка рендерить дефолти зі slot;
  - `field-key`, `fieldKey` і `data-cms` у HTML відсутні.
- `npm run check:bundle`: exit 0, `/` — 15 assets, `/about` — 14. Усі `expected`-маркери
  знаходяться в admin-чанках.
- **Негативна перевірка.** Тимчасовий `<AdminButton>` на `/` → exit 1 з маркерами `cms-admin` /
  `--cms-` у HTML і `AdminButton.*.css`, а також `createBrowserClient` у спільному чанку.
  Після цього probe прибрано й перезібрано.
- **Dev-warnings.** `field-key="hero..title"` і `href="javascript:alert(1)"` дають `WARN` у
  консолі dev-сервера, а посилання рендериться як `<span>`. У `.output` тексту warnings немає.
- **Не перевірено в браузері:** hydration warnings у консолі клієнта. SSR-розмітка детермінована,
  але це висновок, а не перевірка.

## Обмеження

- Значення з БД не валідуються проти типу. Якщо в `hero.title` лежить не рядок, `CmsText` його
  все одно відрендерить: Vue перетворить значення на рядок. Валідація документа — серверна, при
  Publish (D-11, 007).
- `check:bundle` перевіряє лише `/` і `/about` playground і лише клієнтські assets. Список
  маршрутів — константа в скрипті. CI — 016.
- `alt` у `CmsImage` не перекладається і не редагується до 009.
- Посилання всередині rich text рендеряться звичайним `<a>`, а не `NuxtLink`. Тому внутрішня
  адреса дає повне перезавантаження сторінки. Що робити з посиланнями в Edit Mode, вирішує 008.
  Змінити це можна без breaking change.
- `check:bundle` не бачить lazy-імпорту, який public-сторінка виконує безумовно
  (`<ClientOnly><LazyX/>`, `defineAsyncComponent`, `import()` в `onMounted`). У HTML такого коду
  немає, а `import()` скрипт свідомо не проходить. Editable-гілка 008 підключатиметься саме так,
  тому DoD 008 включає перевірку в браузері: які чанки реально запитує `/`.

## Після ревʼю

- **`check:bundle` падає, якщо маршрут повертає не 2xx.** На сторінці помилки немає чанка
  сторінки, тож граф пройшов би «порожнім».
- **`check:bundle` резолвить bare-специфікатори через `<script type="importmap">` з HTML.** Так
  Nuxt підключає `#entry`. Резолвляться й абсолютні `/_nuxt/…`. Інші нерелятивні збіги
  ігноруються: у поточній збірці єдиний такий збіг — текст `import '@supabase/supabase-js/tracing'`
  у повідомленні Supabase. Падати на ньому було б хибним спрацьовуванням.
- **`toSafeHref` відкидає `\` в адресах без схеми.** Браузер читає `/\evil.com` як
  `https://evil.com/`, тобто як інший хост, а не шлях сайту. Майбутнє виведення типу посилання
  (`/…` → internal) інакше помилялося б.
- **`CmsButtonValue`** — окремий тип, поки що alias `CmsLinkValue`. Б3 називає ці значення
  окремо, а в кнопки можуть з'явитися власні поля. Окреме ім'я дає Client типізувати `cta` так,
  щоб це не стало breaking change.
- **`CmsRichText` показує slot, якщо значення не `doc`** (наприклад, рядок старого формату), а не
  порожній тег.
- **Dev-warning для `CmsRichText` без `inline` у phrasing-тегах** (`p`, `span`, `h1`–`h6`, `a`…).
  Інакше виходить `<p><p>…</p></p>`, невалідний HTML і hydration mismatch.
- **Warning про небезпечний `href` у `CmsLink` / `CmsButton` реактивний** (`watchEffect`, лише в
  dev), тож спрацює і на зміну значення в 008.

Питання ревʼю, внесені в реєстр MASTER_PLAN §6:
- **D-60.** Хто локалізує внутрішній `href` у `CmsLinkValue`, коли Client має locale-префікси?
- **D-24.** Який пріоритет між prop `alt` у `CmsImage` і alt медіа / `altOverride`?

## Що свідомо не робили

- Editable-гілка, Editor Context, `data-*` атрибути (008).
- Резолвер «значення за адресою» і dev-перевірка `value` ↔ `fieldKey` (008).
- `CmsCollection` / `CmsOptional`: немає споживача на playground.
- `value` у `CmsImage`, `CmsImageValue` (009).
- `runtime.css`.
- Виведення типу посилання (008b), посилання на запис колекції (014).
- Тести компонентів (за правилами — без UI-тестів).
