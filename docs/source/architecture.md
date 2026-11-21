<!--
Почищена робоча копія архітектурної доки CMS Core.
Оригінал: https://docs.google.com/document/d/1iL23fjzqbNOZZedsEpg-Qgf7vGQROQdYSCVScSt9q3o/edit
Експорт: 2026-11-14.
-->

> **Як читати цей файл.** Це почищена копія Google Doc: прибрано застарілі версії (Localization v1), розмовні вставки, блок «прибрати суперечки» і старі назви (`igor-cms`), виправлено формулювання, що суперечили канону. Повний журнал правок — `docs/MASTER_PLAN.md` → «Errata». Відкриті питання не вирішувались у тексті — вони позначені `⚠ Відкрите рішення` і зібрані в реєстрі MASTER_PLAN.
>
> **Ієрархія джерел правди:** `docs/MASTER_PLAN.md` (канонічні рішення) → цей Architecture Summary → найновіша версія відповідного блоку → найпростіше рішення.

# CMS Core — Architecture Summary

## 1. Призначення документа

Цей розділ є головним архітектурним описом CMS Core.

Він визначає базові принципи системи, межі відповідальності між CMS Core і Client Project та основні правила, яких потрібно дотримуватися під час реалізації.

Усі детальні архітектурні блоки нижче розширюють ці правила.

Якщо в старішому або більш детальному описі існує неоднозначність, пріоритет мають:

1. канонічні рішення в `docs/MASTER_PLAN.md`;  
2. цей Architecture Summary;  
3. найновіша версія відповідного архітектурного блоку;  
4. найпростіше рішення, яке відповідає описаним нижче принципам.

Головна ціль — створити стабільну, зрозумілу та масштабовану CMS без зайвої складності.

---

## 2. Що являє собою система

CMS — це система керування та редагування контенту для сайтів, створених на Nuxt.

Вона не є:

* Page Builder;  
* Elementor-подібним конструктором;  
* no-code платформою;  
* SaaS із єдиною базою для всіх клієнтів;  
* універсальним конструктором database schema.

CMS складається з двох незалежних частин:

CMS Core  
\+  
Client Project

### CMS Core

Універсальне ядро CMS, яке перевикористовується між проєктами.

### Client Project

Конкретний сайт конкретного клієнта.

Кожен Client Project є звичайним Nuxt-проєктом, який використовує CMS Core як dependency.

---

## 3. Основний технологічний стек

Базовий стек:

Nuxt 4  
Vue 3  
TypeScript  
CSS Variables + scoped CSS (нативний CSS)  
VueUse  
Pinia — лише разом з Editor Engine  
Supabase

CMS Core не використовує Tailwind або SCSS, щоб не нав'язувати Client Project препроцесор чи utility-фреймворк. Client Project може використовувати Tailwind для власного сайту.

Для Rich Text:

Tiptap

але тільки там, де реально потрібне форматування тексту.

Тестування:

Vitest  
Nuxt Test Utils

Автоматизовані E2E-тести не є обов'язковою частиною базової архітектури.

Вони можуть додаватися лише для конкретних критичних сценаріїв, якщо в майбутньому з'явиться реальна потреба.

---

## 4. CMS Core

CMS Core є окремим версіонованим npm-пакетом.

Робоча назва:

nuxt-cms-core

CMS Core містить універсальну CMS-функціональність:

* Admin Panel;  
* Edit Mode;  
* CMS UI primitives;  
* CMS editable primitives;  
* Editor Engine;  
* Media Library;  
* Forms infrastructure;  
* Activity;  
* Revisions;  
* Authentication integration;  
* Authorization / Permissions;  
* Repository contracts;  
* Supabase backend implementation;  
* Runtime configuration infrastructure;  
* Integrations infrastructure;  
* shared composables;  
* stores;  
* middleware;  
* types;  
* utilities;  
* Core migrations.

CMS Core не містить бізнес-логіку конкретного сайту.

---

## 5. Client Project

Client Project містить усе, що є специфічним для конкретного клієнта:

* дизайн;  
* Vue/Nuxt сторінки;  
* layout;  
* Header / Footer;  
* Hero та інші секції;  
* бізнес-компоненти;  
* Products / Doctors / Apartments / Events тощо;  
* бізнес-логіку;  
* project-specific repositories;  
* project-specific migrations;  
* project-specific integrations;  
* SEO-логіку конкретного проєкту;  
* конфігурацію CMS для конкретного сайту.

Client Project не повинен дублювати універсальну логіку CMS Core.

Він використовує стабільний public API Core.

---

## 6. CMS не є Page Builder

Це одне з головних правил усієї системи.

Структура сторінок визначається виключно розробником у Vue/Nuxt.

Наприклад:

HomePage  
├── Hero  
├── Services  
├── Testimonials  
└── CTA

ця структура існує у frontend-коді.

Вона не зберігається в database як:

sections\[\]  
components\[\]  
layout tree  
page schema

Адміністратор CMS не може:

* додати довільну секцію;  
* переставити Hero і Services;  
* змінити layout;  
* створити новий тип компонента;  
* конструювати сторінку.

Він змінює лише контент, який розробник зробив editable.

---

## 7. Template Pages

CMS може дозволяти створювати нові сторінки там, де frontend template уже існує.

Наприклад:

/products/\[slug\].vue

Адміністратор створює:

Product

але не створює новий Vue-компонент або структуру сторінки.

Flow:

Product Record  
↓  
Existing Nuxt Template  
↓  
Rendered Product Page

Те саме може працювати для:

* Blog Posts;  
* Cases;  
* Doctors;  
* Events;  
* Services;  
* інших бізнес-сутностей.

---

## 8. CMS Primitives

CMS Core надає невеликий набір універсальних компонентів:

CmsText  
CmsRichText  
CmsImage  
CmsButton  
CmsLink  
CmsCollection  
CmsOptional

Client Project використовує їх усередині власних компонентів.

Наприклад:

HeroSection  
├── CmsText  
├── CmsRichText  
├── CmsImage  
└── CmsButton

`HeroSection` належить Client Project.

Поведінка `CmsText`, `CmsImage`, `CmsButton` тощо належить CMS Core.

Таким чином bugfix або improvement CMS primitive можна доставити в різні Client Projects через оновлення версії CMS Core.

---

## 9. Public Mode, Edit Mode та Admin

Система має три принципово різні runtime-зони:

Public Runtime  
Editor Runtime  
Admin Runtime

### Public Runtime

Звичайний сайт для відвідувача.

Не повинен завантажувати:

* Editor Engine;  
* Tiptap;  
* ProseMirror;  
* Media Picker;  
* Admin Panel;  
* History Manager;  
* editor stores;  
* editor CSS;  
* admin CSS;  
* toolbar;  
* editor listeners.

CMS primitives у Public Mode працюють як максимально легкі render-компоненти.

### Editor Runtime

Завантажується тільки після входу в Edit Mode.

Містить:

* Editor Engine;  
* Selection;  
* Hover;  
* Toolbar;  
* Draft Manager;  
* Validation;  
* Undo/Redo;  
* Media Picker;  
* Tiptap;  
* Publish logic.

### Admin Runtime

Містить CMS Admin Panel.

Public Website не повинен платити bundle size або performance за існування Admin/Edit Mode.

---

## 10. Edit Mode

Edit Mode дозволяє редагувати реальний Client Project без створення окремої editable-копії сторінки.

Public та Edit Mode використовують одні й ті самі клієнтські компоненти.

Наприклад:

/about

і:

/admin/edit/about

повинні рендерити ту саму frontend-структуру.

> ⚠ Відкрите рішення — технічний механізм рендеру клієнтської сторінки з її layout під `/admin/edit/...` і обхід SSR-кешу. Див. `docs/MASTER_PLAN.md`, реєстр відкритих рішень (епік 008).

Різниця полягає в:

Published Data

або:

Draft Data \+ Editor Runtime

Edit Mode не повинен мати окрему `EditableAboutPage.vue`.

---

## 11. Editor Engine

CMS primitives не керують глобальним процесом редагування самостійно.

Вони передають зміни в централізований Editor Engine.

Flow:

Cms Component  
↓  
Editor Context  
↓  
Editor Engine  
↓  
Draft Manager  
↓  
Repository  
↓  
Backend

Editor Engine відповідає за:

* current draft;  
* dirty state;  
* selected field;  
* hovered field;  
* validation;  
* Undo/Redo;  
* save status;  
* Reset;  
* Publish preparation.

CMS primitives не повинні напряму:

* писати в database;  
* створювати revisions;  
* виконувати Publish;  
* писати Activity;  
* управляти history.

---

## 12. Data Architecture

Database повинна залишатися бізнес-зрозумілою.

Не використовується універсальна таблиця:

entities

для всього контенту.

Нормальна структура:

pages  
products  
blog_posts  
cases  
media  
forms  
languages  
...

Кожна реальна бізнес-сутність має власну структуру.

Не потрібно створювати dynamic database schema builder.

JSON використовується тільки там, де він реально має сенс, наприклад для immutable revision snapshot або специфічних неструктурованих даних.

---

## 13. Business Collections

Business Collection — набір глобальних бізнес-сутностей одного типу.

Наприклад:

Products  
Doctors  
Blog Posts  
Cases  
Events  
Apartments

Користувач може:

* створювати record;  
* редагувати;  
* archive/delete;  
* reorder, якщо це має сенс;  
* publish;  
* керувати перекладами.

Структуру типу визначає розробник.

CMS не дозволяє користувачу створити новий тип:

Products

через Admin.

---

## 14. Local Repeatable Content

Не кожен repeatable array є Business Collection.

Наприклад:

Hero  
└── benefits\[\]

або:

FAQSection  
└── items\[\]

можуть бути частиною контентної моделі конкретної сторінки.

Вони можуть редагуватися через `CmsCollection`:

* Add;  
* Delete;  
* Duplicate;  
* Reorder.

Але не обов'язково отримують окремий глобальний:

Content → Benefits

або:

Content → FAQ

Business Collection створюється тільки тоді, коли дані реально є самостійною бізнес-сутністю.

---

## 15. Repository / Data Layer

Vue-компоненти не повинні працювати напряму з Supabase.

Не рекомендується:

Component  
↓  
supabase.from(...)

Використовується:

Component / Composable  
↓  
Repository  
↓  
Backend Provider

Repository приховує:

* назви таблиць;  
* joins;  
* query implementation;  
* mapping;  
* backend errors;  
* caching;  
* backend-specific API.

Наприклад:

ProductsRepository  
PagesRepository  
MediaRepository  
FormsRepository

але конкретний API Repository залежить від бізнес-сутності.

Не всі repositories повинні реалізовувати однаковий CRUD/Publish interface.

---

## 16. Core Repositories і Client Repositories

CMS Core знає тільки про універсальні CMS domain entities.

Наприклад:

Pages  
Media  
Forms  
Languages  
Activity  
Revisions  
Settings

Client Project реалізує специфічні repositories:

ProductsRepository  
DoctorsRepository  
ApartmentsRepository  
BookingRepository

CMS Core не повинен знати наперед, що в конкретному сайті існують Products або Doctors.

---

## 17. Backend Provider

На першому етапі backend — Supabase.

Використовуються:

PostgreSQL  
Auth  
Storage  
Realtime — лише за необхідності  
Edge Functions / server logic — за необхідності

Але application/domain API не повинен бути жорстко прив'язаний до Supabase SDK.

Сьогодні:

Repository  
↓  
Supabase Implementation

у майбутньому може стати:

Repository  
↓  
NestJS API Implementation

без переписування CMS UI та Edit Mode.

Заміна backend не повинна бути безкоштовною операцією, але архітектурна межа повинна робити її можливою.

---

## 18. Draft / Publish

Контент, для якого потрібна публікація, має чітко розділяти:

Local Editor State  
Saved Draft  
Published Version  
Revision

### Draft

Може бути неповним і містити validation errors.

### Published Version

Є стабільною версією для Public Website.

### Publish

Є окремою бізнес-операцією.

Не є звичайним `update()`.

Flow:

Draft  
↓  
Validation  
↓  
Revision  
↓  
Publish  
↓  
Published Content

Public Runtime ніколи не читає Draft.

---

## 19. Undo/Redo та Revisions

Це дві різні системи.

### Undo / Redo

Працює всередині поточної editor session.

### Revisions

Зберігаються на backend і є immutable historical snapshots.

Revision використовується для:

* History;  
* Restore;  
* Compare;  
* recovery після помилкового Publish.

Restore старої revision створює новий Draft.

Вона не повинна напряму переписувати Published Version.

---

## 20. Concurrent Editing / Content Lock

Для V1 не потрібен Google Docs-style collaborative editing.

Одна content entity одночасно редагується одним користувачем.

Flow:

Open Entity  
↓  
Acquire Lock  
↓  
Edit  
↓  
Heartbeat  
↓  
Exit  
↓  
Release Lock

Другий користувач може бачити locked entity у read-only режимі.

Lock:

* створюється backend;  
* має owner;  
* має expiration;  
* підтримує heartbeat;  
* може бути force-unlocked користувачем із відповідними permissions.

Version/conflict checking може використовуватися як додаткова страховка, але основний concurrency mechanism — Content Lock.

---

## 21. Localization

Мови сайту не hardcode-яться у Client Project.

Активні languages зберігаються в backend.

Owner може:

* додати мову;  
* вимкнути;  
* повторно активувати;  
* змінити default locale.

Нова мова не повинна вимагати:

* migration;  
* нових columns;  
* зміни Vue-коду;  
* deployment.

Основний принцип:

> Перекладаються бізнес-дані, а не структура сторінки.

Для локалізованої entity використовується нормальна модель:

products  
\+  
product_translations

Основна таблиця містить language-independent data.

Translation table містить localized fields.

Наприклад:

Product  
├── price  
├── status  
├── category  
└── media

Product Translation  
├── locale  
├── title  
├── description  
├── slug  
└── SEO

Repository приховує цю структуру від UI.

Frontend працює зі звичайною моделлю:

product.title  
product.description

---

## 22. Media

Media Library є окремим CMS domain.

Контент не повинен напряму зберігати arbitrary Storage URLs для CMS-managed files.

Використовується media reference.

Media Layer відповідає за:

* file metadata;  
* upload;  
* replacement;  
* archive/delete;  
* storage interaction;  
* usage tracking;  
* image information.

Фізичний файл і його використання — різні поняття.

Один Media файл може використовуватися в різних місцях.

Usage-specific metadata, наприклад:

* alt;  
* focal point;  
* caption;

може мати override для конкретного використання або locale.

---

## 23. Forms

Form і Submission є різними сутностями.

Форма може використовуватися в декількох місцях сайту.

Submission зберігається незалежно від конкретної page section.

CMS Core може надавати:

* submissions storage;  
* read/unread;  
* archive;  
* spam status;  
* export;  
* notifications;  
* integrations.

CMS не повинна автоматично ставати універсальним no-code Form Builder.

Структуру конкретної форми може визначати Client Project.

---

## 24. Authentication

Використовується одна authentication system.

На першому етапі:

Supabase Auth

`auth.users` відповідає за identity/authentication.

CMS access є окремим поняттям.

Наприклад:

auth.users  
↓  
cms_users / memberships

Public Website user не отримує CMS access лише тому, що він authenticated.

CMS не має public admin registration.

CMS-користувачі додаються через controlled invitation/setup flow.

---

## 25. Roles / Permissions

Для V1 достатньо простої role → permissions моделі.

Базові ролі:

Owner  
Admin  
Editor

За потребою пізніше можуть бути:

Translator  
SEO Manager  
Reviewer  
Viewer

але їх не потрібно створювати наперед.

UI не є security boundary.

Permissions перевіряються:

UI  
\+  
Repository / Server  
\+  
RLS

---

## 26. Security

Backend не повинен довіряти browser.

Критичні операції перевіряються server-side.

Supabase RLS використовується для database authorization.

Storage також має власні policies.

Secret/service credentials ніколи не потрапляють у browser.

Admin/Edit Mode route protection сама по собі недостатня.

Навіть прямий API request без permissions повинен бути відхилений backend.

---

## 27. Configuration

Конфігурація поділяється на чіткі рівні.

### Core Defaults

Fallback/default configuration усередині `nuxt-cms-core`.

### Project Config

cms.config.ts

Визначається developer.

Наприклад:

* enabled modules;  
* features;  
* project capabilities;  
* registrations;  
* technical behavior.

### Runtime Settings

Зберігаються в backend і змінюються через Admin.

Наприклад:

* site name;  
* languages;  
* navigation;  
* SEO;  
* contacts;  
* social;  
* maintenance mode.

### Infrastructure Environment

Задається через deployment/hosting environment.

Наприклад:

SUPABASE_URL  
SUPABASE_KEY — publishable (anon) key, безпечний для browser лише завдяки RLS  
SUPABASE_SECRET — secret key, тільки server-side, ніколи не потрапляє в browser

Значення, які мають відрізнятися між environments без нового build, задаються через `NUXT_PUBLIC_*` / `NUXT_*` override runtimeConfig.

### Project Manifest

Службова інформація CLI:

CMS version  
schema version  
migration state

Project Config і Project Manifest — різні речі.

---

## 28. Secrets

Потрібно розділяти два типи secrets.

### Infrastructure Secrets

Необхідні для запуску самої системи.

Зберігаються через:

.env  
hosting environment  
deployment secrets

CMS не повинна намагатися через Admin змінювати фундаментальні credentials власного backend connection.

### Runtime Integration Secrets

Наприклад:

* Telegram Token;  
* Stripe Secret;  
* SMTP Password.

Можуть задаватися Owner через захищений System UI, якщо реалізований відповідний secure secrets storage.

Після збереження raw value не повинно повторно відображатися в UI.

---

## 29. Integrations

> Довгострокове бачення. У V1 універсального модуля Integrations немає (`docs/MASTER_PLAN.md` C-97): сторонні сервіси — код Client Project, сповіщення форм — через хук `cms:forms:submitted`, Analytics — окремий епік 013.

CMS features не повинні напряму залежати від Telegram, Stripe або іншого SDK.

Використовується Integration Layer.

Наприклад:

Forms  
↓  
Notification Capability  
↓  
Telegram Provider

або:

Payments  
↓  
Payment Capability  
↓  
Stripe Provider

Не потрібно створювати один giant universal integration interface.

Використовуються невеликі capabilities:

NotificationProvider  
PaymentProvider  
AnalyticsProvider  
WebhookProvider

Core може містити типові providers.

Client Project може додавати project-specific integrations.

Plugin Marketplace або runtime plugin system для V1 не потрібні.

---

## 30. CLI

CMS повинна мати простий CLI.

CLI використовує офіційний Nuxt generator, а не створює Nuxt-проєкт вручну.

Основні сценарії:

nuxt-cms create

створює новий Nuxt-проєкт та підключає CMS.

nuxt-cms add

додає CMS до існуючого проєкту.

nuxt-cms update

допомагає оновити Core та migrations.

nuxt-cms doctor

перевіряє:

* Core version;  
* Nuxt version;  
* schema version;  
* configuration;  
* backend connection.

CLI повинен бути простим, idempotent і не переписувати кастомний Client Project code.

---

## 31. Migrations

Усі database schema changes виконуються через migrations.

Є два незалежні джерела:

Core Migrations  
Project Migrations

Core Migrations належать CMS Core.

Project Migrations належать Client Project.

Production schema не повинна підтримуватися через ручне виконання випадкових SQL-запитів у Dashboard як основний workflow.

CMS Core version та database schema version повинні мати compatibility check.

---

## 32. Versioning / Updates

CMS Core використовує Semantic Versioning.

Major  
Minor  
Patch

Patch:

* fixes.

Minor:

* backward-compatible features;  
* additive migrations (нові таблиці / nullable-колонки), які не ламають існуючі Client Projects.

Major:

* breaking changes;  
* breaking migrations;  
* migration guide.

Кожен Client Project сам вирішує, коли оновлювати Core.

Не потрібно автоматично переводити всі production projects на останню version.

---

## 33. Performance

Public Website є головним performance priority.

Основні правила:

* code splitting;  
* lazy Editor Runtime;  
* lazy heavy libraries;  
* окремі CSS bundles;  
* server-only SDK не потрапляють у browser;  
* page/feature-level data fetching;  
* уникнення N+1;  
* pagination для великих Admin datasets;  
* optimized media;  
* conditional third-party scripts;  
* Tiptap лише для active Rich Text editing.

Після Core updates потрібно контролювати, що Public bundle випадково не почав завантажувати Editor/Admin code.

---

## 34. Testing

Testing Strategy навмисно мінімальна.

Мета — не coverage percentage.

Мета — захист критичної логіки.

У CMS Core тестуються в першу чергу:

* permissions;  
* Draft / Publish;  
* Content Lock;  
* repositories;  
* migrations;  
* critical CMS primitives.

Client Project тестує:

* специфічну critical business logic;  
* calculations;  
* payment flows;  
* custom repositories;  
* важливу validation.

Прості UI components та layout переважно перевіряються вручну.

---

## 35. Deployment

Кожен Client Project є незалежним deployment.

Типова схема:

Client Repository  
↓  
CI  
↓  
Build  
↓  
Preview / Stage  
↓  
Production

Кожен клієнт за замовчуванням має власні:

Nuxt Deployment  
Supabase Project  
Storage  
Secrets  
Domain

CMS Core не має центрального CMS Server.

Він входить у Client Project як npm dependency.

---

## 36. Environments

Базово достатньо:

Local  
Preview / Stage  
Production

Не потрібно створювати складну enterprise environment infrastructure.

Preview/Stage не повинні мати неконтрольований write access до Production database.

Production credentials не використовуються локально без крайньої необхідності.

---

## 37. Backup / Recovery

Потрібно розділяти:

Application Recovery

і:

Infrastructure Recovery

### Application Recovery

Для звичайних помилок:

* Draft;  
* Undo/Redo;  
* Revision;  
* Restore;  
* Archive / Trash.

### Infrastructure Recovery

Для критичних проблем:

* Database backup;  
* Storage backup;  
* Git;  
* environment configuration;  
* stable deployment.

CMS Core не повинна створювати власний database backup engine, якщо backend provider уже вирішує цю задачу.

---

## 38. Що свідомо НЕ будуємо у V1

Без реальної потреби не створюються:

* Page Builder;  
* Plugin Marketplace;  
* universal entity engine;  
* dynamic schema builder;  
* dynamic field builder;  
* workflow engine;  
* Google Docs collaboration;  
* microservices;  
* Redis;  
* Kubernetes;  
* complex queues;  
* central SaaS infrastructure;  
* giant RBAC engine;  
* universal Form Builder;  
* custom deployment platform;  
* власний database backup engine.

Архітектура може дозволяти додати частину цих можливостей у майбутньому, але вони не повинні ускладнювати V1.

---

## 39. Принцип прийняття архітектурних рішень

Перед додаванням нової системи, abstraction або dependency потрібно відповісти на питання:

> Яку реальну проблему вона зараз вирішує?

Якщо проблему можна вирішити простіше — використовується простіше рішення.

Не потрібно будувати abstraction тільки тому, що вона потенційно може знадобитися через декілька років.

При цьому межі відповідальності повинні залишатися достатньо чистими, щоб систему можна було розширити пізніше.

---

## 40. Головні правила системи

1. CMS Core і Client Project є незалежними проєктами.  
2. CMS Core містить універсальну CMS-логіку.  
3. Client Project містить конкретний сайт та його бізнес-логіку.  
4. CMS не є Page Builder.  
5. Структура сторінок зберігається у Vue/Nuxt-коді, а не в database.  
6. CMS редагує контент, а не структуру сайту.  
7. CMS primitives знаходяться в CMS Core.  
8. Client sections знаходяться в Client Project.  
9. Public та Editor Runtime жорстко розділені.  
10. Public Website не завантажує Editor/Admin dependencies.  
11. Vue-компоненти не працюють напряму із Supabase.  
12. Data access проходить через Repository Layer.  
13. Core і Client-specific repositories розділені.  
14. Supabase є першим Backend Provider, але CMS domain API не повинен бути Supabase-specific.  
15. Database має зрозумілу бізнес-структуру.  
16. Не використовується universal entity table для всього.  
17. Business Collections і local repeatable content — різні поняття.  
18. Draft та Published content завжди розділені.  
19. Public Website читає тільки Published content.  
20. Publish є окремою бізнес-операцією.  
21. Undo/Redo і Revisions — різні системи.  
22. Одну entity одночасно редагує один користувач.  
23. Localization працює на рівні бізнес-даних.  
24. Нові мови не потребують migration або deployment.  
25. Media є окремим domain і використовується через references.  
26. Authentication та CMS Authorization — різні поняття.  
27. Public user не отримує CMS access автоматично.  
28. Permissions перевіряються не тільки UI, але й backend/RLS.  
29. Infrastructure secrets і runtime integration secrets розділені.  
30. External services працюють через Integration Layer.  
31. Core Migrations і Project Migrations розділені.  
32. CMS Core оновлюється через версії npm package.  
33. Client Projects оновлюються незалежно один від одного.  
34. Performance Public Website має вищий пріоритет за зручність внутрішньої реалізації CMS.  
35. Тестується критична логіка, а не кожна UI-деталь.  
36. Кожен Client Project має незалежну infrastructure.  
37. Не створюється central multi-client CMS backend.  
38. Система повинна залишатися зрозумілою одному розробнику.  
39. Не створювати abstraction без реальної задачі.  
40. Найпростіше стабільне рішення має пріоритет над overengineering.

---

## Ключовий архітектурний принцип

> **CMS Core — це універсальний набір інструментів для керування даними та редагування контенту в Nuxt-проєкті, а не framework для побудови самого сайту.**

Розробник продовжує створювати звичайний Nuxt-сайт: сторінки, компоненти, layout, бізнес-логіку та дизайн.

CMS Core додає до цього сайту готову інфраструктуру:

Admin  
Edit Mode  
Auth  
Permissions  
Data Layer  
Draft / Publish  
Revisions  
Media  
Forms  
Localization  
Integrations  
Configuration

не змушуючи Client Project будувати сайт відповідно до внутрішньої структури CMS.

Саме ця межа повинна залишатися незмінною при подальшому розвитку системи.

# Дизайн-ТЗ — Адмін-панель сайту

> Home / About / Services / Contact, 5 форм, Products / Cases / Blog posts, 8 інтеграцій тощо — приклади конкретного UI-макету, а не hardcoded архітектурні обмеження CMS Core. Розбіжності макету з архітектурою зібрані в `docs/MASTER_PLAN.md` → «Дизайн-ТЗ ↔ архітектура».
## Загальний опис
Веб-застосунок для управління сайтом. Складається з адмін-панелі (CMS) та публічної сторінки сайту. Адмін-панель має бічну навігацію та 8 основних розділів. Публічна сторінка відкривається в режимі редагування прямо з адмінки.

## Навігація (сайдбар)
Постійно видима бічна панель. Містить:

Логотип / назва сайту  
Dashboard — головна  
Група Content: Pages, Media, Forms  
Група Website: Analytics, Activity, Integrations  
Settings — внизу окремо  
Активний пункт підсвічується.

## 1. Dashboard
Головна сторінка адмінки. Дає швидкий огляд стану сайту.

Банер статусу — показує чи сайт опублікований, з кнопками "Edit website" і "View site".

4 лічильники: Відвідувачі сьогодні, Непрочитані форми, Використання сховища, SEO попередження.

Швидкі дії: Edit website, Create page, Upload media, View forms.

Здоров'я сайту — 5 перевірок зі статусом ОК / проблема:

Сайт опублікований  
Форми працюють  
Аналітика підключена  
SEO попередження  
Статус інтеграцій  
Активні мови — перелік мов сайту з кнопкою додати.

Сторінки — коротка таблиця із 4 основними сторінками, їх статусом і SEO.

Останні форми — 3 останні відправки з лічильником непрочитаних.

Остання активність — 5 останніх дій із можливістю відновити (Restore).

## 2. Pages (Сторінки)
Розділений на два блоки.

Статичні сторінки  
Таблиця із сторінками: Home, About, Services, Contact. Колонки: назва / slug, статус (Published / Draft / Hidden), SEO, мови, дата оновлення. Пошук і фільтр за статусом. Дії на кожній сторінці: Edit, View, Settings, SEO, History, Publish/Hide.

Типи контенту (колекції)  
Products, Cases, Blog posts — з кількістю записів і датою оновлення. Кнопка "Manage" відкриває менеджер конкретної колекції.

## 3. Products / Cases / Blog posts (Менеджер колекцій)
Однаковий інтерфейс для всіх трьох типів.

Таблиця записів. На кожному записі:

Назва  
Статус: Active / Hidden (перемикач)  
SEO-індикатор  
Кнопки Edit і Delete  
При видаленні — підтверджуючий модал з назвою запису.

## 4. Media (Медіатека)
Бібліотека файлів сайту.

Пошук по імені. Фільтр за типом: All / Images / SVG / Documents / Videos. Сортування: Newest, Oldest, Name, Size.

Відображення: сітка карток із мініатюрами. На кожній картці: ім'я, розмір, де використовується, попередження якщо файл ніде не використовується.

При кліку на файл — модал:

Превью зображення  
Ім'я файлу (можна редагувати)  
Тип і розмір  
Список де використовується  
Кнопка Copy URL  
Кнопки Replace і Delete  
При Replace — модал вибору: з медіатеки або завантажити новий.

При Upload — зона drag & drop. Формати: JPG, PNG, WebP, максимум 5MB.

## 5. Forms (Форми)
Список форм  
5 форм: Contact Form, Quote Request, Book a Call, Newsletter, Event Registration.

Таблиця: назва, статус (Active / Disabled), кількість відправок, кількість непрочитаних, час останньої відправки, на яких сторінках використовується.

Дії: View submissions, Mark all as read, Export, Notification settings, Enable/Disable, View locations.

Відправки (Submissions)  
При відкритті форми — список відправок.

Фільтри: All, Unread, Read, Archived, Spam.

Таблиця: ім'я, email, послуга, уривок повідомлення, дата, статус.

При кліку на відправку — модал з повними даними: ім'я, email, телефон, послуга, повідомлення, дата.

## 6. Analytics
Непідключений стан  
Пропозиція підключити Google Analytics, перелік переваг, кнопка Connect.

Підключений стан  
Рядок статусу підключення з часом останньої синхронізації  
Вибір діапазону дат: Last 7 / 30 / 90 days, This year  
Кнопка "Open in GA"  
4 метрики: Visitors, Sessions, Page views, Form submissions — з % зміною відносно попереднього періоду  
Графік відвідувачів по днях (лінійний)  
Топ сторінок по переглядах (таблиця)  
Джерела трафіку (кругова діаграма): Direct, Search, Social  
Пристрої: Desktop, Mobile, Tablet (прогрес-бари з %)  
Топ країни (список)  
## 7. Activity (Журнал активності)
Хронологічний лог усіх дій в системі.

Фільтри: All, Content, Pages, Media, Settings, Forms, Publishing.

Записи згруповані по датах: Today, Yesterday, Earlier this week.

Кожен запис: аватар користувача, хто зробив, що зробив (updated / deleted / published / etc.), який об'єкт, на якій сторінці, коли.

Якщо дія відновлювана — кнопка Restore. При кліку — модал з порівнянням: попереднє значення vs поточне, кнопка підтвердження відновлення.

## 8. Integrations
> Поза V1 (`docs/MASTER_PLAN.md` C-97): розділу Integrations в адмінці немає. Analytics (§6) — окремий епік 013.

8 інтеграцій у 4 категоріях.

Communication: Telegram, WhatsApp  
Analytics: Google Analytics, Google Tag Manager  
Email: Email notifications  
Payments: LiqPay, Stripe, WayForPay

Кожна інтеграція має статус:

Connected — кнопка Configure  
Not connected — кнопка Connect  
Needs attention — кнопка Fix (якщо щось не так з конфігурацією)  
Coming later — без кнопки  
Якщо є помилки — червоний банер зверху з кількістю проблем.

Configure / Connect / Fix — відкриває модал з полями специфічними для кожної інтеграції (API ключі, токени, email-адреси тощо). Кнопки Save / Cancel.

## 9. Settings
Ліва навігація по розділах, права — форма. Кнопка "Save changes".

General — назва сайту, URL, контактний email, телефон, адреса.

Brand — логотип, фавіконка, основний колір (color picker \+ hex).

Navigation — список пунктів меню (редагувати), текст і посилання CTA-кнопки.

SEO — глобальний мета-заголовок, мета-опис, OG-зображення, Google Analytics ID, Google Search Console verification.

Languages — увімкнення мультимовності, мова за замовчуванням, перелік активних мов з чекбоксами.

Social — посилання на Instagram, Facebook, LinkedIn, Twitter/X, YouTube.

Advanced — дозволити індексацію (robots toggle), режим обслуговування (maintenance mode toggle), кастомні скрипти в \<head\> і \<body\>.

## 10. Edit Mode (Редагування сторінки)
Режим редагування публічної сторінки сайту. Відкривається з Dashboard або Pages → Edit.

Тулбар (верхня панель)  
Кнопка виходу — якщо є незбережені зміни, показує модал підтвердження (Leave without saving / Save and exit / Cancel)  
Undo / Redo (також Cmd+Z / Cmd+Shift+Z)  
Назва поточної сторінки  
Індикатор стану збереження: Unsaved / Saving… / Saved  
Перемикач мов (EN / UA / DE)  
Кнопка Preview — перемикає між режимом редагування і превью  
Кнопка "Save Draft"  
Кнопка "Publish" — з'являється тільки коли є збережений чернетка  
Редагування тексту  
Кожен текстовий блок редагується прямо на сторінці (inline).

При виділенні тексту — з'являється тулбар форматування:

Bold, Italic  
Link — відкриває попап: тип посилання (External / Internal / Email / Phone / Section), URL / адреса, чекбокс "відкрити в новій вкладці"  
Color — палітра з 7 кольорів: Default, Primary, Accent, Muted, Success, Warning, Error  
Clear formatting  
Під кожним текстовим полем — лічильник символів. При наближенні до ліміту — попередження (м'який ліміт), при перевищенні — помилка (жорсткий ліміт).

Обов'язкові поля (наприклад, заголовок, логотип, CTA-заголовок) позначені. Якщо обов'язкове поле порожнє — кнопка Publish заблокована, у тулбарі — попередження з переліком проблем.

Опціональні поля можна приховати / показати кнопкою.

Кожне поле можна скинути до опублікованої версії кнопкою Reset.

Редагування зображень  
Клік на зображення — відкриває панель:

Alt текст  
Focal point (точка фокусу: клік вибирає координати на мініатюрі зображення)  
Чекбокс "Decorative" (тоді alt не потрібен)  
Колекції на сторінці  
Блоки з повторюваними елементами (наприклад, список послуг, відгуки):

Кожен елемент можна редагувати, дублювати, видаляти  
Є кнопка "Add item"  
Undo / Redo  
Повна історія змін. Undo скасовує останню дію, Redo повертає.

Журнал змін (History)  
Кнопка в тулбарі відкриває список останніх 10 змін: що змінено, коли.

Публікація  
Спочатку "Save Draft" — зберігає чернетку  
Потім "Publish" — публікує на сайт  
## Модальні вікна (загально)
Всі модали закриваються кнопкою X або кліком на фон. Мають дві кнопки: скасувати (Cancel) і підтвердити (назва дії). Деструктивні дії (Delete, Leave without saving) виділені червоним.

---

# CMS Core — Technical Foundation (v1)

> Ранній foundation-опис. Там, де він розходиться з Architecture Summary або канонічними рішеннями `docs/MASTER_PLAN.md`, діють вони.

## Загальна ідея

Проєкт складається з двох незалежних частин:

1. **CMS Core** — універсальне ядро CMS.  
2. **Client Project** — конкретний Nuxt-проєкт із сайтом клієнта.

CMS Core є незалежним продуктом, який може підключатися до будь-якого Nuxt-проєкту.

Client Project містить лише унікальний сайт клієнта, його дизайн, бізнес-логіку та контент.

---

## Основний стек

### Frontend

* Nuxt 4  
* Vue 3  
* TypeScript  
* CSS Variables + scoped CSS (без Tailwind і SCSS у Core)  
* VueUse  
* Pinia (лише разом з Editor Engine)

### Editor

* TipTap (тільки для Rich Text)

### Backend

* Supabase  
  * PostgreSQL  
  * Auth  
  * Storage  
  * Realtime (за потребою)  
  * Edge Functions (коли знадобляться)

### Тестування

* Vitest  
* Nuxt Test Utils

E2E-тести (Playwright / Cypress) не використовуються за замовчуванням — лише для окремих критичних сценаріїв, якщо з'явиться реальна потреба.

---

## Архітектура

Система розділяється на два незалежні проєкти.

CMS Core  
↓

будь-який Nuxt Project

CMS Core не містить конкретного сайту.

Client Project не дублює універсальну CMS-логіку. Він може містити project-specific repositories, configuration, registrations та business integrations, що використовують public API CMS Core.

---

## CMS Core

CMS Core є окремим публічним npm-пакетом.

Наприклад:

nuxt-cms-core

Він містить:

* Admin Panel  
* Edit Mode  
* Base UI Kit  
* Editable Components  
* Stores  
* Composables  
* Middleware  
* Layouts  
* Pages (/admin)  
* Auth  
* Permissions  
* Supabase repositories  
* Base migrations  
* Shared types  
* Utilities

CMS Core не містить:

* дизайн клієнта;  
* Hero;  
* Footer;  
* Products;  
* бізнес-логіку;  
* контент.

---

## Client Project

Клієнтський проєкт містить:

* дизайн;  
* компоненти сайту;  
* сторінки;  
* SEO;  
* бізнес-логіку;  
* кастомні таблиці;  
* кастомні інтеграції;  
* контент.

---

## Editable Components

Весь механізм Edit Mode знаходиться в CMS Core.

Наприклад:

* CmsText  
* CmsRichText  
* CmsImage  
* CmsButton  
* CmsLink  
* CmsCollection  
* CmsOptional

Клієнтський сайт лише використовує ці компоненти.

---

## Створення нового проекту

Основний сценарій роботи.

npx nuxt-cms create my-project

Команда:

* створює Nuxt-проєкт через офіційний `nuxi`;  
* встановлює `nuxt-cms-core`;  
* підключає Nuxt Layer;  
* створює базову структуру;  
* створює `cms.config.ts`;  
* створює `.env.example`;  
* створює структуру Supabase;  
* копіює базові міграції;  
* додає необхідні scripts.

Після цього проєкт готовий до розробки.

---

## Підключення CMS до існуючого проекту

Другий сценарій.

npx nuxt-cms add

Команда:

* перевіряє Nuxt-проєкт;  
* встановлює CMS Core;  
* підключає Layer;  
* додає конфігурацію;  
* додає міграції;  
* додає scripts.

---

## Оновлення CMS

CMS оновлюється незалежно від проекту.

npm install nuxt-cms-core@latest

Після цього

npx nuxt-cms update

Команда:

* перевіряє версії;  
* копіює нові Core migrations;  
* оновлює службові файли;  
* генерує типи;  
* перевіряє сумісність.

---

## Міграції

Всі зміни структури бази виконуються через міграції.

Не використовувати SQL Editor як основний спосіб зміни структури.

Core містить:

* базові міграції CMS.

Client Project містить:

* власні міграції проекту.

При оновленні CMS нові Core migrations не застосовуються автоматично: `nuxt-cms update` допомагає їх підготувати, а Client Project сам вирішує, коли їх застосувати.

> ⚠ Відкрите рішення — модель міграцій (Supabase CLI має одну лінійну історію міграцій, тому «два незалежні джерела» потребують явного механізму) і де зберігається schema version. Див. `docs/MASTER_PLAN.md`, реєстр відкритих рішень (епік 016).

---

## Конфігурація

Конфігурація поділяється на рівні (повна модель — Architecture Summary §27: Core Defaults, Project Config, Runtime Settings, Infrastructure Environment, Project Manifest).

### 1. Environment

.env / hosting environment

Містить infrastructure secrets, без яких CMS не стартує.

Наприклад:

* Supabase URL і publishable key  
* Supabase secret key (server-only)

Owner-managed integration secrets (Telegram, SMTP, Stripe тощо) — окремий secure secrets layer, не `.env` і не звичайні runtime settings (Summary §28).

---

### 2. Build Config

cms.config.ts

Містить конфігурацію розробника.

Наприклад:

* які модулі підтримуються;  
* які feature flags увімкнені;  
* технічні ліміти й поведінка.

Адміністратор це не змінює.

`cms.config.ts` містить лише серіалізовані значення: він вбудовується в `#cms/config` і потрапляє в client bundle. Реєстрації з функціями або repositories (колекції, integrations, forms) виконуються runtime-кодом Client Project, а не в `cms.config.ts`.

---

### 3. Runtime Config

Зберігається у Supabase.

Наприклад:

* назва сайту;  
* логотип;  
* SEO;  
* Languages;  
* Navigation;  
* Social;  
* Maintenance Mode;  
* Brand (логотип, favicon, основний колір — механізм передачі кольору в CSS Client Project ще не визначений).

Ці налаштування змінюються через адмінку.

---

### 4. Project Manifest

.cms/project.json

Службова інформація.

Наприклад:

* версія CMS;  
* schema version;  
* migration state.

Manifest — службовий файл CLI. Фактичний стан схеми конкретного environment визначає сама база даних, а не файл у Git.

---

## Мови

Список мов не задається у коді.

Він повністю зберігається у Supabase.

Owner може:

* додавати мови;  
* вимикати;  
* повторно активувати;  
* змінювати default language.

Додавання нової мови не потребує нової міграції. Мови не видаляються фізично — лише вимикаються.

---

## Структура даних

Окремі сутності повинні мати окремі таблиці.

Наприклад:

* languages  
* navigation_items  
* integrations  
* media  
* pages

Таблиці з'являються разом з епіком, якому вони потрібні, а не наперед. Translation-таблиці (`*_translations`) — разом з Localization (Блок 9).

Не використовувати один великий JSON для всіх налаштувань.

---

## Розробка

Основний процес.

1. Створити новий проект.  
2. Почати розробку сайту.  
3. При необхідності додавати функції в CMS Core.  
4. Випустити нову версію Core.  
5. Оновити потрібні проекти.

---

## Основні принципи

1. CMS Core повністю незалежний від конкретного сайту.  
2. Client Project не дублює універсальну CMS-логіку, але може містити project-specific wiring (repositories, registrations, integrations).  
3. Весь Edit Mode знаходиться у CMS Core.  
4. Всі універсальні компоненти знаходяться у CMS Core.  
5. Весь дизайн знаходиться у Client Project.  
6. Всі зміни структури бази виконуються лише через міграції.  
7. Runtime-конфігурація зберігається у Supabase.  
8. Build-конфігурація зберігається у `cms.config.ts`.  
9. Infrastructure secrets зберігаються лише в `.env` / hosting environment; owner-managed integration secrets — в окремому secure secrets layer.  
10. Кожен клієнт має власний Supabase-проєкт.  
11. CMS Core оновлюється незалежно від клієнтських сайтів.  
12. Створення нового проекту повинно виконуватися однією командою.

# Database Architecture (v1)

> Ранній опис бази даних. Там, де він розходиться з Architecture Summary (§12–§16, §18–§22) або канонічними рішеннями `docs/MASTER_PLAN.md`, діють вони.

## Загальна ідея

База даних повинна бути максимально простою для розуміння та масштабування.

Кожна бізнес-сутність має власну таблицю. Не використовується універсальна `entities` таблиця.

Наприклад:

* Pages  
* Products  
* Blog Posts  
* Cases  
* Services  
* Forms  
* Media  
* Languages

Кожен тип даних має власну модель і власний Repository.

Core repositories (Pages, Media, Forms, Languages, Settings, Activity, Revisions, Users) належать CMS Core. Repositories бізнес-сутностей (Products, Doctors, Apartments тощо) належать Client Project — CMS Core не знає наперед, що вони існують.

Універсальність реалізується не через структуру бази даних, а через Data Layer.

---

## Repository Pattern

CMS Core не працює безпосередньо з таблицями.

Кожен тип контенту має власний Repository.

Наприклад:

* PagesRepository (Core)  
* MediaRepository (Core)  
* ProductsRepository (Client Project)  
* BlogRepository (Client Project)

Конкретний Repository має тільки ті операції, які мають сенс для його бізнес-сутності. Для Products один API, для Activity інший, для Languages інший. Не всі repositories реалізують однаковий CRUD / Publish / Draft / History interface.

---

## Pages

Pages є окремою сутністю.

Вони не входять до універсальної системи Collection.

Page представляє routable content entity. Структура та секції сторінки визначаються Client Project у Vue/Nuxt-коді й не зберігаються CMS як component tree.

Page — одна із сутностей, що можуть редагуватися через Edit Mode (Product / Case / Blog Post теж можуть редагуватися через свої template pages).

> ⚠ Відкрите рішення — як фізично зберігаються значення полів сторінки (storage model), де живе Draft і як code-defined сторінка отримує запис у `pages`. Див. `docs/MASTER_PLAN.md`, реєстр відкритих рішень (епік 005).

---

## Collections

Business Collection — набір самостійних глобальних бізнес-сутностей одного типу.

Наприклад:

* Products  
* Blog  
* Cases  
* Doctors

Кожен тип Collection має власну таблицю і власний Repository у Client Project. CMS Core дає універсальні Admin-інструменти для роботи з ними.

Не кожен repeatable array є Business Collection. FAQ, Hero `benefits[]`, gallery тощо можуть бути локальним repeatable контентом сторінки, який редагується через `CmsCollection` і не отримує окремої таблиці чи розділу в Admin. Business Collection створюється тільки тоді, коли дані реально є самостійною бізнес-сутністю.

Це дозволяє додавати нові типи контенту без зміни CMS Core.

---

## Languages

Мови не визначаються у коді.

Вони повністю зберігаються у базі даних.

Owner може:

* додавати;  
* вимикати;  
* повторно активувати;  
* змінювати мову за замовчуванням.

Усі переклади працюють через окремі translation-таблиці.

Наприклад:

* page_translations;  
* product_translations;  
* blog_translations.

Основні таблиці містять лише мовонезалежні дані.

---

## Media

Media є окремим модулем CMS.

Будь-який контент не зберігає фізичні файли.

Він посилається лише на записи Media Library.

Media відповідає за:

* зберігання;  
* перейменування;  
* заміну;  
* використання;  
* default ALT;  
* default Focal Point.

Media має default metadata, а конкретне використання (`CmsImage`) може мати override, зокрема по мовах.

Media повинна знати, де використовується кожен файл.

Це дозволяє безпечно видаляти або замінювати ресурси.

---

## Forms

Forms складаються з двох незалежних частин.

Перша описує саму форму.

Друга містить усі отримані заявки.

Форма існує незалежно від сторінки.

Одна форма може використовуватися одночасно на кількох сторінках.

---

## Activity

Усі дії користувачів записуються в Activity Log.

Activity не містить бізнес-логіку.

Вона лише фіксує:

* хто;  
* коли;  
* що зробив;  
* над яким об'єктом.

Activity використовується Dashboard та журналом активності.

---

## History / Revisions

Будь-який контент, який підтримує редагування, може мати історію змін.

Історія не прив'язується лише до Pages.

Вона повинна працювати однаково для будь-якого типу контенту.

Наприклад:

* сторінок;  
* продуктів;  
* статей.

Revisions потрібні лише сутностям із Draft / Publish workflow. Чи мають ревізії налаштування — визначається окремо.

Server-side History (Revisions) використовується для:

* Restore;  
* перегляду змін;  
* порівняння версій.

Undo / Redo — окрема локальна система всередині editor session, не server History.

---

## Settings

Глобальні налаштування сайту зберігаються окремо від контенту.

Наприклад:

* назва;  
* логотип;  
* SEO;  
* соціальні мережі;  
* контактні дані;  
* Maintenance Mode;  
* тема.

Settings не повинні містити складні бізнес-сутності.

---

## Integrations

Інтеграції є незалежним модулем.

Кожна інтеграція має власний стан.

Наприклад:

* Connected;  
* Not Connected;  
* Needs Attention;  
* Disabled.

(Повна модель станів — Блок 15.)

Конфігурація інтеграцій не повинна змішуватися із загальними налаштуваннями сайту.

---

## Draft / Publish

Контент підтримує два основних стани.

Чернетка.

Опублікована версія.

Публікація ніколи не повинна змінювати опубліковану версію без явної дії користувача.

Edit Mode працює лише з Draft.

Після Publish Draft стає новою Published Version.

---

## Relationships

База повинна використовувати нормальні SQL-зв'язки.

Не допускається зберігання великих JSON-структур замість окремих таблиць для самостійних бізнес-сутностей.

JSON використовується лише там, де він реально має сенс: immutable revision snapshot або дані без фіксованої структури (Summary §12). Чи використовується JSON для значень полів сторінки — відкрите рішення епіку 005.

---

## Soft Delete

Основні бізнес-сутності не повинні фізично видалятися одразу.

Видалення повинно підтримувати можливість відновлення.

Фізичне видалення виконується лише окремими службовими процесами або вручну.

---

## Data Layer

Уся взаємодія CMS із базою відбувається тільки через Repository.

Компоненти Vue не повинні напряму працювати із Supabase.

Будь-які запити проходять через Data Layer.

Це дозволяє:

* легко тестувати систему;  
* змінити бекенд у майбутньому;  
* централізувати кешування;  
* централізувати права доступу.

---

## Основний принцип

Структура бази даних повинна бути зрозумілою навіть без документації.

Відкривши Supabase через рік, розробник має одразу побачити знайомі бізнес-сутності (`pages`, `products`, `media`, `forms`, `languages`), а не універсальні абстракції, які потребують додаткового аналізу.

При цьому повторне використання логіки досягається не через складну структуру таблиць, а через архітектуру CMS Core (Repository Pattern, Data Layer та спільні сервіси).

---

## Правило нової сутності

> **Будь-яка нова функція CMS повинна спочатку запитати себе: це нова бізнес-сутність чи просто нова властивість існуючої?**

Наприклад:

* "Authors" → окрема сутність.  
* "Categories" → окрема сутність.  
* "SEO Score" → властивість сторінки.  
* "Featured Image" → посилання на `media`.

Якщо постійно дотримуватись цього правила, база даних залишиться чистою і не почне розростатися хаотично.

# Блок 3. Архітектура Edit Mode

## 1. Загальний опис

Edit Mode — це основна функціональна частина CMS Core, яка дозволяє адміністратору або редактору змінювати контент безпосередньо на публічній сторінці сайту.

Користувач повинен бачити майже той самий сайт, який бачить звичайний відвідувач, але з можливістю:

* редагувати текст безпосередньо на сторінці;  
* замінювати зображення;  
* змінювати кнопки та посилання;  
* керувати повторюваними елементами;  
* перемикати мови;  
* зберігати чернетки;  
* переглядати зміни;  
* публікувати нову версію сайту;  
* скасовувати та повертати локальні зміни.

Edit Mode не є окремим конструктором сторінок і не повинен виглядати як WordPress-подібна форма з великою кількістю полів.

Основний принцип:

> Користувач редагує готовий сайт безпосередньо в тому вигляді, у якому він буде опублікований.

Edit Mode повинен залишатися частиною того самого Nuxt-застосунку, але завантажуватися окремо від публічного режиму.

---

## 2. Основні режими застосунку

CMS повинна розрізняти щонайменше три режими відображення.

### Public Mode

Звичайний публічний сайт для відвідувачів.

У цьому режимі:

* немає редакторських панелей;  
* немає hover-контролів;  
* немає Undo/Redo;  
* не завантажується Tiptap;  
* не завантажується Editor Store;  
* не завантажуються стилі адмінки та Edit Mode;  
* CMS-компоненти працюють лише як легкі компоненти відображення.

### Edit Mode

Захищений режим для авторизованого користувача.

У цьому режимі:

* доступне inline-редагування;  
* активний Editor Engine;  
* доступні hover, selection та editing states;  
* завантажуються редакторські компоненти;  
* працює Draft Manager;  
* працює Undo/Redo;  
* доступні Save Draft, Preview та Publish;  
* підключаються Editor CSS і редакторські залежності.

### Preview Mode

Режим перегляду поточної чернетки без редакторських контролів.

У цьому режимі:

* відображається draft-версія;  
* не показуються hover-контроли;  
* не можна редагувати поля;  
* сторінка повинна виглядати максимально близько до майбутньої опублікованої версії.

---

## 3. Розділення Public Runtime та Editor Runtime

CMS Core повинен бути розділений на дві принципово різні частини.

### Public Render Runtime

Легка частина, яка використовується на кожному сайті.

До неї входять:

* `CmsText`;  
* `CmsRichTextRenderer`;  
* `CmsImage`;  
* `CmsButton`;  
* `CmsLink`;  
* базові типи;  
* render helpers;  
* мінімальні технічні стилі.

Public Runtime не повинен залежати від Editor Runtime.

Він не повинен імпортувати:

* Tiptap;  
* ProseMirror;  
* Editor Store;  
* Toolbar Manager;  
* History Manager;  
* Media Picker;  
* редакторські модальні вікна;  
* адмінські компоненти.

### Editor Runtime

Окрема важча частина CMS Core.

До неї входять:

* Editor Shell;  
* Editor Store;  
* Selection Manager;  
* Hover Manager;  
* Toolbar Manager;  
* Draft Manager;  
* History Manager;  
* Validation Engine;  
* Publish Engine;  
* Media Picker;  
* Inline Text Editor;  
* Rich Text Editor;  
* редакторські стилі;  
* редакторські hotkeys.

Editor Runtime повинен завантажуватися через dynamic import лише після входу в Edit Mode.

Основне правило залежностей:

Public Runtime не імпортує Editor Runtime.

Editor Runtime може використовувати Public Runtime.

Admin Runtime може використовувати Public Runtime.

---

## 4. Маршрутизація Edit Mode

Edit Mode відкривається через окремий захищений маршрут під `/admin/edit`.

Приклад:

/about

Публічна сторінка.

/admin/edit/about

Та сама сторінка в Edit Mode.

> ⚠ Відкрите рішення — як `/admin/edit/[...path]` рендерить page-компонент і layout Client Project та обходить SSR-кеш. Див. `docs/MASTER_PLAN.md`, реєстр відкритих рішень (епік 008).

Обидва маршрути повинні використовувати один і той самий контентний компонент сторінки.

Наприклад:

AboutPageContent.vue

Публічний маршрут:

\<AboutPageContent :content="publishedContent" /\>

Edit Mode:

\<EditorShell\>  
  \<AboutPageContent :content="draftContent" /\>  
\</EditorShell\>

Не повинно існувати двох окремих реалізацій:

AboutPage.vue  
EditableAboutPage.vue

Це створило б дублювання дизайну та поведінки.

Окремий маршрут потрібен не лише для безпеки, а й для чіткого розділення JavaScript bundle.

---

## 5. CMS primitives

Клієнтські сайти повинні будувати editable-контент через базові CMS-компоненти з CMS Core.

Основні primitives:

CmsText  
CmsRichText  
CmsImage  
CmsButton  
CmsLink  
CmsCollection  
CmsOptional

Ці компоненти повинні використовуватися всередині унікальних клієнтських секцій.

Наприклад:

\<section class="hero"\>  
  \<CmsText  
    v-model="content.eyebrow"  
    field-key="hero.eyebrow"  
    tag="span"  
    :max-length="40"  
  /\>

  \<CmsRichText  
    v-model="content.title"  
    field-key="hero.title"  
    tag="h1"  
    required  
    :max-length="100"  
  /\>

  \<CmsImage  
    v-model="content.image"  
    field-key="hero.image"  
    required  
  /\>

  \<CmsButton  
    v-model="content.cta"  
    field-key="hero.cta"  
  /\>  
\</section\>

У цьому прикладі:

* логіка редагування належить CMS Core;  
* Hero-секція належить клієнтському проєкту;  
* стилі належать клієнтському проєкту;  
* контент зберігається в Supabase;  
* редакторський стан контролює Editor Engine.

---

## 6. Межа між CMS Core і клієнтськими компонентами

CMS Core повинен містити базові CMS primitives, але не повинен містити конкретний дизайн сайтів.

У CMS Core входять:

CmsText  
CmsRichText  
CmsImage  
CmsButton  
CmsLink  
CmsCollection

У CMS Core не входять:

HeroSection  
PricingSection  
DentistCard  
ApartmentCalculator  
RestaurantMenu  
ProductHero  
DoctorCard

Клієнтські секції визначають:

* композицію;  
* дизайн;  
* адаптивність;  
* конкретний набір полів;  
* порядок елементів.

CMS primitives визначають:

* поведінку в Public Mode;  
* поведінку в Edit Mode;  
* реєстрацію поля;  
* validation;  
* Reset;  
* hover;  
* selection;  
* передачу змін в Editor Engine.

---

## 7. Editor Context

Не слід передавати `isEditMode` через props у кожен компонент.

Не рекомендується:

\<CmsText :is-edit-mode="isEditMode" /\>

Edit Mode повинен працювати через глобальний Editor Context.

На рівні `EditorShell` створюється context через `provide`.

CMS-компоненти отримують його через `inject`.

У Public Mode Editor Context відсутній.

Умовно:

const editorContext = inject(CMS_EDITOR_CONTEXT, null)

Якщо context відсутній:

CmsText → звичайний renderer.

Якщо context активний:

CmsText → editable behavior.

Pinia може використовуватися для глобального стану Edit Mode, але CMS primitives не повинні напряму залежати від конкретної реалізації store.

Рекомендована модель:

Pinia  
→ зберігає глобальний стан editor session.

provide/inject  
→ надає CMS-компонентам стабільний Editor API.

---

## 8. Editor Engine

Editor Engine є центральною системою Edit Mode.

Компоненти не повинні самостійно:

* зберігати дані в Supabase;  
* публікувати контент;  
* створювати revisions;  
* писати Activity Log;  
* керувати Undo/Redo.

Компонент повинен лише повідомляти Editor Engine про подію.

Приклад:

editor.updateField({  
  fieldKey: 'hero.title',  
  value: newValue  
})

Далі Editor Engine:

1. оновлює локальний draft;  
2. позначає сторінку як змінену;  
3. додає команду в Undo/Redo;  
4. запускає validation;  
5. оновлює save status;  
6. за необхідності передає draft у Repository.

Архітектурний потік:

Cms component  
    ↓  
Editor Engine  
    ↓  
Draft Manager  
    ↓  
Repository  
    ↓  
Supabase

---

## 9. Стабільна адреса поля

Кожне editable-поле повинно мати стабільний `fieldKey`.

Наприклад:

hero.title  
hero.description  
hero.image  
services.items.123.title  
services.items.123.image

`fieldKey` використовується для:

* selection;  
* validation;  
* Undo/Redo;  
* Reset;  
* порівняння draft і published;  
* локалізації;  
* відображення помилок;  
* History;  
* Activity.

`v-model` та `fieldKey` виконують різні завдання.

`v-model` відповідає за Vue-значення.

`fieldKey` є системною адресою поля для Editor Engine.

---

## 10. Основні стани editable-компонента

Кожен CMS-компонент повинен підтримувати єдину модель станів.

### Normal

Edit Mode відкритий, але поле не активне.

Компонент виглядає як звичайний елемент сайту.

### Hover

Користувач навів курсор.

Показується невеликий contextual chip, наприклад:

Text  
Image  
Button  
Collection

Не повинні постійно показуватися рамки навколо всіх елементів.

### Selected

Користувач вибрав поле.

Editor Engine фіксує `selectedFieldKey`.

Для поля показуються актуальні contextual controls.

### Editing

Користувач безпосередньо змінює значення.

Наприклад:

* вводить текст;  
* форматує rich text;  
* вибирає зображення;  
* змінює URL кнопки;  
* редагує елемент колекції.

Тільки Editor Engine повинен зберігати глобальну інформацію про hovered та selected element.

---

## 11. Selection і Hover Manager

Не слід створювати окремий незалежний `hover` та `selected` state всередині кожного CMS-компонента.

Глобально повинні існувати:

hoveredFieldKey  
selectedFieldKey  
editingFieldKey

Компонент лише перевіряє:

const isSelected =  
  editor.selectedFieldKey === props.fieldKey

Це дозволяє:

* уникнути кількох одночасно активних toolbar;  
* централізовано закривати selection;  
* працювати з ESC;  
* контролювати nested components;  
* уникати конфліктів між Image і Collection.

---

## 12. Toolbar Manager

Не потрібно, щоб кожен компонент сам рендерив повну панель інструментів.

Повинен існувати централізований Toolbar Manager.

Він отримує інформацію про selected field:

type: text  
type: richText  
type: image  
type: button  
type: collection

Після цього показує відповідні інструменти.

Для Rich Text:

* Bold;  
* Italic;  
* Link;  
* Color;  
* Clear formatting.

Для Image:

* Replace;  
* Media Library;  
* Alt;  
* Decorative;  
* Focal Point.

Для Button:

* Label;  
* Link type;  
* URL;  
* Open in new tab;  
* Show/Hide.

Для Collection:

* Add;  
* Duplicate;  
* Delete;  
* Reorder.

UI може бути у вигляді:

* floating toolbar;  
* popover;  
* невеликої contextual panel.

Не слід показувати одну велику постійну sidebar-панель для всіх полів.

---

## 13. Редагування звичайного тексту

Не весь текст повинен використовувати Tiptap.

Для коротких plain-text полів використовуються легкі механізми.

Приклади:

* label кнопки;  
* title картки;  
* ім’я;  
* короткий heading;  
* цифра;  
* subtitle.

Plain text не повинен дозволяти HTML-форматування.

Він може редагуватися через контрольований `contenteditable` або інший легкий inline editor.

Звичайний `<input>` не завжди є найкращим варіантом, оскільки він може змінити реальний вигляд тексту та layout сторінки.

---

## 14. Rich Text

Tiptap використовується лише для полів, яким реально потрібне форматування.

Наприклад:

* paragraph;  
* article content;  
* hero heading із форматуванням окремих слів;  
* description;  
* long text.

Tiptap не повинен підключатися до кожного CMS-поля.

Дозволений набір форматування повинен бути обмеженим.

Наприклад:

Bold  
Italic  
Link  
Text color  
Clear formatting

Не потрібно автоматично дозволяти:

* таблиці;  
* iframe;  
* довільний HTML;  
* scripts;  
* складні nested blocks;  
* десятки типів заголовків.

Editor extensions повинні підключатися вибірково.

---

## 15. Зображення

`CmsImage` повинен працювати через Media Library.

Контент не повинен зберігати довільний URL як основне джерело зображення, якщо файл належить CMS.

Image value повинен мати стабільний формат.

Наприклад, логічно він може містити:

media reference  
alt  
decorative  
focal point

У Public Mode компонент:

* отримує media reference;  
* рендерить оптимізоване зображення;  
* застосовує focal point;  
* додає alt або decorative behavior.

В Edit Mode компонент:

* дозволяє відкрити Media Picker;  
* замінити файл;  
* змінити alt;  
* позначити як Decorative;  
* вибрати focal point;  
* виконати Reset.

`CmsImage` не повинен напряму працювати із Supabase Storage.

Усі операції проходять через Media Repository або Media Service.

---

## 16. Buttons і Links

`CmsButton` повинен об’єднувати:

* текст кнопки;  
* тип посилання;  
* URL або target;  
* open in new tab;  
* optional visibility.

Підтримувані типи посилань:

External  
Internal  
Email  
Phone  
Section

У Public Mode рендериться звичайний `<a>` або `<button>`.

В Edit Mode показуються contextual controls.

---

## 17. Collections

`CmsCollection` використовується для повторюваних елементів.

Приклади:

* services;  
* features;  
* team;  
* testimonials;  
* pricing;  
* FAQ;  
* gallery;  
* timeline.

Collection повинна підтримувати:

* Add item;  
* Edit item;  
* Duplicate;  
* Delete;  
* Reorder.

Кожен item повинен мати стабільний ідентифікатор.

Не рекомендується прив’язувати поля лише до array index.

Погано:

services.items.0.title

Краще:

services.items.item-id.title

Це необхідно для стабільного Undo/Redo, reorder і history.

Collection controls не повинні постійно перекривати контент.

---

## 18. Optional fields

Деякі поля можуть бути необов’язковими.

Наприклад:

* subtitle;  
* badge;  
* secondary button;  
* decorative image;  
* description.

Optional field може мати стани:

visible  
hidden

При приховуванні значення не обов’язково одразу видаляти.

Це дозволяє користувачу повернути поле без повторного введення контенту.

---

## 19. Draft Manager

Edit Mode повинен працювати з draft-версією.

Опублікований контент не змінюється під час звичайного редагування.

Draft Manager відповідає за:

* завантаження draft;  
* створення draft на основі published version;  
* локальні зміни;  
* save status;  
* збереження draft;  
* порівняння з published;  
* Reset поля;  
* Reset всієї сторінки.

Основні save statuses:

Saved  
Unsaved  
Saving  
Error

CMS-компоненти не повинні самостійно визначати глобальний save status.

---

## 20. Save Draft

`Save Draft` зберігає поточний стан, але не змінює публічний сайт.

Save Draft повинен:

1. пройти базову validation;  
2. зберегти draft;  
3. оновити save status;  
4. створити Activity entry за необхідності;  
5. не створювати нову published version.

Можливий autosave, але він не повинен замінювати явну модель Draft/Publish.

Для першої версії допустима модель:

* локальні зміни відбуваються одразу;  
* draft автоматично зберігається після debounce;  
* кнопка Save Draft виконує явне гарантоване збереження.

---

## 21. Publish Engine

Publish — це окрема бізнес-операція, а не звичайний `update`.

Publish Engine повинен:

1. перевірити права користувача;  
2. запустити повну validation;  
3. перевірити required fields;  
4. перевірити поточну мову;  
5. створити revision;  
6. зробити draft новою published version;  
7. оновити статус сторінки;  
8. створити Activity Log;  
9. оновити кеш або викликати revalidation;  
10. повернути результат публікації.

Publish не повинен відбуватися автоматично після кожної зміни.

---

## 22. Validation Engine

Validation повинна бути централізованою.

Кожне CMS-поле реєструє власні правила.

Наприклад:

required  
min length  
soft max length  
hard max length  
valid URL  
required alt  
valid link target  
minimum collection items

Validation Engine повинен знати:

* які поля мають помилки;  
* які поля мають warnings;  
* які помилки блокують Publish;  
* до якого поля потрібно прокрутити сторінку.

Publish блокується лише через blocking errors.

Warnings можуть не блокувати публікацію.

---

## 23. Character limits

Текстові поля можуть мати:

* soft limit;  
* hard limit.

Soft limit:

* показує warning;  
* не блокує введення;  
* не обов’язково блокує Publish.

Hard limit:

* показує error;  
* блокує Publish;  
* за потреби обмежує подальше введення.

Лічильник символів не обов’язково постійно показувати під кожним полем.

Його можна показувати:

* під час selection;  
* під час editing;  
* при наближенні до limit.

---

## 24. Undo / Redo

Undo/Redo працюють на рівні Editor Engine.

Компоненти не зберігають власні незалежні history stacks.

Кожна зміна представлена як command.

Приклад:

field changed  
item added  
item removed  
item duplicated  
collection reordered  
image replaced  
field hidden  
field restored

Command повинен містити достатньо інформації для:

* undo;  
* redo;  
* опису зміни;  
* визначення fieldKey.

Undo/Redo стосуються поточної editor session.

Вони не є заміною серверній History/Revisions.

---

## 25. History і Revisions

Потрібно розділяти:

### Local Undo/Redo

Працює всередині поточної незакритої editor session.

### Saved Revisions

Зберігаються в Supabase.

Використовуються для:

* перегляду попередніх версій;  
* Restore;  
* Activity;  
* порівняння;  
* відновлення після публікації.

Restore revision створює новий draft на основі вибраної версії.

Не рекомендується безпосередньо переписувати published version без створення нового revision.

---

## 26. Reset

Кожне поле може підтримувати Reset to Published.

Reset повинен:

1. знайти published value цього поля;  
2. оновити локальний draft;  
3. додати command у Undo/Redo;  
4. запустити validation;  
5. позначити draft як Unsaved.

Також може існувати Reset Page, але він повинен вимагати підтвердження.

---

## 27. Multilingual Edit Mode

Мови завантажуються з Supabase.

Вони не повинні бути жорстко задані в коді.

Editor toolbar показує активні мови сайту.

При перемиканні мови:

* змінюється translation draft;  
* структура сторінки залишається тією самою;  
* selection за можливості зберігається;  
* validation виконується для вибраної мови.

Можливі translation statuses:

Not started  
Draft  
Translated  
Published  
Outdated

Якщо основна мова змінилася, інші переклади можуть отримати статус `Outdated`.

---

## 28. Безпека Edit Mode

Edit Mode повинен бути доступний лише авторизованим користувачам із відповідними permissions.

Перевірка потрібна на кількох рівнях:

Route middleware  
Editor initialization  
Repository operations  
Supabase RLS  
Publish operation

Недостатньо лише приховати кнопку Edit.

Користувач без прав не повинен мати можливість:

* завантажити draft;  
* змінити контент;  
* зберегти draft;  
* публікувати;  
* відкрити Media Picker для приватних ресурсів.

---

## 29. Performance requirements

Публічний сайт не повинен оплачувати продуктивністю існування Edit Mode.

На Public Route не повинні завантажуватися:

Tiptap  
ProseMirror  
Editor Store  
Toolbar  
History Engine  
Draft Manager  
Media Picker  
Admin UI  
Editor CSS  
Admin CSS

Editor Runtime повинен бути окремим chunk.

Tiptap та інші важкі залежності завантажуються асинхронно.

CMS primitives у Public Mode повинні бути максимально легкими:

props  
rendering  
мінімальна CMS-логіка  
без editor watchers  
без editor listeners  
без editor requests

Після production build необхідно перевіряти, що public routes не запитують editor chunks.

---

## 30. CSS architecture

Стилі повинні бути розділені.

runtime.css  
editor.css  
admin.css

`runtime.css`:

* мінімальні технічні стилі;  
* не визначає дизайн клієнтського сайту.

`editor.css`:

* overlay;  
* chips;  
* toolbar;  
* selection;  
* editing states;  
* editor modals.

`admin.css`:

* sidebar;  
* tables;  
* forms;  
* dashboard;  
* admin modals.

Editor та Admin styles не повинні підключатися глобально до публічного сайту.

---

## 31. Публічний API CMS primitives

API базових CMS-компонентів потрібно вважати стабільним контрактом.

Приклади важливих частин API:

modelValue  
fieldKey  
tag  
required  
editable  
maxLength  
formats  
validation  
slots  
events

Breaking changes у цьому API можуть зламати всі клієнтські сайти.

Тому необхідно:

* використовувати semantic versioning;  
* не перейменовувати props без deprecation;  
* не змінювати формат values без migration;  
* документувати breaking changes;  
* тестувати старі сценарії.

---

## 32. Приклад повного потоку редагування

Користувач відкриває:

/admin/edit/about

Далі:

1. middleware перевіряє авторизацію;  
2. завантажується Editor Runtime;  
3. Editor Shell створює Editor Context;  
4. Editor отримує Content Lock для сторінки (heartbeat поки редагування триває; якщо lock зайнятий — read-only, див. Блок 8 → Content Lock);  
5. завантажується published content;  
6. завантажується або створюється draft;  
7. клієнтська сторінка рендериться через CMS primitives;  
8. користувач вибирає `CmsText`;  
9. Selection Manager встановлює `selectedFieldKey`;  
10. Toolbar Manager показує text controls;  
11. користувач змінює текст;  
12. `CmsText` викликає `editor.updateField`;  
13. Draft Manager оновлює локальний draft;  
14. History Manager додає command;  
15. Validation Engine перевіряє поле;  
16. сторінка отримує статус Unsaved;  
17. користувач натискає Save Draft;  
18. Repository зберігає draft (backend перевіряє, що lock належить цій editor session);  
19. користувач натискає Publish;  
20. Publish Engine виконує повну validation;  
21. створюється revision;  
22. draft стає published version;  
23. створюється Activity entry;  
24. публічний сайт отримує новий контент;  
25. при виході з Edit Mode lock звільняється.

---

## 33. Фінальна архітектурна схема

Client Page Components  
Hero, Gallery, Pricing, FAQ  
        │  
        ▼  
CMS Primitives  
CmsText, CmsImage, CmsButton, CmsCollection  
        │  
        ▼  
Editor Context  
mode, hovered, selected, permissions  
        │  
        ▼  
Editor Engine  
draft, validation, dirty state, undo/redo  
        │  
        ├── Toolbar Manager  
        ├── Selection Manager  
        ├── History Manager  
        └── Publish Engine  
        │  
        ▼  
Repository / Data Layer  
        │  
        ▼  
Supabase

Для публічного режиму:

Client Page Components  
        │  
        ▼  
CMS Render Runtime  
        │  
        ▼  
Published content

Editor Runtime у цьому потоці відсутній.

---

## 34. Основні архітектурні правила

1. Edit Mode не є окремим сайтом або iframe.  
2. Публічна та editable-версія використовують одні й ті самі клієнтські компоненти.  
3. CMS Core містить базові CMS primitives, але не містить дизайн клієнтських секцій.  
4. CMS primitives не працюють напряму із Supabase.  
5. Усі зміни проходять через Editor Engine.  
6. Edit Mode працює з draft, а не напряму з published content.  
7. Publish є окремою бізнес-операцією.  
8. Undo/Redo та server revisions є різними системами.  
9. Кожне editable-поле має стабільний `fieldKey`.  
10. Editor state є централізованим.  
11. Toolbar є централізованим і залежить від типу selected field.  
12. Tiptap використовується лише для rich-text полів.  
13. Публічний сайт не завантажує Editor Runtime.  
14. Editor CSS та Admin CSS не входять до public bundle.  
15. API CMS primitives повинен залишатися стабільним між версіями Core.  
16. Безпека перевіряється не лише на рівні UI, а також через middleware, Repository та Supabase RLS.  
17. Нові редакторські можливості повинні додаватися в CMS Core та поширюватися через версії npm-пакета.  
18. Цей блок деталізує Edit Mode і розділення Public / Editor Runtime; при неоднозначності діє загальна ієрархія джерел (Summary §1).

# Блок 4. Component Architecture

## 1. Загальний опис

Компонентна архітектура CMS повинна бути простою, передбачуваною та масштабованою.

Основна мета — один раз реалізувати універсальні компоненти всередині **CMS Core**, після чого використовувати їх у будь-якому клієнтському Nuxt-проєкті без копіювання логіки.

Наприклад, поведінка тексту, зображення або кнопки в Edit Mode не повинна реалізовуватися окремо для кожного нового сайту.

Вона реалізується один раз у:

`nuxt-cms-core`

і потім використовується в усіх проєктах.

Якщо в майбутньому в `CmsImage` буде виправлений баг або додана нова можливість, клієнтський проєкт отримує цю зміну після оновлення версії CMS Core.

При цьому CMS Core не повинен визначати дизайн конкретного сайту.

Основний принцип:

> CMS Core відповідає за універсальні UI-компоненти та CMS-поведінку. Client Project відповідає за дизайн, структуру сторінок та бізнес-компоненти конкретного сайту.

---

## 2. Рівні компонентів

Архітектура складається з чотирьох основних рівнів.

| Рівень | Де знаходиться | Призначення | Приклади |
| ----- | ----- | ----- | ----- |
| UI Primitives | CMS Core | Базові універсальні UI-компоненти | BaseButton, BaseInput, BaseModal |
| CMS Primitives | CMS Core | Контентні компоненти з підтримкою CMS/Edit Mode | CmsText, CmsImage, CmsButton |
| CMS Feature Components | CMS Core | Великі функціональні частини CMS | MediaPicker, EditorToolbar, AdminSidebar |
| Client Components | Client Project | Дизайн і структура конкретного сайту | HeroSection, PricingSection, ProductCard |

Залежності повинні рухатися зверху вниз за принципом:

UI Primitives  
      ↓  
CMS Primitives  
      ↓  
CMS Features / Client Components

Нижчий рівень не повинен залежати від вищого.

Наприклад, `BaseButton` не повинен знати про Edit Mode.

> Канонічне рішення (004a): UI primitives адмінки реалізовані як `Admin*` (`AdminButton`, `AdminInput`, `AdminAlert`…) під кореневим класом `.cms-admin`; `Base*` у цьому блоці читати як `Admin*`. Public CMS primitives (`CmsButton` тощо) **не** будуються на admin UI primitives: admin CSS і компоненти не потрапляють у Public Runtime, а дизайн public-елементів визначає Client Project.

---

## 3. UI Primitives

Базові UI-компоненти повинні знаходитися в CMS Core.

Приклади:

BaseButton  
BaseInput  
BaseTextarea  
BaseSelect  
BaseCheckbox  
BaseSwitch  
BaseModal  
BasePopover  
BaseDropdown  
BaseTooltip  
BaseBadge  
BaseTable

Точний список формується під час реалізації.

Не потрібно заздалегідь створювати десятки компонентів "на майбутнє".

Компонент створюється тоді, коли:

* він реально потрібен;  
* поведінка повторюється;  
* його винесення спрощує код;  
* він буде використовуватися в декількох частинах CMS.

Не слід будувати власний аналог Vuetify із сотнею компонентів.

---

## 4. UI primitives не знають про CMS

Компоненти рівня `Base*` повинні бути максимально простими.

Наприклад:

\<BaseButton  
  variant="primary"  
  size="md"  
  :loading="saving"  
\>  
  Save  
\</BaseButton\>

`BaseButton` може знати про:

* variant;  
* size;  
* disabled;  
* loading;  
* slots;  
* accessibility.

Але він не повинен знати про:

* Supabase;  
* Draft;  
* Publish;  
* Edit Mode;  
* fieldKey;  
* CMS permissions;  
* Activity;  
* History.

Тобто UI primitives повинні залишатися звичайними Vue-компонентами.

---

## 5. CMS Primitives

Це один із найважливіших рівнів CMS Core.

CMS primitives також знаходяться **безпосередньо в пакеті CMS Core**.

Базовий набір:

CmsText  
CmsRichText  
CmsImage  
CmsButton  
CmsLink  
CmsCollection

За реальною необхідністю можуть з'являтися нові primitives.

Саме ці компоненти розробник використовує під час створення клієнтського сайту.

Наприклад:

\<CmsText  
  v-model="content.title"  
  field-key="hero.title"  
  tag="h1"  
  required  
/\>

У Public Mode цей компонент поводиться як звичайний текст.

У Edit Mode він активує CMS-поведінку, описану в Блоці 3.

Таким чином одна й та сама реалізація використовується на всіх сайтах.

---

## 6. CMS Primitive не визначає дизайн

`CmsText` не повинен вирішувати, як виглядає Hero клієнта.

Наприклад:

\<CmsText  
  v-model="content.title"  
  field-key="hero.title"  
  tag="h1"  
  class="text-6xl font-semibold"  
/\>

Тут відповідальність розподілена так:

| Частина | Відповідальність |
| ----- | ----- |
| CmsText | CMS Core |
| Inline editing | CMS Core |
| Validation | CMS Core |
| Editor integration | CMS Core |
| `text-6xl font-semibold` | Client Project |
| Hero layout | Client Project |
| Значення тексту | Supabase |

Таким чином CMS Core забезпечує поведінку, але не обмежує дизайн сайтів.

---

## 7. Client Components

Компоненти конкретного сайту знаходяться тільки в Client Project.

Наприклад:

HeroSection  
AboutSection  
ServicesSection  
PricingSection  
GallerySection  
ContactSection  
ProductCard  
DoctorCard  
Header  
Footer

Вони можуть складатися з CMS primitives.

Наприклад:

\<template\>  
  \<section class="hero"\>  
    \<CmsText  
      v-model="content.title"  
      field-key="hero.title"  
      tag="h1"  
      required  
    /\>

    \<CmsText  
      v-model="content.description"  
      field-key="hero.description"  
      tag="p"  
    /\>

    \<CmsImage  
      v-model="content.image"  
      field-key="hero.image"  
    /\>

    \<CmsButton  
      v-model="content.cta"  
      field-key="hero.cta"  
    /\>  
  \</section\>  
\</template\>

`HeroSection` належить Client Project.

`CmsText`, `CmsImage` та `CmsButton` належать CMS Core.

---

## 8. Що не потрібно переносити в CMS Core

CMS Core не повинен поступово перетворюватися на бібліотеку дизайнів клієнтських сайтів.

Тому за замовчуванням у Core не додаються:

HeroSection  
PricingSection  
DoctorCard  
RestaurantMenu  
ApartmentCard  
ProductHero  
ServicesGrid

Навіть якщо Hero існує майже на кожному сайті, структура Hero може сильно відрізнятися між проєктами.

CMS Core повинен давати primitives для створення Hero, але не сам Hero.

Якщо в майбутньому виникне реальна потреба в бібліотеці готових секцій, вона може бути створена окремо від CMS Core.

---

## 9. CMS Feature Components

Окрему категорію становлять компоненти, які реалізують функції самої CMS.

Наприклад:

AdminSidebar  
AdminHeader  
MediaGrid  
MediaPicker  
FormsTable  
EditorToolbar  
ImageEditorPanel  
CollectionControls  
ActivityList  
PublishDialog

Вони також знаходяться в CMS Core.

Але їх необхідно розділяти за runtime.

Наприклад:

| Компонент | Runtime |
| ----- | ----- |
| CmsText | Public \+ Editor |
| CmsImage | Public \+ Editor |
| BaseButton | Shared |
| EditorToolbar | Editor only |
| MediaPicker | Editor/Admin only |
| AdminSidebar | Admin only |

Це необхідно, щоб Admin або Editor компоненти випадково не потрапляли в bundle публічного сайту.

---

## 10. Повторне використання логіки

Не потрібно будувати складну inheritance-ієрархію компонентів.

Не рекомендується:

BaseEditableComponent  
    ↓  
EditableVisualComponent  
    ↓  
EditableMediaComponent  
    ↓  
CmsImage

Для Vue краще використовувати composition.

Спільна поведінка переноситься в composables або services.

Наприклад:

useCmsField()  
useEditorContext()  
useFieldValidation()

Після цього:

CmsText  
CmsImage  
CmsButton

можуть використовувати однакові механізми без inheritance.

Правило:

> Повторювана логіка → composable/service.  
> Повторюваний UI → component.

---

## 11. Не створювати універсальний CmsField

Не рекомендується створювати один великий компонент:

\<CmsField type="text" /\>  
\<CmsField type="image" /\>  
\<CmsField type="button" /\>  
\<CmsField type="collection" /\>

Такий компонент швидко перетвориться на велику кількість умов:

if text  
if image  
if button  
if collection  
...

Замість цього використовуються окремі компоненти:

CmsText  
CmsImage  
CmsButton  
CmsCollection

А спільну поведінку вони отримують через `useCmsField()` або інші внутрішні механізми CMS Core.

---

## 12. Не створювати зайві компоненти

Не потрібно дробити код тільки заради маленьких файлів.

Не рекомендується структура:

HeroSection  
 └── HeroWrapper  
     └── HeroContent  
         └── HeroText  
             └── HeroTitle  
                 └── CmsText

Якщо компонент:

* використовується лише один раз;  
* не має окремої логіки;  
* не переиспользується;  
* не покращує читабельність;

його зазвичай не потрібно створювати.

Допустимо мати один достатньо великий `HeroSection.vue`, якщо це одна логічно цілісна секція.

---

## 13. Props повинні залишатися простими

Не потрібно намагатися передбачити всі майбутні сценарії.

Наприклад, погано створювати `BaseButton` одразу з десятками параметрів:

loadingPosition  
loadingSize  
borderStyle  
borderSize  
mobileWidth  
disableHover  
disableFocus  
...

Якщо зараз реально потрібно:

\<BaseButton  
  variant="primary"  
  size="md"  
  :loading="loading"  
/\>

цього достатньо.

Нові props додаються тоді, коли виникає реальна потреба.

Особливо важливо не перевантажувати API компонентів CMS Core, оскільки цей API буде використовуватися різними Client Projects.

---

## 14. Props і Slots

Загальний принцип:

* props використовуються для поведінки та простих значень;  
* slots використовуються там, де потрібно передавати структуру або кастомний UI.

Наприклад:

\<BaseModal\>  
  \<template \#header\>  
    ...  
  \</template\>

  \<template \#default\>  
    ...  
  \</template\>

  \<template \#footer\>  
    ...  
  \</template\>  
\</BaseModal\>

Не потрібно створювати десятки props, якщо content може бути переданий через slot.

Але не потрібно використовувати slots там, де простого `title` prop достатньо.

---

## 15. Розширення CMS Core

Client Project не повинен копіювати компоненти CMS Core для невеликих змін.

Порядок розширення:

1. Props  
2. Slots  
3. Config  
4. Hooks  
5. Повний override компонента

Повний override використовується тільки тоді, коли інші способи не підходять.

Це важливо для майбутніх оновлень CMS Core.

Якщо клієнтський проєкт скопіював і переписав половину Core-компонентів, оновлення пакета стає складним.

---

## 16. Структура директорій CMS Core

Точну структуру може визначити розробник або AI під час реалізації.

Але базово вона повинна залишатися простою.

Наприклад:

cms-core/  
└── app/  
    ├── components/  
    │   ├── ui/  
    │   ├── cms/  
    │   ├── admin/  
    │   └── editor/  
    │  
    ├── composables/  
    ├── stores/  
    ├── layouts/  
    └── pages/

Призначення:

| Директорія | Вміст |
| ----- | ----- |
| components/ui | Base UI primitives |
| components/cms | CmsText, CmsImage та інші CMS primitives |
| components/admin | Компоненти адмін-панелі |
| components/editor | Компоненти Edit Mode |
| composables | Спільна Vue-логіка |
| stores | Глобальний state |
| layouts | Admin layouts (Edit Mode рендерить layout Client Project; ізоляція editor-UI — через компонент-обгортку, не через layout) |
| pages | Сторінки CMS Core |

Не потрібно додавати складні рівні типу:

atoms/  
molecules/  
organisms/  
features/  
entities/  
widgets/  
presentation/  
domain/

якщо вони не вирішують реальну проблему.

---

## 17. Структура Client Project

Client Project повинен бути максимально чистим.

Приблизно:

client-project/  
└── app/  
    ├── components/  
    │   ├── sections/  
    │   ├── layout/  
    │   └── project/  
    │  
    └── pages/

Наприклад:

components/  
├── sections/  
│   ├── HeroSection.vue  
│   ├── ServicesSection.vue  
│   └── ContactSection.vue  
│  
├── layout/  
│   ├── SiteHeader.vue  
│   └── SiteFooter.vue  
│  
└── project/  
    └── ProductCard.vue

Базові CMS-компоненти сюди не копіюються.

Вони імпортуються або auto-import-яться з `nuxt-cms-core`.

---

## 18. Типізація

Публічний API CMS primitives повинен бути типізований через TypeScript.

Особливо важливо мати стабільні формати для таких даних:

CmsImageValue  
CmsButtonValue  
CmsLinkValue  
CmsCollectionItem

Ці типи повинні знаходитися в CMS Core та використовуватися клієнтськими проєктами.

Наприклад:

import type {  
  CmsImageValue,  
  CmsButtonValue  
} from 'nuxt-cms-core'

Точні interfaces визначаються під час реалізації.

Основне правило:

> Формат даних CMS primitive не повинен залежати від конкретного клієнтського сайту.

---

## 19. Public Runtime

CMS primitives повинні залишатися легкими в Public Mode.

Наприклад, `CmsText` у публічному режимі не повинен через залежності тягнути:

EditorToolbar  
Tiptap  
EditorStore  
HistoryManager  
MediaPicker

Editor-specific functionality повинна завантажуватися окремо відповідно до архітектури Edit Mode з Блоку 3.

Це необхідно враховувати при створенні dependency graph компонентів.

---

## 20. Версіонування компонентів

Оскільки UI і CMS primitives знаходяться в CMS Core, вони оновлюються разом із пакетом.

Наприклад:

nuxt-cms-core 1.3.1

містить баг у `CmsImage`.

Після виправлення випускається:

nuxt-cms-core 1.3.2

Client Project може перейти на нову версію:

npm install nuxt-cms-core@1.3.2

І всі місця використання `CmsImage` отримують виправлення.

Саме тому API базових CMS-компонентів необхідно вважати стабільним контрактом.

Breaking changes повинні випускатися контрольовано через major-версії або відповідні migration/update механізми.

---

## 21. Що не потрібно створювати на старті

Без конкретної потреби не створювати:

окремий UI npm package  
окремий Editor npm package  
Storybook  
Atomic Design architecture  
Component Factory  
Generic CmsField  
складний Dependency Injection  
великий Component Registry  
десятки Base components наперед

Усе це може бути додано пізніше, якщо з'явиться реальна проблема, яку воно вирішує.

На першому етапі вся універсальна компонентна система повинна знаходитися всередині одного:

nuxt-cms-core

---

## 22. Основний принцип прийняття рішень

Під час реалізації AI або розробник повинен дотримуватися правила:

> Використовувати найпростіше рішення, яке має чітке розділення відповідальності та не блокує майбутнє масштабування.

Не створювати абстракцію лише тому, що вона "може знадобитися".

Нова абстракція повинна вирішувати вже існуючу або очевидну архітектурну проблему.

---

## 23. Фінальна структура відповідальності

| Що | Де реалізується |
| ----- | ----- |
| BaseButton | CMS Core |
| BaseModal | CMS Core |
| BaseInput | CMS Core |
| CmsText | CMS Core |
| CmsRichText | CMS Core |
| CmsImage | CMS Core |
| CmsButton | CMS Core |
| CmsCollection | CMS Core |
| EditorToolbar | CMS Core |
| MediaPicker | CMS Core |
| AdminSidebar | CMS Core |
| Admin Pages | CMS Core |
| HeroSection | Client Project |
| PricingSection | Client Project |
| ProductCard | Client Project |
| Header дизайну сайту | Client Project |
| Footer дизайну сайту | Client Project |
| Бізнес-компоненти клієнта | Client Project |

---

## 24. Фінальна схема

                 nuxt-cms-core  
                         │  
        ┌────────────────┼────────────────┐  
        │                │                │  
        ▼                ▼                ▼

   UI Primitives    CMS Primitives    CMS Features

   BaseButton       CmsText           AdminSidebar  
   BaseInput        CmsImage          EditorToolbar  
   BaseModal        CmsButton         MediaPicker  
   BasePopover      CmsCollection     ActivityList

                         │  
                         │ використання  
                         ▼

                   Client Project

                  HeroSection  
                  PricingSection  
                  GallerySection  
                  ProductCard  
                  Header  
                  Footer

CMS Core надає інструменти.

Client Project використовує ці інструменти для побудови конкретного сайту.

Це повинно залишатися головною межею компонентної архітектури.

# Блок 5. Data Layer / Repository Architecture

## 1. Загальний опис

Data Layer — це окремий шар CMS Core, який відповідає за всю взаємодію застосунку з даними.

Основна мета — не дозволяти Vue-компонентам напряму працювати із Supabase.

Компоненти повинні знати лише:

отримати сторінку  
зберегти draft  
отримати media  
створити submission

але не повинні знати:

яка таблиця використовується  
який Supabase query виконується  
які joins потрібні  
як обробляється помилка  
як формується payload

Для цього використовується **Repository Pattern**.

---

## 2. Основний патерн

Для кожної основної бізнес-сутності створюється власний Repository.

Наприклад:

PagesRepository  
MediaRepository  
FormsRepository  
SettingsRepository  
LanguagesRepository  
ActivityRepository  
RevisionsRepository

Repository є єдиною точкою доступу до відповідної сутності в базі даних.

Наприклад:

pagesRepository.getAll()

pagesRepository.getBySlug()

pagesRepository.saveDraft()

pagesRepository.publish()

Компонент не виконує:

supabase  
  .from('pages')  
  .select(...)

напряму.

---

## 3. Загальний потік даних

Рекомендована схема:

Vue Component  
      ↓  
Composable / Feature Logic  
      ↓  
Repository  
      ↓  
Supabase Client  
      ↓  
Supabase

Для Edit Mode:

CmsText / CmsImage  
      ↓  
Editor Engine  
      ↓  
Draft Manager  
      ↓  
PagesRepository  
      ↓  
Supabase

Компоненти ніколи не повинні пропускати Repository Layer.

---

## 4. Де знаходяться Repositories

Універсальні repositories повинні знаходитися в `CMS Core`.

Приклад:

cms-core/  
└── data/  
    └── repositories/  
        ├── pages.repository.ts  
        ├── media.repository.ts  
        ├── forms.repository.ts  
        ├── settings.repository.ts  
        ├── languages.repository.ts  
        └── revisions.repository.ts

Точна структура директорій може бути змінена під час реалізації.

Головне правило:

> Універсальна логіка роботи з даними CMS знаходиться в CMS Core, а специфічна логіка клієнтського проєкту — у Client Project.

---

## 5. Client repositories

Клієнтський проєкт може мати власні сутності.

Наприклад:

products  
doctors  
apartments  
events

Для них створюються окремі repositories вже в Client Project.

Наприклад:

client-project/  
└── data/  
    └── repositories/  
        ├── products.repository.ts  
        └── doctors.repository.ts

Вони використовують ті самі принципи, що й Core repositories.

Таким чином CMS Core не повинен знати про всі можливі бізнес-сутності клієнта.

---

## 6. Repository не повинен бути занадто абстрактним

Не потрібно створювати складну ієрархію:

BaseRepository  
GenericRepository  
AbstractRepository  
CrudRepository  
RepositoryFactory

якщо вона не вирішує реальну проблему.

На старті достатньо простих зрозумілих repositories.

Наприклад:

export function createPagesRepository() {  
  return {  
    getAll,  
    getById,  
    getBySlug,  
    saveDraft,  
    publish,  
    archive,  
  }  
}

Якщо через час з'явиться реальна повторювана логіка, її можна винести.

---

## 7. Repository і Composable — різні речі

Repository відповідає за роботу з даними.

Composable відповідає за Vue-стан і поведінку інтерфейсу.

Наприклад:

PagesRepository

знає:

як отримати pages  
як зберегти page  
як опублікувати page

А:

usePages()

може знати:

loading  
error  
filters  
selectedPage  
pagination  
refresh()

Тобто:

Repository = data access  
Composable = UI/business state

Не потрібно змішувати ці ролі.

---

## 8. Приклад роботи composable

Наприклад:

export function usePages() {  
  const repository = usePagesRepository()

  const pages = ref(\[\])  
  const loading = ref(false)  
  const error = ref(null)

  async function load() {  
    loading.value = true

    try {  
      pages.value = await repository.getAll()  
    } catch (err) {  
      error.value = err  
    } finally {  
      loading.value = false  
    }  
  }

  return {  
    pages,  
    loading,  
    error,  
    load,  
  }  
}

Конкретна реалізація може відрізнятися.

Головне — composable не повинен дублювати Supabase query.

---

## 9. Server-side operations

Не всі операції повинні виконуватися напряму через browser Supabase client.

Якщо операція:

* використовує secret key;  
* працює з service role;  
* виконує privileged action;  
* викликає зовнішній API;  
* працює з платежами;  
* виконує складну server-side logic;

вона повинна проходити через Nuxt server route або Supabase Edge Function.

Приклад:

Component  
   ↓  
Composable  
   ↓  
$fetch('/api/integrations/telegram')  
   ↓  
Nuxt server  
   ↓  
External API

Repository Layer повинен приховувати від UI різницю між:

direct Supabase query

і

server API request

---

## 10. Типізація

Data Layer повинен бути повністю типізований через TypeScript.

Supabase database types повинні генеруватися зі схеми бази.

Repository повинен повертати application-friendly types.

Наприклад:

Promise\<CmsPage\[\]\>

а не передавати в компоненти випадковий raw-response Supabase.

Це дозволяє:

* ловити помилки на етапі компіляції;  
* стабілізувати API Core;  
* легше оновлювати структуру таблиць;  
* спрощувати роботу Cursor/AI.

---

## 11. Database types і domain types

Не обов'язково використовувати raw Supabase type прямо всюди.

Наприклад, база може мати:

page_translations  
pages  
languages

але UI може отримати:

interface CmsPage {  
  id: string  
  slug: string  
  status: PageStatus  
  title: string  
}

(значення поточної мови; frontend працює з `page.title`, а не з `translations[0]` — Summary §21).

Repository може об'єднати дані з декількох таблиць у зручну для застосунку структуру.

Таким чином зміни БД менше впливають на компоненти.

---

## 12. Error handling

Не потрібно обробляти помилки Supabase по-різному в кожному компоненті.

Repository повинен нормалізувати помилки.

Наприклад:

NotFound  
PermissionDenied  
ValidationError  
Conflict  
UnknownError

Тоді UI може працювати з нормальними application errors, а не з конкретними кодами PostgreSQL.

Наприклад:

try {  
  await repository.publish(id)  
} catch (error) {  
  if (error instanceof PermissionDeniedError) {  
    ...  
  }  
}

Конкретну реалізацію визначає план відповідного епіку.

---

## 13. Loading state

Repository не повинен зберігати UI loading state.

Погано:

PagesRepository.loading

Loading належить:

* composable;  
* store;  
* component.

Repository повинен бути максимально stateless.

---

## 14. Кешування

На першому етапі не потрібно створювати складний custom caching layer.

Використовувати стандартні механізми Nuxt:

useAsyncData  
useFetch  
SSR cache  
route-level caching

за реальною потребою.

Якщо пізніше виникне необхідність у складнішому кеші, його можна додати поверх Repository Layer.

Repository API не повинен залежати від конкретного caching provider.

---

## 15. Один запит замість десятків запитів

CMS primitives не повинні самі завантажувати власні дані.

Наприклад, погано:

CmsText → Supabase request  
CmsImage → Supabase request  
CmsButton → Supabase request

Сторінка повинна отримувати необхідні дані одним або кількома логічними запитами.

Після цього content передається компонентам через props/model.

Наприклад:

Page  
  ↓  
PagesRepository.getPage()  
  ↓  
page content  
  ↓  
HeroSection  
  ↓  
CmsText / CmsImage / CmsButton

Це критично для продуктивності.

---

## 16. Mutations

Будь-яка зміна даних повинна проходити через відповідний Repository.

Наприклад:

create  
update  
delete  
archive  
restore  
publish

Не допускається ситуація, коли:

одна частина CMS використовує Repository,  
а інша напряму виконує supabase.update().

Це швидко створить дублювання логіки.

---

## 17. RLS і Data Layer

Repository не є системою безпеки.

Навіть якщо Repository перевіряє permissions, справжній захист даних повинен залишатися на рівні Supabase RLS.

Схема:

UI permissions  
      ↓  
Repository checks  
      ↓  
Supabase RLS

Repository покращує UX і централізує логіку.

RLS гарантує безпеку.

---

## 18. Dependency direction

CMS Core не повинен залежати від Client Project.

Правильний напрямок:

Client Project  
      ↓  
CMS Core Data APIs  
      ↓  
Supabase

Core repositories працюють лише з Core-сутностями.

Client repositories можуть використовувати:

* Supabase client;  
* Core utilities;  
* shared repository helpers.

Але CMS Core не імпортує client repositories.

---

## 19. Repository API має бути простим

Наприклад:

pagesRepository.getAll()  
pagesRepository.getById(id)  
pagesRepository.getBySlug(slug)  
pagesRepository.saveDraft(id, draft)  
pagesRepository.publish(id)

Не потрібно створювати APIs типу:

execute(  
  createQueryBuilder(  
    createRepositoryCommand(...)  
  )  
)

якщо в цьому немає реальної користі.

Простота API є пріоритетом.

---

## 20. Що не потрібно створювати зараз

Без конкретної потреби не створювати:

Controllers layer  
Use Cases layer  
Command Bus  
Query Bus  
CQRS  
Event sourcing  
Generic Repository Factory  
DAO \+ Repository одночасно  
GraphQL abstraction  
власний ORM

Supabase вже забезпечує хороший data API.

Наш Data Layer потрібен не для дублювання Supabase, а для створення чистої межі між CMS і backend.

---

## 21. Приклад повного read flow

Користувач відкриває Pages.

AdminPages.vue  
      ↓  
usePages()  
      ↓  
PagesRepository.getAll()  
      ↓  
Supabase  
      ↓  
Repository transforms data  
      ↓  
CmsPage\[\]  
      ↓  
usePages()  
      ↓  
AdminPages.vue

---

## 22. Приклад повного Edit Mode flow

Користувач змінює Hero title.

CmsText  
      ↓  
Editor Engine  
      ↓  
Draft Manager  
      ↓  
PagesRepository.saveDraft()  
      ↓  
Supabase

`CmsText` не знає:

* яка таблиця використовується;  
* як працює draft;  
* який query виконується.

---

## 23. Приклад клієнтської сутності

Клієнту потрібні Products.

Client Project створює:

ProductsRepository

Наприклад:

productsRepository.getAll()  
productsRepository.getBySlug()  
productsRepository.create()  
productsRepository.update()  
productsRepository.archive()

Компоненти сайту працюють через:

useProducts()

або безпосередньо через Repository там, де Vue-state не потрібен.

CMS Core при цьому не змінюється.

---

## 24. Фінальна схема

               Vue Components  
                      │  
                      ▼  
             Composables / Stores  
                      │  
                      ▼  
                 Repositories  
                      │  
          ┌───────────┴───────────┐  
          ▼                       ▼  
  Supabase Browser Client    Nuxt Server API  
          │                       │  
          └───────────┬───────────┘  
                      ▼  
                   Supabase

Для Edit Mode:

CMS Primitive  
     ↓  
Editor Engine  
     ↓  
Draft/Publish Manager  
     ↓  
Repository  
     ↓  
Supabase

---

## 25. Основні правила

1. Vue-компоненти не виконують Supabase queries напряму.  
2. Для кожної основної сутності використовується Repository.  
3. Repository відповідає тільки за роботу з даними.  
4. Vue-state знаходиться в composables або Pinia.  
5. Core repositories знаходяться в CMS Core.  
6. Project-specific repositories знаходяться в Client Project.  
7. Repository повинен бути stateless.  
8. Data Layer повністю типізований.  
9. Repository може перетворювати database structure у зручні application types.  
10. Безпека гарантується Supabase RLS, а не Repository.  
11. Не створювати зайві архітектурні шари без реальної потреби.  
12. CMS primitives не повинні самостійно завантажувати дані.  
13. Сторінка отримує контент централізовано та передає його дочірнім компонентам.  
14. Public API Repository повинен залишатися простим і зрозумілим.  
15. Архітектура повинна дозволяти додавати нові клієнтські сутності без змін CMS Core.

---

## Ключовий принцип

> Data Layer існує для того, щоб решта застосунку не залежала від деталей Supabase.

CMS повинна знати, що їй потрібно:

отримати сторінку  
зберегти draft  
отримати media  
опублікувати контент

але не повинна розмазувати по всьому застосунку знання про те, як саме ці операції реалізовані в базі даних.

## 26. Можливість заміни Supabase на власний backend

На першому етапі основним backend-рішенням для CMS є Supabase.

Однак архітектура Data Layer повинна бути побудована так, щоб Supabase не був жорстко прив'язаний до UI, Edit Mode або бізнес-логіки CMS.

Supabase необхідно розглядати як **поточну реалізацію backend**, а не як фундамент усієї CMS.

Основна схема на першому етапі:

Vue Components  
      ↓  
Composables / Stores  
      ↓  
Repositories  
      ↓  
Supabase

У майбутньому, якщо для конкретного проєкту можливостей Supabase буде недостатньо, backend може бути замінений, наприклад, на NestJS:

Vue Components  
      ↓  
Composables / Stores  
      ↓  
Repositories  
      ↓  
NestJS API  
      ↓  
PostgreSQL

При правильній реалізації Repository Pattern компоненти, Edit Mode, Pinia stores та більша частина CMS Core не повинні змінюватися.

Змінюється переважно нижній рівень Data Layer.

Наприклад, сьогодні:

pagesRepository.getBySlug(slug)  
pagesRepository.saveDraft(id, draft)  
pagesRepository.publish(id)

всередині може використовувати Supabase.

У майбутньому ті самі методи можуть виконувати HTTP-запити до NestJS API.

Головне правило:

> Public API Repository не повинен залежати від конкретного backend.

Наприклад, UI не повинен отримувати Supabase-specific response:

const { data, error } = await pagesRepository.getBySlug(slug)

Краще:

const page = await pagesRepository.getBySlug(slug)

Repository самостійно:

* виконує backend-запит;  
* обробляє backend-specific response;  
* нормалізує помилки;  
* перетворює дані у domain/application types.

Назовні не повинні передаватися:

SupabaseClient  
PostgrestError  
PostgrestResponse  
SQL-specific structures

UI та бізнес-логіка повинні працювати тільки з CMS types та application errors.

---

### Можливі сценарії переходу

Не обов'язково одразу повністю відмовлятися від Supabase.

Можливий проміжний варіант:

Nuxt  
  ↓  
NestJS  
  ↓  
Supabase PostgreSQL

У цьому випадку:

* база даних залишається в Supabase;  
* frontend більше не звертається до Supabase напряму;  
* бізнес-логіка переноситься в NestJS;  
* Repository починає працювати через API.

Пізніше сама база також може бути перенесена:

Nuxt  
  ↓  
NestJS  
  ↓  
Own PostgreSQL

Таким чином backend можна замінювати поступово.

---

### Що доведеться замінити при повній відмові від Supabase

Supabase надає не тільки Database.

При повному переході на власний backend потрібно буде замінити або реалізувати аналоги:

| Supabase | Можлива заміна |
| ----- | ----- |
| PostgreSQL Database | PostgreSQL через власний hosting |
| Auth | NestJS Auth / JWT / external auth provider |
| RLS | NestJS Guards \+ permission layer \+ DB constraints |
| Storage | S3 / Cloudflare R2 / MinIO / інше object storage |
| Edge Functions | NestJS services / workers |
| Realtime | WebSocket / SSE |
| Cron / background operations | Scheduler / queues |

Тому повна заміна Supabase є окремою backend-задачею.

Але при правильно спроєктованому Data Layer вона не повинна вимагати переписування CMS frontend.

---

### Архітектурний принцип

Repository Layer повинен бути стабільною межею між CMS і backend.

Сьогодні:

Repository  
    ↓  
Supabase

У майбутньому:

Repository  
    ↓  
NestJS API

або інша реалізація.

CMS Components, Edit Mode та UI повинні продовжувати працювати через той самий Repository API.

---

### Додаткове правило для Data Layer

Архітектура повинна дозволяти замінити backend без зміни верхніх шарів системи.

Тому:

* не використовувати `supabase.from()` у Vue-компонентах;  
* не використовувати Supabase-specific types як public types CMS Core;  
* не передавати Supabase errors безпосередньо в UI;  
* не прив'язувати composables до Supabase SDK;  
* усю backend-specific логіку ізолювати всередині Repository / Backend Adapter.

Supabase є backend-рішенням за замовчуванням, але не повинен бути невід'ємною частиною API CMS Core.

# Блок 6. Authentication, Users, Roles & Permissions

## 1. Загальний опис

Система авторизації повинна підтримувати два принципово різні типи використання одного застосунку:

1. **CMS Users** — користувачі, які мають доступ до адміністративної панелі та Edit Mode.  
2. **Application Users** — звичайні користувачі клієнтського сайту, якщо конкретний проєкт має реєстрацію, особистий кабінет, замовлення, підписки тощо.

При цьому не потрібно створювати дві окремі системи авторизації.

Для Supabase використовується одна центральна система:

Supabase Auth  
     ↓  
auth.users

`auth.users` відповідає лише на питання:

> Хто це?

Наприклад:

* email;  
* password/identity;  
* user id;  
* auth session.

А власні таблиці застосунку відповідають на питання:

> Що цьому користувачу дозволено?

---

## 2. Єдина Auth-система

Усі користувачі — CMS і звичайні — знаходяться в одному:

auth.users

Не потрібно створювати:

admin_auth_users  
customer_auth_users

або двічі реалізовувати login/password/reset.

Один користувач потенційно може бути одночасно:

зареєстрованим користувачем сайту

\+

CMS Editor

Тому тип користувача не повинен жорстко зберігатися як:

user.type = "admin"

у самій Auth-системі.

Доступ визначається окремими application tables.

---

## 3. Загальна модель

Базова схема:

                        auth.users  
                             │  
              ┌──────────────┼──────────────┐  
              │              │              │  
              ▼              ▼              ▼  
          profiles       cms_users     Client-specific  
                                        user tables

Наприклад:

auth.users  
    │  
    ├── profiles  
    │  
    │   name  
    │   avatar  
    │   common profile data  
    │  
    ├── cms_users  
    │  
    │   role  
    │   status  
    │   CMS access  
    │  
    └── customer_profiles  
        orders  
        subscriptions  
        favourites  
        etc.

Конкретні поля таблиць визначаються під час реалізації.

---

## 4. Profiles

За необхідності використовується загальна таблиця:

profiles

Вона пов'язана з:

auth.users

через `user_id`.

У ній може знаходитися інформація, потрібна UI:

name  
avatar  
display name

`auth.users` не потрібно використовувати як бізнес-таблицю застосунку.

Auth відповідає за identity та authentication.

`profiles` відповідає за application profile.

---

## 5. CMS Users

Доступ до CMS визначається окремою таблицею:

cms_users

або аналогічною таблицею membership.

Сам факт існування користувача в:

auth.users

НЕ дає доступу до CMS.

Щоб користувач міг відкрити:

/admin  
/admin/edit/\*

він повинен мати активний запис у:

cms_users

Наприклад:

auth.users  
    ↓  
user A  
    ↓  
cms_users  
    ↓  
role = editor

Тільки після цього він отримує CMS permissions.

---

## 6. Application Users

Якщо конкретний сайт має звичайну реєстрацію:

/register  
/login  
/account

користувач також створюється в:

auth.users

Але для нього НЕ створюється запис у:

cms_users

Тому він може користуватися клієнтською частиною сайту, але не CMS.

Наприклад:

auth.users

User A  
├── customer_profile  
└── НЕ має cms_users

Результат:

/account → дозволено

/admin → заборонено

---

## 7. Один користувач може мати обидві ролі

Архітектура повинна дозволяти:

auth.users

User A  
├── customer_profile  
└── cms_users  
      role = editor

Тобто одна фізична людина може одночасно:

* використовувати сайт як звичайний користувач;  
* мати доступ до CMS.

Не потрібно створювати другий акаунт із тим самим email.

---

## 8. Реєстрація звичайних користувачів

Якщо клієнтський проєкт потребує public registration:

/register

вона використовує стандартний Auth flow.

При успішній реєстрації:

register  
   ↓  
auth.users  
   ↓  
profile / client-specific user data

Наприклад:

auth.users  
    ↓  
customer_profiles

або:

auth.users  
    ↓  
profiles  
    ↓  
orders  
subscriptions  
etc.

CMS Core не повинен визначати бізнес-структуру звичайних користувачів конкретного сайту.

Це належить Client Project.

---

## 9. CMS не має public registration

Для CMS не повинно існувати:

/admin/register

або кнопки:

Create admin account

для будь-якого відвідувача.

CMS-користувачі додаються тільки через controlled invitation flow.

Тобто:

Owner/Admin  
      ↓  
Invite user  
      ↓  
Email  
      ↓  
User accepts invitation  
      ↓  
Account becomes active CMS user

Це принципово відрізняється від звичайної реєстрації користувача клієнтського сайту.

---

## 10. Перший Owner

При створенні нового проєкту CMS необхідно один раз створити першого власника.

Це bootstrap operation.

Рекомендований flow:

nuxt-cms create  
      ↓  
створення проєкту  
      ↓  
підключення Supabase  
      ↓  
CMS migrations  
      ↓  
Create first owner

CLI або setup-команда може запросити:

Owner email:

Після цього створюється або запрошується перший CMS-користувач із роллю:

owner

Наприклад, у майбутньому це може виглядати як:

npx nuxt-cms create-owner owner@example.com

Точна CLI-команда визначається під час реалізації.

Головний принцип:

> Перший Owner створюється контрольованою setup-операцією, а не через відкриту CMS registration page.

---

## 11. Ролі CMS

На першому етапі не потрібно створювати надмірно складну permission system.

Базові ролі:

| Role | Призначення |
| ----- | ----- |
| Owner | Повний контроль над CMS |
| Admin | Майже повне управління сайтом |
| Editor | Робота з контентом і Edit Mode |

За необхідності в майбутньому можуть бути додані:

Translator  
SEO Manager  
Reviewer  
Viewer

Але не потрібно створювати їх наперед без реальної потреби.

---

## 12. Owner

`Owner` — найвищий рівень доступу.

Може:

* керувати CMS users;  
* змінювати ролі;  
* запрошувати користувачів;  
* видаляти/деактивувати CMS users;  
* керувати integrations;  
* змінювати критичні settings;  
* публікувати;  
* користуватися Edit Mode;  
* управляти content;  
* управляти Media;  
* переглядати Activity.

Важливе правило:

> У системі завжди повинен залишатися хоча б один Owner.

Не дозволяти випадково:

* видалити останнього Owner;  
* деактивувати останнього Owner;  
* змінити роль останнього Owner на нижчу.

---

## 13. Admin

`Admin` має широкий доступ до CMS, але не обов'язково може виконувати найбільш критичні операції.

Наприклад:

Pages       ✓  
Media       ✓  
Forms       ✓  
Edit Mode   ✓  
Publish     ✓  
Settings    ✓  
Activity    ✓

Але такі операції можуть залишатися Owner-only:

зміна Owner  
управління найбільш критичними permissions  
видалення Owner  
частина security settings

Точний permission matrix визначається під час реалізації.

---

## 14. Editor

`Editor` орієнтований на роботу з контентом.

Наприклад:

Pages       ✓  
Media       ✓  
Edit Mode   ✓  
Save Draft  ✓

Але:

Users            ✗  
Critical Settings ✗  
Integrations      ✗

Чи може Editor виконувати Publish — повинно бути окремим permission decision.

Для простих сайтів можна дозволити.

Для складніших проєктів можна розділити:

edit  
publish

як різні permissions.

---

## 15. Roles та Permissions

Не потрібно розкидати перевірки по компонентах:

if (user.role === 'admin')

по всьому застосунку.

Краще мати централізований permission API.

Наприклад:

can('pages.edit')  
can('pages.publish')  
can('media.delete')  
can('users.manage')  
can('settings.update')

UI працює через permissions, а не напряму через назву role.

Наприклад:

Owner  
    ↓  
pages.edit = true  
pages.publish = true  
users.manage = true

Editor  
    ↓  
pages.edit = true  
pages.publish = false  
users.manage = false

Це дозволить у майбутньому змінювати permission matrix без переписування компонентів.

---

## 16. Не потрібно одразу будувати складний RBAC engine

На першій версії можна мати:

role  
    ↓  
static permission map

Наприклад, permission definitions можуть знаходитися в CMS Core.

Не потрібно одразу створювати:

roles  
permissions  
role_permissions  
user_permissions  
permission_groups

якщо немає потреби дозволяти клієнту створювати власні ролі.

Пізніше permission system можна винести в database-driven RBAC без зміни API:

can('pages.publish')

---

## 17. CMS User Invitation

У Settings CMS повинен бути розділ:

Settings  
    ↓  
Users

Owner або користувач із відповідним permission натискає:

Invite user

Вводить:

Email  
Role

Наприклад:

user@example.com

Editor

Далі:

CMS  
 ↓  
Server API  
 ↓  
Supabase Admin Auth API  
 ↓  
Invitation email

Supabase admin operations не виконуються безпосередньо з browser.

Вони повинні проходити через trusted server environment.

---

## 18. Invitation Flow

Новий користувач:

Owner invites:  
editor@example.com  
        ↓  
створюється invitation  
        ↓  
cms_users:  
status = invited  
role = editor  
        ↓  
email invitation  
        ↓  
користувач відкриває link  
        ↓  
створює/встановлює credentials  
        ↓  
status = active  
        ↓  
може відкрити /admin

Точний механізм статусів визначається під час реалізації.

---

## 19. Якщо акаунт уже існує

Важливий сценарій.

Наприклад, користувач уже зареєстрований на клієнтському сайті:

auth.users  
    ↓  
alex@example.com

Owner вирішив зробити його Editor.

Не потрібно створювати другий Auth account.

Замість цього існуючому `user_id` додається CMS membership:

cms_users  
    ↓  
user_id = existing user  
role = editor

Після цього:

/account → працює як раніше

/admin → тепер також доступний

Це одна з головних причин використовувати одну Auth-систему.

---

## 20. Управління CMS Users

У Settings → Users можна показувати:

Name  
Email  
Role  
Status  
Last activity

Можливі дії:

Invite  
Change role  
Deactivate  
Reactivate  
Remove CMS access  
Resend invitation

`Remove CMS access` не обов'язково означає видалення:

auth.users

Наприклад, якщо людина також є клієнтом сайту, видалення її CMS access повинно видалити/деактивувати лише:

cms_users

Її звичайний account продовжує працювати.

---

## 21. Authentication та Authorization — різні речі

Це важливо концептуально.

#### Authentication

Відповідає:

> Хто користувач?

Supabase Auth

#### Authorization

Відповідає:

> Що цьому користувачу дозволено?

cms_users  
roles  
permissions  
RLS

Не змішувати ці два поняття.

---

## 22. Захист `/admin`

Недостатньо перевірити:

isAuthenticated

Тому що звичайний клієнтський користувач також може бути authenticated.

Потрібно:

authenticated  
        ↓  
has active CMS membership?  
        ↓  
yes → /admin  
no  → access denied

Наприклад:

customer@example.com

authenticated = true  
cms_user = false

/admin → 403 / redirect

---

## 23. Захист Edit Mode

Для:

/admin/edit/\*

виконується така сама перевірка.

Крім membership перевіряється permission на конкретну сутність, наприклад для сторінок:

pages.edit

А для Publish:

pages.publish

(Іменування прав — `<entity>.<action>`, як у реалізації 003. Як Client Project додає права для власних колекцій — відкрите рішення, див. `docs/MASTER_PLAN.md`.)

Таким чином користувач може мати право відкривати Edit Mode, але не обов'язково право публікувати.

---

## 24. RLS

UI permissions не є системою безпеки.

Наприклад:

\<BaseButton v-if="can('pages.delete')"\>  
  Delete  
\</BaseButton\>

покращує UX, але не захищає database.

Тому доступ повинен дублюватися на рівні Supabase RLS.

Приблизна логіка:

Request  
   ↓  
Supabase Auth  
   ↓  
auth.uid()  
   ↓  
cms_users  
   ↓  
role / permissions  
   ↓  
RLS Policy  
   ↓  
allow / deny

Навіть якщо користувач вручну виконає API request поза CMS UI, RLS повинен заборонити недозволену операцію.

---

## 25. CMS role не варто зберігати лише в profiles

Не рекомендується структура:

profiles  
    role = admin

як єдина модель authorization.

Причина — `profiles` може використовуватися всіма користувачами застосунку.

Окрема:

cms_users

набагато чіткіше визначає:

> Цей користувач має CMS access.

Тому:

profiles

відповідає за дані профілю.

cms_users

відповідає за CMS membership та CMS role.

---

## 26. Permissions у JWT

Supabase підтримує custom claims у JWT, тому в майбутньому CMS role або частину permissions можна додавати в access token для швидших перевірок.

Але для першої версії це не є обов'язковим.

Простіший варіант:

auth.uid()  
    ↓  
cms_users

і RLS/database functions.

Якщо пізніше performance або складність permission checks стане проблемою, можна оптимізувати систему через custom claims без зміни public API:

can('pages.edit')

---

## 27. Server-side Admin Operations

Операції з Auth Admin API повинні виконуватися лише server-side.

Наприклад:

Invite CMS user  
Delete Auth user  
Admin reset  
Administrative user management

потік:

Admin UI  
    ↓  
Nuxt server endpoint  
    ↓  
permission check  
    ↓  
Supabase Admin API

Secret/service key ніколи не передається browser.

---

## 28. Auth abstraction

Як і Data Layer, Auth не потрібно розмазувати по всьому CMS Core.

Повинен існувати централізований API.

Наприклад:

useCmsAuth()  
usePermissions()

або внутрішній:

AuthService

Компоненти не повинні десятки разів напряму викликати Supabase Auth API.

Це також полегшує потенційну майбутню заміну Supabase Auth на власний NestJS Auth або інший provider.

---

## 29. Сценарій нового клієнтського проєкту

Наприклад, створюється сайт Льоші.

nuxt-cms create  
      ↓  
Nuxt project  
      ↓  
CMS Core  
      ↓  
Supabase  
      ↓  
migrations

Потім створюється:

lesha@example.com

як:

Owner

У базі:

auth.users  
    ↓  
Lesha

cms_users  
    ↓  
Lesha → owner

Льоша заходить:

/admin

і бачить Settings → Users.

---

## 30. Льоша додає нового Editor

Льоша натискає:

Invite user

Вводить:

anna@example.com  
role = editor

CMS:

UI  
 ↓  
server API  
 ↓  
invite  
 ↓  
Supabase Auth  
 ↓  
cms_users

Анна отримує invitation.

Після активації:

auth.users  
    ↓  
Anna

cms_users  
    ↓  
Anna → editor

Вона отримує тільки дозволені Editor permissions.

---

## 31. Якщо сайт пізніше отримує Customer Accounts

Через рік сайт Льоші може отримати:

/register  
/account  
/orders

Архітектуру Auth змінювати не потрібно.

Новий Customer:

auth.users  
    ↓  
Customer

customer_profiles  
    ↓  
Customer data

Але:

cms_users

для нього немає.

Тому:

/account → ✓

/admin → ✗

Існуючі Owner/Admin/Editor продовжують працювати без змін.

---

## 32. Фінальна схема

                        Supabase Auth

                           auth.users  
                               │  
            ┌──────────────────┼──────────────────┐  
            │                  │                  │  
            ▼                  ▼                  ▼

        profiles           cms_users        Client-specific  
                                             user data

       common info         CMS access        customer_profile  
                           role              orders  
                           status            subscriptions  
                           permissions        etc.

                               │  
                               ▼

                        CMS Authorization

                     Owner / Admin / Editor

                               │  
                               ▼

                   Admin Panel / Edit Mode

---

## 33. Основні правила

1. Використовується одна Auth-система для всіх користувачів.  
2. `auth.users` відповідає тільки за identity/authentication.  
3. CMS access визначається окремою таблицею `cms_users`.  
4. Звичайна реєстрація не створює CMS access.  
5. Для CMS немає public registration.  
6. CMS users додаються через invitation flow.  
7. Перший Owner створюється через bootstrap/setup process.  
8. Один Auth user може одночасно бути Customer і CMS user.  
9. Видалення CMS access не повинно автоматично видаляти Auth account.  
10. UI працює через permissions, а не через прямі перевірки role.  
11. На старті використовується проста role → permissions модель.  
12. Не створювати складний custom RBAC engine без необхідності.  
13. Backend security забезпечується RLS.  
14. Auth Admin operations виконуються тільки server-side.  
15. Secret key ніколи не доступний browser.  
16. Останній Owner не може бути випадково видалений або понижений у ролі.  
17. Auth logic повинна бути централізована, а не розмазана по Vue-компонентах.  
18. Архітектура повинна дозволяти в майбутньому замінити Supabase Auth без переписування CMS UI.

19. **Public signup не відкриває CMS.** Навіть якщо public signup увімкнений у Supabase через потреби клієнтського сайту, authenticated user і CMS user — різні поняття. Доступ до `/admin` дає тільки запис у `cms_users` плюс відповідні RLS / permissions (`auth.uid()` у policy logic).  
20. **Invitation — тільки серверна операція.** Supabase `inviteUserByEmail()` є Admin API і вимагає secret key у trusted server environment; цей ключ обходить RLS і не може потрапляти в браузер.  
21. Система CMS-авторизації не перебудовується, коли сайт пізніше отримує звичайних зареєстрованих користувачів.

# Блок 7. Storage & Media Architecture

## 1. Загальний опис

Storage & Media Layer відповідає за всі файли, які використовуються CMS і клієнтським сайтом:

* зображення;  
* SVG;  
* документи;  
* відео;  
* логотипи;  
* favicon;  
* OG images;  
* вкладення форм, якщо вони з'являться.

На першому етапі фізичне зберігання файлів реалізується через **Supabase Storage**.

При цьому CMS не повинна напряму прив'язувати свою бізнес-логіку до Supabase Storage. Як і у випадку з Data Layer, Storage Provider повинен бути замінним.

У майбутньому Supabase Storage можна буде замінити, наприклад, на:

Amazon S3  
Cloudflare R2  
MinIO  
інший object storage

без необхідності переписувати `CmsImage`, Media Library або клієнтські компоненти.

Основна схема:

CMS / Client Components  
        ↓  
Media Service / Repository  
        ↓  
Storage Adapter  
        ↓  
Supabase Storage

---

## 2. Файл і Media-запис — це різні речі

Фізичний файл у Storage не повинен бути єдиним джерелом інформації про media.

Потрібно розділяти:

Storage

і:

Media Database Record

Storage містить сам файл:

images/abc123.webp

База даних містить CMS-інформацію про нього:

media  
    ↓  
назва  
storage path  
тип  
розмір  
alt  
focal point  
metadata  
created by  
created at

Точний список колонок визначається під час реалізації.

Основний принцип:

> CMS працює з Media Entity, а не безпосередньо з URL файла.

---

## 3. Не зберігати URL файла в контенті

Клієнтський контент не повинен зберігати:

https://project.supabase.co/storage/.../image.webp

як основне значення зображення.

Краще зберігати reference:

mediaId

Наприклад:

Hero  
    ↓  
image_media_id  
    ↓  
Media  
    ↓  
Storage

Це дозволяє:

* замінити файл;  
* змінити Storage provider;  
* змінити CDN;  
* змінити bucket;  
* змінити path;  
* відстежувати usage;  
* централізовано управляти metadata.

Контент при цьому не потрібно переписувати.

---

## 4. Media Repository / Service

Всі операції з Media повинні проходити через централізований Media Layer у CMS Core.

Наприклад:

MediaRepository  
MediaService  
StorageAdapter

Розподіл відповідальності може виглядати так:

MediaRepository  
    ↓  
працює з media records у Database

StorageAdapter  
    ↓  
upload / download / delete фізичних файлів

MediaService  
    ↓  
координує обидві операції

Наприклад:

Upload image  
      ↓  
MediaService  
      ↓  
StorageAdapter.upload()  
      ↓  
MediaRepository.create()

Не потрібно дозволяти Vue-компонентам напряму викликати:

supabase.storage.from(...)

---

## 5. Storage Adapter

Supabase Storage є першою реалізацією Storage Adapter.

Умовно:

StorageAdapter

upload()  
remove()  
replace()  
getPublicUrl()  
getSignedUrl()

На першому етапі:

SupabaseStorageAdapter

У майбутньому може бути:

S3StorageAdapter  
R2StorageAdapter

API для Media Layer при цьому не змінюється.

Це відповідає тому самому принципу, що й Data Layer:

> Supabase — реалізація інфраструктури, а не API самої CMS.

---

## 6. Buckets

Не потрібно створювати десятки bucket'ів для кожного типу файла.

На старті бажано використовувати мінімальну кількість.

Наприклад:

media  
private

`media`:

* публічні зображення;  
* SVG;  
* документи;  
* відео;  
* site assets.

`private`:

* приватні uploads;  
* вкладення форм;  
* файли, які не повинні мати public URL.

Якщо приватні файли конкретному проєкту не потрібні, `private` bucket можна взагалі не створювати.

Не потрібно робити:

images  
logos  
blog-images  
products  
hero-images  
icons  
documents

окремими buckets без реальної необхідності.

Організація може виконуватися через path.

---

## 7. Структура Storage paths

Файл повинен отримувати стабільний унікальний storage path.

Не рекомендується використовувати original filename як єдиний identifier.

Наприклад:

photo.jpg

може існувати багато разів.

Краще:

media/{uuid}/original.webp

або інша подібна схема.

Original filename залишається metadata в таблиці `media`.

Таким чином користувач може перейменувати файл у Media Library без фізичного перейменування object у Storage.

---

## 8. Upload Flow

Завантаження файла проходить централізовано.

Media Library / Edit Mode  
        ↓  
MediaService.upload()  
        ↓  
Validation  
        ↓  
StorageAdapter.upload()  
        ↓  
MediaRepository.create()  
        ↓  
Media Entity

До upload необхідно перевіряти:

* allowed MIME type;  
* file extension;  
* file size;  
* basic file validity;  
* permissions користувача.

Не довіряти лише extension файла.

Наприклад, файл із назвою:

image.jpg

не обов'язково є JPEG.

---

## 9. Image formats

Для першої версії варто підтримувати основні формати:

JPEG  
PNG  
WebP  
SVG

За потребою:

AVIF

Не потрібно одразу будувати складний image processing pipeline.

CMS повинна мати можливість пізніше додати optimization layer без зміни API Media.

---

## 10. Image optimization

Не обов'язково конвертувати кожен файл фізично в десятки форматів під час upload.

На першому етапі краще використовувати стандартну оптимізацію Nuxt / image provider / CDN там, де це можливо.

Архітектура повинна дозволяти пізніше додати:

original  
optimized  
thumbnail  
responsive variants

але не потрібно реалізовувати це наперед, якщо немає реальної потреби.

Основний принцип:

> Не ускладнювати Storage заради теоретичної оптимізації.

---

## 11. Media Entity

Media Library повинна працювати з Media Entity, яка представляє файл незалежно від конкретного Storage provider.

Наприклад, логічно Media Entity містить:

id  
storage reference  
file metadata  
display name  
type  
size  
dimensions  
metadata

Точний список колонок визначається під час реалізації.

CMS-компоненти працюють із:

media.id

або application type:

CmsMedia

а не з raw Supabase Storage object.

---

## 12. Alt text

Важливий момент: потрібно розрізняти **дані самого файла** та **дані конкретного використання файла**.

Наприклад, одне зображення може використовуватися:

Home Hero  
About section  
Blog article

і мати різний semantic context.

Тому глобальний alt у Media Library може використовуватися як default, але конкретне використання `CmsImage` повинно мати можливість перевизначити alt.

Наприклад:

Media  
    defaultAlt

CmsImage usage  
    altOverride

Це більш правильно з точки зору accessibility.

---

## 13. Decorative images

`CmsImage` повинен підтримувати:

decorative = true

У такому випадку alt не є обов'язковим.

Validation Engine Edit Mode повинен це враховувати.

---

## 14. Focal Point

Focal Point належить конкретному використанню зображення або Media Entity залежно від сценарію.

За замовчуванням можна мати focal point у Media.

Наприклад:

x = 0.5  
y = 0.35

Але `CmsImage` повинен мати можливість перевизначити його, якщо те саме зображення використовується в різних crop/layout contexts.

Наприклад:

Media default focal point  
        ↓  
CmsImage override

---

## 15. Replace

Replace не повинен означати:

знайти всі компоненти  
і вручну змінити URL

Якщо контент використовує `mediaId`, Replace стає простою операцією.

Media ID = 123  
       ↓  
старий physical file  
       ↓ Replace  
новий physical file  
       ↓  
Media ID = 123

Усі місця, які використовують цей Media Entity, автоматично отримують новий файл.

Це одна з головних переваг Media abstraction.

---

## 16. Replace vs Select another media

Потрібно розділяти дві різні операції.

#### Replace Media

Замінює фізичний файл у Media Entity.

Усі usage цього media можуть отримати новий файл.

#### Change Image

`CmsImage` починає посилатися на інший `mediaId`.

Інші usage старого media не змінюються.

UI повинен чітко розрізняти ці дії.

---

## 17. Media Usage

CMS повинна знати, де використовується конкретний Media Entity.

Наприклад:

logo.webp

Used in:  
Home → Hero  
About → Team  
Settings → OG Image

Це потрібно для:

* delete protection;  
* Media Library UI;  
* безпечного Replace;  
* cleanup unused files.

Не обов'язково реалізовувати складний dependency graph.

Достатньо системи, яка дозволяє отримати references на `mediaId`.

---

## 18. Usage tracking

Є два можливі варіанти:

1. визначати usage через relations/database queries;  
2. мати окремий `media_usage` registry.

Точну реалізацію можна визначити під час розробки.

Головне API повинно дозволяти:

mediaRepository.getUsage(mediaId)

CMS не повинна вручну шукати usage по всьому application code.

---

## 19. Delete

Не можна фізично видаляти файл одразу після натискання Delete без перевірки.

Flow:

Delete  
   ↓  
check permissions  
   ↓  
check media usage  
   ↓  
used?  
 ┌───┴───┐  
 yes     no  
 ↓        ↓  
block /   delete  
warning

Якщо файл використовується, CMS повинна:

* заблокувати delete;  
* або показати locations;  
* запропонувати спочатку замінити references.

Для першої версії найбезпечніше — блокувати видалення використаних media.

---

## 20. Soft Delete

Media Entity бажано спочатку soft-delete, а не миттєво знищувати фізичний файл.

Наприклад:

Media Library Delete  
        ↓  
deleted / trash state  
        ↓  
можливість Restore

Фізичне очищення Storage можна виконувати пізніше.

Це захищає від випадкової втрати файлів.

Точний retention period можна визначити пізніше.

---

## 21. Unused Media

Media Library повинна мати можливість показувати:

Unused

якщо файл ніде не використовується.

Не потрібно автоматично видаляти unused media.

Воно може бути завантажене для майбутнього використання.

Можна лише показувати warning або filter:

Unused files

---

## 22. Media Picker

Media Picker — універсальний компонент CMS Core.

Він використовується:

Edit Mode  
Settings  
Pages  
Collections  
Admin forms

Media Picker не повинен бути окремо реалізований для кожної feature.

Flow:

CmsImage  
    ↓  
Open Media Picker  
    ↓  
select existing  
OR  
upload new  
    ↓  
returns Media Entity

---

## 23. CmsImage і Media Layer

`CmsImage` не працює з Supabase Storage напряму.

Flow:

CmsImage  
    ↓  
Media API  
    ↓  
Media Repository / Service  
    ↓  
Storage Adapter

У Public Mode `CmsImage` отримує application-friendly Media data і просто рендерить зображення.

В Edit Mode він додатково може:

* відкрити Media Picker;  
* змінити alt;  
* змінити focal point;  
* встановити decorative;  
* reset to published.

---

## 24. Public vs Private files

Публічні site assets можуть бути доступні через public URL/CDN.

Приватні файли не повинні мати постійного public URL.

Для них використовуються signed URLs або server-side download.

Наприклад:

Public:  
Hero image  
Logo  
PDF brochure

Private:  
Form attachment  
Private document  
User upload

Рішення про public/private повинно прийматися на рівні media/storage policy, а не компонентом.

---

## 25. SVG Security

SVG необхідно розглядати окремо.

SVG може містити executable або небезпечний content.

Тому не можна без перевірки дозволяти довільний SVG upload і потім вставляти його inline в DOM.

Для V1 бажано:

* обмежувати SVG uploads;  
* не виконувати довільний SVG markup;  
* використовувати SVG як файл через `<img>`, якщо це достатньо;  
* за потреби пізніше додати sanitization.

---

## 26. Documents та Videos

Media Library може підтримувати документи та відео, але не потрібно будувати складний video hosting.

Для великих відео краще в майбутньому використовувати спеціалізований provider.

На старті Media Layer може просто підтримувати file references.

Не потрібно перетворювати CMS Core на YouTube/Vimeo replacement.

---

## 27. Permissions

Media operations повинні враховувати CMS permissions.

Наприклад:

media.view  
media.upload  
media.update  
media.replace  
media.delete

UI перевіряє permissions для UX.

Backend / Storage policies гарантують security.

---

## 28. Storage security

Browser не повинен отримувати secret/service keys.

Upload може виконуватися через Supabase Storage client з правильно налаштованими policies або через server endpoint там, де це необхідно.

Security повинна бути реалізована на рівні:

Auth  
Permissions  
Storage Policies  
Database RLS

а не тільки через приховані кнопки Media Library.

---

## 29. Client-specific files

Client Project не повинен створювати власну паралельну Media Library.

Якщо клієнтські сутності:

Products  
Doctors  
Apartments

використовують файли, вони повинні посилатися на той самий CMS Media Layer.

Наприклад:

Product  
    ↓  
mediaId  
    ↓  
CMS Media

Таким чином одна Media Library працює для всього проєкту.

---

## 30. Заміна Storage Provider

Архітектура повинна дозволяти в майбутньому:

Supabase Storage  
        ↓  
Cloudflare R2

або:

Supabase Storage  
        ↓  
Amazon S3

без зміни:

CmsImage  
MediaPicker  
Media Library  
Client Components

Змінюється тільки реалізація:

StorageAdapter

Наприклад:

SupabaseStorageAdapter  
        ↓  
R2StorageAdapter

Media Entity і Repository API залишаються стабільними.

---

## 31. Чого не потрібно створювати на старті

Без реальної необхідності не реалізовувати:

власний CDN  
advanced image processing server  
десятки image variants  
AI image tagging  
complex DAM system  
folder permission system  
automatic video transcoding  
complex media versioning

CMS потрібна якісна Media Library, а не enterprise Digital Asset Management platform.

---

## 32. Фінальна схема

                CMS / Client UI  
                        │  
                        ▼  
                   Media API  
                        │  
                ┌───────┴────────┐  
                ▼                ▼  
        Media Repository     Media Service  
                │                │  
                ▼                ▼  
          Database         Storage Adapter  
                                │  
                                ▼  
                        Supabase Storage

При заміні provider:

Storage Adapter  
      ↓  
Cloudflare R2 / S3

Верхні рівні не змінюються.

---

## 33. Основні правила

1. Фізичний файл і Media Entity є різними сутностями.  
2. Контент посилається на `mediaId`, а не на raw Storage URL.  
3. Усі універсальні Media components та Media Layer знаходяться в CMS Core.  
4. Vue-компоненти не працюють напряму із Supabase Storage.  
5. Supabase Storage використовується через Storage Adapter.  
6. Storage provider повинен бути замінним.  
7. Не створювати зайву кількість buckets.  
8. Media Library є єдиною для CMS та Client Project.  
9. Replace Media і Change Image є різними операціями.  
10. Media usage необхідно відстежувати.  
11. Використаний файл не можна випадково видалити.  
12. Для Media бажано підтримувати soft delete/restore.  
13. Alt може мати global default та usage-specific override.  
14. Decorative images не потребують alt.  
15. Focal Point може мати default та usage override.  
16. Public і private media повинні мати різні access policies.  
17. SVG необхідно обробляти як потенційно небезпечний формат.  
18. Не будувати складний image/video processing pipeline без необхідності.  
19. Media API повинен залишатися незалежним від Supabase-specific structures.  
20. Client-specific entities повинні використовувати загальну Media Library CMS Core.

---

## Ключовий принцип

> CMS працює з Media Entity, а не з фізичним файлом або Supabase URL.

Фізичне зберігання є інфраструктурною деталлю.

Це дозволяє централізовано керувати файлами, відстежувати usage, безпечно виконувати Replace/Delete та в майбутньому змінювати Storage provider без переписування CMS.

**Alt і focal point не зберігаються тільки в Media Library.** Одне й те саме фото може на Home бути декоративним, а на About нести зміст і потребувати alt. Тому Media має default metadata, а конкретне використання `CmsImage` — override (зокрема по мовах).

# Блок 8. Draft / Publish / Revisions Architecture

## 1. Загальний опис

Draft / Publish / Revisions System відповідає за життєвий цикл контенту в CMS.

Основна задача системи — чітко розділити:

* контент, який зараз бачать відвідувачі;  
* контент, який редагує адміністратор;  
* локальні незбережені зміни;  
* збережені чернетки;  
* історичні версії контенту.

Головний принцип:

> Edit Mode ніколи не повинен напряму змінювати опублікований контент.

Користувач редагує Draft.

Лише явна операція `Publish` робить цей Draft новою публічною версією.

---

## 2. Основні рівні стану контенту

Необхідно розділяти щонайменше чотири різні поняття.

| Рівень | Що це |
| ----- | ----- |
| Editor State | Поточні зміни в пам'яті браузера |
| Saved Draft | Збережена чернетка в backend |
| Published Version | Версія, яку бачить публічний сайт |
| Revision | Історично збережена версія контенту |

Ці поняття не повинні змішуватися.

---

## 3. Editor State

Editor State існує тільки під час поточної Edit Mode session.

Наприклад:

Published:  
Hello world

Saved Draft:  
Hello everyone

Current Editor State:  
Hello new world

У цьому випадку користувач ще не зберіг:

Hello new world

Це лише локальний стан Editor Engine.

Саме тут працюють:

Undo  
Redo  
Dirty state  
Local validation

Якщо користувач закриває сторінку без збереження, цей стан може бути втрачений.

---

## 4. Saved Draft

Draft — це збережена в backend робоча версія контенту.

Вона:

* може відрізнятися від Published;  
* не видима звичайним відвідувачам;  
* доступна Edit Mode;  
* може редагуватися багато разів;  
* може існувати довго до моменту Publish.

Наприклад:

Published v5

↓

Draft

↓

10 редакцій протягом дня

↓

Published v6

Не потрібно створювати нову Revision після кожного натискання клавіші.

---

## 5. Published Version

Published Version — єдина версія контенту, яку повинен використовувати Public Runtime.

Публічна сторінка не повинна випадково читати Draft.

Схема:

Public Website  
      ↓  
Published content

Edit Mode:

Edit Mode  
   ↓  
Draft content

Preview:

Preview  
   ↓  
Draft content  
   ↓  
без editor controls

---

## 6. Publish

Publish є окремою бізнес-операцією.

Це не просто:

update page

Publish повинен виконувати логічну послідовність:

Draft  
   ↓  
Permission check  
   ↓  
Validation  
   ↓  
Create Revision  
   ↓  
Update Published Version  
   ↓  
Activity Log  
   ↓  
Cache / revalidation  
   ↓  
Success

Точна транзакційна реалізація визначається під час розробки.

Головне правило:

> Publish повинен або завершитися повністю, або не змінити Published Version взагалі.

Не повинна виникати ситуація, коли частина сторінки вже опублікована, а інша — ні.

---

## 7. Save Draft

`Save Draft` не публікує зміни.

Він лише переносить поточний Editor State:

Browser memory  
      ↓  
Backend Draft

Після успішного збереження:

Unsaved → Saving → Saved

При помилці:

Unsaved → Saving → Error

Published Version при цьому не змінюється.

---

## 8. Autosave

Autosave можна підтримувати, але він не повинен замінювати поняття Draft / Publish.

Рекомендована модель:

користувач змінює поле  
      ↓  
local state  
      ↓  
debounce  
      ↓  
autosave Draft

Наприклад, через кілька секунд після останньої зміни.

Але кнопка `Save Draft` все одно може залишатися як:

* явна дія;  
* ручне гарантоване збереження;  
* зрозумілий UX для користувача.

Autosave не повинен виконувати Publish.

---

## 9. Dirty State

Editor Engine повинен централізовано знати:

isDirty

Dirty означає:

> Поточний Editor State відрізняється від останнього Saved Draft.

Не потрібно визначати dirty state окремо в кожному компоненті.

При успішному Save Draft:

isDirty = false

Після нової зміни:

isDirty = true

---

## 10. Вихід із Edit Mode

Якщо користувач виходить із Edit Mode і:

isDirty = false

вихід відбувається без додаткового confirmation.

Якщо:

isDirty = true

показується confirmation:

Save and exit  
Leave without saving  
Cancel

`Leave without saving` відкидає лише локальний Editor State.

Останній Saved Draft залишається в backend.

---

## 11. Preview

Preview використовує Draft, але не показує Editor UI.

Тобто:

Draft  
   ↓  
Preview Renderer

Preview потрібен для перевірки:

* layout;  
* responsive behavior;  
* текстів;  
* зображень;  
* navigation;  
* фактичного вигляду сторінки перед Publish.

Preview не повинен змінювати Published Version.

---

## 12. Revisions

Revision — це незмінна історична версія контенту.

На відміну від Draft, Revision після створення не редагується.

Наприклад:

Revision 1  
Revision 2  
Revision 3  
Revision 4

Revision може містити snapshot стану контенту на конкретний момент.

Основні причини створення Revision:

Publish  
Manual restore  
Critical saved checkpoint

Для першої версії достатньо гарантовано створювати Revision під час Publish.

Не потрібно створювати Revision на кожний autosave.

---

## 13. Revision snapshot

Revision повинна дозволяти відновити конкретний стан контенту.

Тому вона повинна зберігати достатньо даних для Restore.

Наприклад логічно:

Page  
Published v7  
      ↓  
Revision snapshot

Точний формат snapshot визначається під час реалізації.

Допускається використання JSON для Revision snapshot, тому що Revision є історичним snapshot, а не основною операційною моделлю даних.

Це один із випадків, де JSON може бути виправданим.

---

## 14. Restore

Restore не повинен напряму переписувати Published Version.

Рекомендований flow:

Revision v3  
     ↓  
Restore  
     ↓  
створити / оновити Draft  
     ↓  
користувач перевіряє  
     ↓  
Publish  
     ↓  
нова Published Version

Таким чином історія не переписується.

Наприклад:

v1  
v2  
v3  
v4  
v5

Restore v3  
    ↓  
Draft based on v3  
    ↓  
Publish  
    ↓  
v6

`v4` і `v5` залишаються в History.

Це дуже важливий принцип.

---

## 15. Reset Field

Окреме поле може бути повернуте до Published Version.

Наприклад:

Published title:  
Hello

Draft title:  
Hello new world

Reset:

Draft title → Hello

Це не змінює Published Version.

Reset є звичайною зміною Draft і повинен:

* потрапляти в Undo/Redo;  
* змінювати dirty state;  
* проходити validation.

---

## 16. Reset Page

Може існувати дія:

Reset Draft to Published

Вона:

Current Draft  
     ↓  
delete/replace  
     ↓  
copy Published  
     ↓  
new Draft

Оскільки дія потенційно знищує значну кількість незавершених змін, потрібне confirmation.

---

## 17. Undo / Redo і Revisions — різні системи

Це принципово.

#### Undo / Redo

Працює в поточній browser/editor session.

Приклад:

Change title  
Change image  
Delete card  
Undo  
Redo

Швидка локальна система.

#### Revisions

Працюють у backend.

Приклад:

Published yesterday  
Published 2 days ago  
Published last week

Використовуються для довготривалого Restore.

Не потрібно намагатися використовувати одну систему для обох задач.

---

## 18. Draft і Undo / Redo

При Save Draft Undo/Redo не обов'язково повинні очищатися.

Наприклад:

Change title  
Change image  
Save Draft  
Change button  
Undo

Undo може повернути зміну кнопки.

Але при:

Publish

можна вважати це логічною межею editor session і очистити або перебудувати локальну history.

Точну UX-поведінку можна визначити під час реалізації.

---

## 19. Один Draft на контент

Для першої версії не потрібно створювати окремий Draft для кожного користувача.

Рекомендована модель:

Page  
 ├── Published  
 └── Draft

Тобто існує одна спільна робоча чернетка.

Якщо Editor A змінив Draft, Editor B після оновлення бачить цю саму чернетку.

Це значно простіше.

---

## 20. Чому не робити персональні Draft

Модель:

Draft Igor  
Draft Lesha  
Draft Anna

дуже швидко створює питання:

Хто публікує?  
Який draft правильний?  
Як merge changes?  
Що показувати Preview?  
Що робити з конфліктами?

Для CMS сайтів це зайва складність.

Якщо в майбутньому з'явиться потреба в collaborative editing, її можна реалізувати окремо.

---

## 21. Concurrent Editing

Навіть із одним Draft потрібно врахувати сценарій:

Editor A відкрив сторінку  
Editor B відкрив ту саму сторінку

На першому етапі не потрібно будувати Google Docs.

Основний concurrency mechanism — **Content Lock**: одна entity → один active editor, heartbeat, expiration, read-only для інших (див. розділ «Concurrent Editing / Content Lock» нижче в цьому блоці).

Version / conflict checking (наприклад, Draft має `version` / `updated_at`) може використовуватися лише як додаткова страховка, не як основний механізм.

---

## 22. Editing Lock

Повна модель — розділ «Concurrent Editing / Content Lock» нижче. Soft presence без lock не використовується як основний механізм; realtime collaboration — лише якщо реально знадобиться.

---

## 23. Draft для різних мов

Мови не повинні вимагати повністю незалежної системи Draft.

Логічно:

Page Draft  
   ├── uk translation  
   ├── en translation  
   └── de translation

або еквівалентна relational модель.

Тобто Draft належить контентній сутності, а translations є частиною її draft state.

При цьому кожна мова може мати власний translation status.

Наприклад:

UK → ready  
EN → draft  
DE → outdated

Детальніше multilingual logic описується в окремому Localization Block.

---

## 24. Publish і мови

Не обов'язково вимагати, щоб усі мови були готові одночасно.

Архітектура повинна дозволяти визначити policy.

Наприклад:

Publish entire page

або в майбутньому:

Publish UK  
Publish EN

Для першої версії бажано залишити модель максимально простою.

Конкретне рішення буде деталізовано в Localization Architecture.

---

## 25. Draft для Collections

Та сама концепція повинна працювати не тільки для Pages.

Наприклад:

Product  
Blog Post  
Case  
Doctor  
Service

можуть мати:

Published  
Draft  
Revisions

якщо для конкретного Content Type увімкнено publishing workflow.

Repository API повинен приховувати конкретну реалізацію.

Наприклад:

productsRepository.saveDraft()  
productsRepository.publish()

---

## 26. Не всі сутності потребують Draft

Не потрібно автоматично застосовувати Draft/Publish до всіх таблиць CMS.

Наприклад:

Activity Log  
Form Submission  
User Invitation

не потребують Draft.

Draft/Publish використовується для контенту, де реально існує поняття:

work in progress  
vs  
public version

---

## 27. Activity Log

Не кожну editor operation потрібно відправляти в Activity.

Наприклад, не потрібно створювати:

Igor changed letter H  
Igor changed letter e  
Igor changed letter l

Activity повинна фіксувати meaningful operations.

Наприклад:

Draft saved  
Page published  
Revision restored  
Draft reset

Детальна Activity Architecture буде описана окремо.

---

## 28. Validation перед Save Draft

Draft може бути неповним.

Тому Save Draft не повинен вимагати повну publish-validation.

Наприклад:

Hero title required

може бути тимчасово порожнім у Draft.

Draft все одно можна зберегти.

При цьому UI показує validation error.

---

## 29. Validation перед Publish

Publish має суворішу validation.

Перед Publish перевіряються:

required fields  
broken links  
required image alt  
content limits  
required collections  
SEO requirements, якщо blocking

Blocking errors не дозволяють Publish.

Warnings можуть дозволяти.

---

## 30. Publish transaction

Publish повинен бути максимально атомарною операцією.

Умовно:

BEGIN

validate draft

create revision snapshot

copy/promote draft to published

> ⚠ Відкрите рішення — що саме знімає revision: нову версію, що публікується (тоді перша публікація теж має ревізію і поточну published-версію можна відновити), чи попередню. Див. `docs/MASTER_PLAN.md`, реєстр (епік 007). Атомарність забезпечується Postgres-функцією (RPC); cache revalidation виконується після COMMIT, не всередині транзакції.

update publish metadata

create activity event

COMMIT

Якщо щось падає:

ROLLBACK

Published Version повинна залишитися старою і робочою.

Точну реалізацію може визначити backend.

---

## 31. Що бачить Public Runtime

Public Runtime повинен отримувати лише Published content.

Не потрібно передавати browser:

draft  
revision history  
editor metadata

звичайному відвідувачу.

Це важливо для:

* безпеки;  
* performance;  
* передбачуваності;  
* SEO.

---

## 32. Cache invalidation після Publish

Якщо публічний сайт використовує SSR cache, prerender або інший caching layer, Publish повинен мати можливість повідомити систему:

Page X changed

Після цього відбувається:

cache invalidation  
revalidation

Конкретна caching implementation визначається пізніше.

Publish API не повинен бути жорстко прив'язаний до конкретного hosting provider.

---

## 33. Draft persistence

Draft повинен зберігатися в backend, а не тільки в LocalStorage.

LocalStorage можна використовувати лише як додатковий recovery-механізм у майбутньому.

Не рекомендується робити його основним storage для Draft.

Причини:

* інший пристрій;  
* інший браузер;  
* декілька CMS users;  
* очищення browser storage.

Backend є source of truth для Saved Draft.

---

## 34. Recovery після network error

Якщо Save Draft не вдався:

Editor State

не повинен очищатися.

Користувач бачить:

Save failed  
Retry

і продовжує мати локальні зміни.

Не можна показувати `Saved`, поки backend реально не підтвердив операцію.

---

## 35. Revision retention

Не потрібно зберігати нескінченну кількість revisions безконтрольно.

Архітектура повинна дозволяти retention policy.

Наприклад:

last 50 revisions

або:

revisions for N months

Але конкретний ліміт краще визначити пізніше.

Для важливих revisions у майбутньому можна підтримати:

protected revision

яка не видаляється автоматичним cleanup.

---

## 36. Revision metadata

Revision повинна дозволяти показати History UI.

Наприклад:

Published by Anna  
August 7, 15:24  
"Updated Hero and Services"

Тому revision має бути пов'язана з:

content entity  
user  
timestamp  
revision type

Точні поля визначаються при реалізації.

---

## 37. Repository API

Draft/Publish logic повинна проходити через Data Layer.

Наприклад:

pagesRepository.getPublished()  
pagesRepository.getDraft()  
pagesRepository.saveDraft()  
pagesRepository.publish()  
pagesRepository.getRevisions()  
pagesRepository.restoreRevision()

UI не повинен самостійно маніпулювати таблицями Draft та Revision.

---

## 38. Backend independence

Як і весь Data Layer, Draft/Publish API не повинен бути Supabase-specific.

Сьогодні:

Repository  
   ↓  
Supabase

У майбутньому:

Repository  
   ↓  
NestJS API

Edit Mode не повинен змінитися.

---

## 39. Фінальна схема

                   Editor Session  
                         │  
                         ▼  
                    Local State  
                         │  
                    Undo / Redo  
                         │  
                         ▼  
                    Save Draft  
                         │  
                         ▼  
                     Draft  
                         │  
           ┌─────────────┴─────────────┐  
           │                           │  
        Preview                     Publish  
                                       │  
                                  Validation  
                                       │  
                                  Revision  
                                       │  
                                  Published  
                                       │  
                                       ▼  
                                Public Website

Restore:

Revision  
   ↓  
Restore  
   ↓  
Draft  
   ↓  
Preview  
   ↓  
Publish  
   ↓  
New Revision / Published Version

---

## 40. Основні правила

1. Edit Mode ніколи не редагує Published content напряму.  
2. Local Editor State, Saved Draft, Published Version та Revision — різні сутності.  
3. Public Runtime читає тільки Published content.  
4. Preview читає Draft.  
5. Save Draft не виконує Publish.  
6. Autosave зберігає тільки Draft.  
7. Draft може містити validation errors.  
8. Publish вимагає повну blocking validation.  
9. Publish є окремою атомарною бізнес-операцією.  
10. Revision є immutable historical snapshot.  
11. Revision не створюється на кожну маленьку зміну.  
12. Мінімально Revision створюється при Publish.  
13. Restore Revision створює Draft, а не напряму змінює Published.  
14. Undo/Redo працює окремо від Revisions.  
15. Для однієї контентної сутності на старті використовується один спільний Draft.  
16. Не створювати персональні Draft для кожного редактора без реальної потреби.  
17. Concurrent editing захищається через Content Lock; version/conflict checking — лише додаткова страховка.  
18. Не потрібно одразу будувати Google Docs-style realtime collaboration.  
19. Saved Draft зберігається в backend.  
20. Network error не повинен знищувати локальні зміни.  
21. Draft/Publish workflow використовується тільки для сутностей, яким він реально потрібен.  
22. Усі Draft/Publish operations проходять через Repository/Data Layer.  
23. API Draft/Publish не повинен залежати від Supabase.  
24. Publish повинен мати можливість запускати cache revalidation.  
25. Історія не переписується: Restore старої версії створює нову майбутню версію.

---

## Ключовий принцип

> Published content є стабільною версією сайту для відвідувачів. Будь-яка робота редактора відбувається окремо в Draft і потрапляє на сайт лише після успішної явної операції Publish.

Система повинна дозволяти користувачу експериментувати, зберігати незавершену роботу, переглядати Preview, повертатися до старих версій та виправляти помилки без ризику випадково змінити живий сайт.

## Concurrent Editing / Content Lock

CMS не повинна дозволяти двом користувачам одночасно редагувати одну й ту саму контентну сутність.

Наприклад, якщо User A вже відкрив сторінку `Home` в Edit Mode, User B не повинен мати можливість почати редагування цієї ж сторінки до завершення сесії User A.

Для цього використовується **Content Lock**.

Блокування працює на рівні контентної сутності:

Page  
Product  
Blog Post  
Case  
Service

а не на рівні окремого поля.

Тобто не потрібно реалізовувати складну систему:

User A edits Hero  
User B edits Services  
User C edits Footer

Для першої версії це створює зайву складність.

Використовується проста модель:

> One content entity → one active editor.

---

### Початок редагування

Коли користувач відкриває сутність у Edit Mode:

User A  
   ↓  
Open Home  
   ↓  
Check active lock  
   ↓  
No lock  
   ↓  
Create lock  
   ↓  
Editing allowed

Lock пов'язаний щонайменше з:

content entity  
user  
editor session  
expiration / heartbeat

Точні поля визначаються під час реалізації.

---

### Якщо сутність уже редагується

Наприклад:

Home  
Locked by Anna

Другий користувач може відкрити сторінку, але не повинен отримати право редагування.

UI показує повідомлення:

Anna is currently editing this page.

Додатково можна показати:

Editing since 16:42

Сторінку при цьому бажано дозволити відкрити в read-only / preview mode.

Тобто:

User B  
   ↓  
Open Home  
   ↓  
Existing lock  
   ↓  
Read-only

Це краще, ніж повністю блокувати перегляд сторінки.

---

### Lock не повинен бути вічним

Не можна просто створити:

is_locked = true

і чекати, поки користувач вручну вийде.

Сценарії:

* браузер упав;  
* ноутбук вимкнувся;  
* пропав інтернет;  
* вкладка була закрита;  
* користувач просто пішов.

Тому lock повинен мати timeout.

Editor session періодично надсилає heartbeat:

Editor  
   ↓  
heartbeat  
   ↓  
Lock still active

Наприклад:

кожні ~30–60 секунд

Точний interval визначається під час реалізації.

---

### Expiration

Якщо heartbeat перестав приходити:

last heartbeat  
      ↓  
timeout exceeded  
      ↓  
lock expires

Після цього інший користувач може почати редагування.

Наприклад, lock може вважатися stale після декількох хвилин без heartbeat.

Не потрібно прив'язуватися до конкретного числа на рівні архітектури — значення може бути configurable.

---

### Нормальне завершення Edit Mode

При:

Save and exit  
Leave without saving  
Exit Edit Mode

CMS повинна явно звільнити lock.

Flow:

Editor exits  
   ↓  
release lock  
   ↓  
entity available

Не потрібно чекати expiration, якщо session завершилася нормально.

---

### Закриття вкладки

Frontend може спробувати повідомити backend про завершення session.

Але ця логіка не повинна бути єдиним механізмом звільнення lock.

Browser event не гарантується.

Тому heartbeat \+ expiration залишаються обов'язковими.

---

### Захист від race condition

Перевірка:

Is page locked?

і створення lock не повинні бути двома незалежними ненадійними операціями.

Можлива ситуація:

User A checks → free  
User B checks → free

User A creates lock  
User B creates lock

Тому backend/database повинен гарантувати, що для конкретної entity може існувати лише один active lock.

Точна реалізація може використовувати:

* database constraint;  
* transaction;  
* atomic function;  
* інший backend locking mechanism.

Це повинно гарантуватися backend, а не тільки UI.

---

### Lock і permissions

Для створення lock користувач повинен мати permission на редагування відповідної сутності.

Наприклад, для сторінок:

pages.edit

Read-only користувач не створює lock.

---

### Owner/Admin override

Може існувати адміністративна операція:

Force unlock

Наприклад, Owner бачить:

This page is locked by Anna.

і за необхідності може виконати:

Force unlock

Ця операція повинна бути доступна тільки користувачам із відповідним permission.

Потрібне confirmation, оскільки інший користувач може реально працювати зі сторінкою.

---

### Що відбувається з першим Editor після Force Unlock

Якщо Owner примусово забрав lock, старий Editor не повинен продовжувати спокійно зберігати зміни.

При наступному:

heartbeat  
save  
autosave  
publish

backend перевіряє:

Does this session still own the lock?

Якщо ні:

save rejected

UI показує:

Your editing session is no longer active.  
Another user may have taken control of this page.

Локальні зміни не повинні автоматично зникати, щоб користувач міг хоча б скопіювати їх або виконати recovery.

---

### Lock має перевірятися при Save та Publish

Недостатньо перевірити lock лише при відкритті Edit Mode.

Кожна критична mutation:

Save Draft  
Autosave  
Publish  
Restore  
Reset

повинна перевірити, що поточна editor session досі є owner активного lock.

Таким чином старий browser session не зможе перезаписати нову роботу.

---

### Рівень блокування

Для першої версії використовується **entity-level locking**.

Наприклад:

Home Page → locked

але:

About Page → free  
Products → free

User A може редагувати Home.

User B одночасно може редагувати About.

User C може редагувати конкретний Product.

Блокується не вся CMS, а тільки конкретна сутність.

---

### Collections

Для collection records lock працює на рівні конкретного запису.

Наприклад:

Products

Product A → User A  
Product B → User B  
Product C → free

Не потрібно блокувати всю колекцію Products через редагування одного Product.

Якщо ж редагується сама структура Collection Type, це вже може бути окрема сутність із власним lock.

---

### Lock і Public Website

Content Lock стосується тільки CMS editing.

Він ніяк не впливає на Public Website.

Наприклад:

Home Published v5

продовжує нормально показуватися відвідувачам, навіть якщо:

Home Draft

зараз locked і редагується.

---

### Lock і Preview

Користувач, який володіє lock, бачить Preview свого Draft.

Інші CMS-користувачі за потреби можуть бачити read-only Preview, але не повинні змінювати Draft.

---

### Lock і різні мови

За замовчуванням lock накладається на всю контентну сутність, а не на окрему мову.

Наприклад:

Home  
├── UK  
├── EN  
└── DE

якщо User A редагує Home українською, User B не починає одночасно редагувати Home англійською.

Це трохи обмежує паралельність, але значно спрощує:

* Draft;  
* Publish;  
* History;  
* collections;  
* validation;  
* revisions.

Якщо колись редакторів стане багато, lock можна буде зробити більш granular.

На першій версії це не потрібно.

---

### Фінальна схема

User A  
   ↓  
Open Page  
   ↓  
Acquire Lock  
   ↓  
Edit  
   ↓  
Heartbeat  
   ↓  
Save / Publish  
   ↓  
Exit  
   ↓  
Release Lock

Другий користувач:

User B  
   ↓  
Open same Page  
   ↓  
Lock exists  
   ↓  
Read-only mode  
   ↓  
"Currently edited by User A"

Якщо User A зник:

heartbeat stops  
   ↓  
lock expires  
   ↓  
User B can acquire lock

---

### Основні правила Content Lock

1. Одну сутність одночасно редагує тільки один користувач.  
2. Lock працює на рівні entity, а не окремого поля.  
3. Різні сторінки та записи можуть редагуватися паралельно різними користувачами.  
4. Другий користувач може переглядати locked entity, але тільки read-only.  
5. Lock створюється backend атомарно.  
6. Frontend не є джерелом правди про lock.  
7. Editor session періодично надсилає heartbeat.  
8. Lock автоматично expires, якщо heartbeat зник.  
9. При нормальному виході lock звільняється одразу.  
10. Save Draft, Autosave та Publish перевіряють ownership lock.  
11. Owner/Admin може мати Force Unlock permission.  
12. Після Force Unlock стара session більше не може зберігати або публікувати.  
13. Public Website не залежить від Content Lock.  
14. Для першої версії мови однієї сутності використовують спільний lock.  
15. Не реалізовувати collaborative real-time editing або merge Draft'ів без реальної потреби.

# Блок 9. Localization Architecture

## 1. Загальний опис

Localization Architecture відповідає за підтримку мультимовності в CMS Core та Client Project.

Основний принцип системи:

> Перекладається не структура сторінки, а бізнес-дані.

CMS не є Page Builder.

Структура сторінки повністю визначається Vue/Nuxt компонентами у Client Project.

CMS лише зберігає контент, який відображається цими компонентами.

---

## 2. Основний принцип

Кожна бізнес-сутність може мати:

* локалізовані поля;  
* нелокалізовані поля.

Наприклад Product.

Не перекладаються:

* id;  
* status;  
* active;  
* sort_order;  
* created_at;  
* updated_at;  
* seo flags;  
* media relations.

`slug` живе в translation-таблиці (Summary §21). Якщо проєкту потрібен один slug для всіх мов, у кожному перекладі зберігається те саме значення. Права доступу не є полем запису.

Перекладаються:

* title;  
* description;  
* short_description;  
* seo_title;  
* seo_description;  
* button_text;  
* будь-який інший текстовий контент.

---

## 3. Структура даних

Для кожної локалізованої бізнес-сутності використовується дві таблиці.

Наприклад:

products

та

product_translations

---

## 4. Основна таблиця

Основна таблиця містить бізнес-дані, які однакові для всіх мов.

Наприклад:

Product

id

status

active

price

sort_order

category_id

image_id

created_at

updated_at

---

## 5. Таблиця перекладів

Translation table містить лише локалізований контент.

Концептуально:

Product Translation

id

product_id

locale

title

description

seo_title

seo_description

...

Точний набір полів визначається під час реалізації.

---

## 6. Один Product — багато перекладів

Зв'язок виглядає так:

Product

↓

UK Translation

↓

EN Translation

↓

PL Translation

↓

DE Translation

Кожен переклад є окремим записом.

---

## 7. Чому саме так

Цей підхід має кілька переваг.

#### Не дублюються бізнес-дані

Не потрібно копіювати:

* статус;  
* категорію;  
* медіа;  
* сортування;  
* зв'язки.

Вони існують лише один раз.

---

#### Просте додавання нової мови

Якщо власник сайту додає:

French

не потрібно змінювати структуру таблиць.

Додаються лише нові записи перекладів.

---

#### Масштабованість

Система однаково працює для:

2 мови

10 мов

25 мов

Без зміни схеми бази даних.

---

## 8. Додавання мов

Перелік активних мов визначається через Admin Panel.

Наприклад:

Settings

↓

Languages

Owner може:

* додати нову мову;  
* вимкнути мову;  
* змінити default locale.

CMS автоматично починає працювати з новою мовою.

---

## 9. Default Locale

Кожен сайт має одну основну мову.

Наприклад:

uk

Вона використовується:

* при створенні нового контенту;  
* якщо переклад відсутній;  
* як основний fallback.

---

## 10. Fallback

Якщо переклад відсутній:

PL

CMS може повернути:

UK

або іншу fallback language.

Політика fallback визначається Project Config.

---

## 11. Repository Layer

Frontend не працює напряму з translation tables.

Використовується Repository.

Наприклад:

const { products } = useProducts()

Repository сам:

* визначає locale;  
* отримує потрібний translation;  
* повертає готову модель.

UI не знає про існування `product_translations`.

---

## 12. Бізнес-модель

Client Project працює з моделлю:

product.title  
product.description

а не:

product.translation.title

або

product.translations\[0\]

Repository приховує внутрішню структуру бази.

---

## 13. Edit Mode

Edit Mode працює тільки з поточною мовою.

Наприклад:

UA

↓

редагуються тільки українські поля.

При перемиканні:

EN

відкривається англійський переклад.

Структура сторінки при цьому не змінюється.

---

## 14. Колекції

Collections працюють аналогічно.

Наприклад:

Product

↓

Product Translation

Case

↓

Case Translation

Blog Post

↓

Blog Translation

Архітектура однакова для всіх бізнес-сутностей.

---

## 15. Local Collections

Якщо компонент містить локальну repeatable collection.

Наприклад:

Hero

↓

Benefits

↓

Benefit Item

то кожен item також може мати власний переклад.

Але це вже частина моделі конкретної бізнес-сутності.

Не потрібно створювати окрему універсальну translation system для вкладених масивів.

---

## 16. Media

Media не перекладається.

Але можуть перекладатися:

* alt;  
* title;  
* caption.

Для цього використовується аналогічний translation pattern.

Сам файл залишається один.

---

## 17. SEO

SEO також локалізується.

Наприклад:

SEO Title

SEO Description

OG Description

Тому вони належать Translation Table.

---

## 18. Slug

Архітектура повинна підтримувати два сценарії.

#### Один slug

Наприклад:

/product/iphone

для всіх мов.

#### Локалізований slug

Наприклад:

/uk/telefon

/en/phone

/pl/telefon

Конкретна політика визначається Client Project.

---

## 19. Додавання нової мови

Коли Owner додає нову мову:

CMS:

* додає locale;  
* створює порожні translation records за потребою;  
* або створює їх під час першого редагування.

Точна стратегія визначається під час реалізації.

---

## 20. Що не потрібно робити

Не потрібно:

* дублювати всю таблицю для кожної мови;  
* створювати окрему базу даних;  
* зберігати всі мови одним JSON у полі;  
* прив'язувати локалізацію до структури сторінки;  
* створювати Page Builder лише заради перекладів.

---

## 21. Основні правила

1. Перекладається контент, а не структура сторінки.  
2. CMS не є Page Builder.  
3. Бізнес-дані та переклади зберігаються окремо.  
4. Translation Table містить тільки локалізовані поля.  
5. Основна таблиця містить тільки бізнес-логіку.  
6. Repository приховує всю логіку локалізації від Client Project.  
7. Frontend працює із звичайною бізнес-моделлю.  
8. Нові мови додаються без зміни структури бази.  
9. Media не дублюється між мовами.  
10. Edit Mode редагує лише поточну locale.  
11. Collections використовують ту саму архітектуру.  
12. Localization повинна масштабуватися без перебудови системи.

---

## 22. Доповнення з ранньої версії блоку (v1)

Рання версія цього блоку видалена. Нижче — її правила, які не суперечать v2 і Summary §21 та залишаються в силі.

**Languages**

* `languages` — окрема сутність і source of truth: code, name, native name, active, default, order.  
* Рівно одна default locale, і вона завжди active. Зміна default — з підтвердженням.  
* Мова не видаляється фізично — лише вимикається і може бути повторно активована.  
* CMS UI language (мова адмінки) і site languages — різні речі й не змішуються.

**Дані та URL**

* Колонки на кшталт `title_uk` / `title_en` не використовуються.  
* Slug унікальний у межах locale (і батьківського route context, якщо він є).  
* SEO-поля живуть на рівні перекладу.  
* Core віддає дані для hreflang / canonical лише для опублікованих перекладів; URL-схему (prefix, domain тощо) реалізує Client Project.  
* Fallback-політика задається в Project Config; за замовчуванням мови мовчки не змішуються.  
* Переклад створюється lazy — при першому редагуванні цієї мови.

**Edit Mode, Lock, Revisions**

* Editor Context має `currentLocale`; при перемиканні мови selected field зберігається.  
* Validation перевіряє поля тієї locale, яка публікується.  
* Lock — на всю entity, незалежно від locale.

**Settings і Navigation**

* Settings діляться на мовонезалежні (contacts, social URLs) і локалізовані (тексти).  
* Структура навігації спільна, labels локалізовані.

**Статуси перекладу**

* Статус перекладу виводиться з даних (є draft / є published / перекладу немає), а не ведеться вручну.  
* Ручні статуси (`not_started` / `ready` / `outdated`) і автоматичне визначення `outdated` — не у V1.

> ⚠ Відкриті рішення — Publish на entity чи на entity × locale; спільна чи per-locale структура local repeatable масивів; рівні alt (media default / usage override / per locale). Див. `docs/MASTER_PLAN.md`, реєстр (епік 010).

---

## Ключовий принцип

> **Localization є властивістю бізнес-даних, а не сторінки.**

Vue/Nuxt відповідає за структуру та рендеринг сторінки. CMS Core відповідає лише за зберігання та отримання локалізованого контенту. Repository Layer приховує внутрішню структуру локалізації, тому Client Project працює з моделями так само просто, як і без мультимовності.

# Блок 10. Configuration System

## 1. Загальний опис

Configuration System відповідає за всі налаштування CMS Core і конкретного Client Project.

Основна задача — чітко розділити різні типи конфігурації, щоб не змішувати в одному місці:

* архітектурні можливості CMS;  
* налаштування конкретного сайту;  
* секретні ключі;  
* службову інформацію CMS;  
* налаштування, які змінює адміністратор через Admin Panel.

Не повинно існувати одного великого універсального `config`, який відповідає за все.

Рекомендована модель складається з чотирьох основних рівнів:

| Рівень | Джерело | Хто змінює |
| ----- | ----- | ----- |
| CMS Core Defaults | CMS Core package | CMS Core developer |
| Project Config | `cms.config.ts` | Developer |
| Runtime Settings | Backend / Database | CMS Admin |
| Environment Config | `.env` / hosting environment | Developer / DevOps |

Додатково може існувати службовий Project Manifest.

---

## 2. CMS Core Defaults

CMS Core повинен мати власні default settings.

Наприклад, Core може визначати:

default editor behavior  
default feature settings  
default limits  
default UI behavior  
default module configuration

Ці значення знаходяться всередині:

nuxt-cms-core

і є fallback-конфігурацією.

Client Project не повинен копіювати цей config.

При оновленні CMS Core default values можуть оновлюватися разом із пакетом.

---

## 3. Project Config

Client Project повинен мати один зрозумілий config-файл.

Наприклад:

cms.config.ts

Це конфігурація, яку визначає розробник.

Вона описує **можливості конкретного проєкту**, а не його поточний контент.

Приклад концептуально:

export default defineCmsConfig({  
  modules: {  
    forms: true,  
    analytics: true,  
    integrations: true,  
  },

  editor: {  
    historyLimit: 50,  
  },

  features: {  
    multilingual: true,  
  },  
})

Точний API визначається під час реалізації.

`editor.historyLimit` — розмір локального Undo stack, не server History.

> ⚠ Відкрите рішення — чи `features.multilingual` лише вмикає модуль локалізації, а саме вмикання мультимовності для сайту — runtime-налаштування (Settings → Languages), чи «мов більше однієї» вже означає multilingual. Нова мова не повинна вимагати deployment (Summary §21). Див. `docs/MASTER_PLAN.md` (епік 010).

---

## 4. Що повинно знаходитися в `cms.config.ts`

Project Config підходить для речей, які:

* визначає розробник;  
* не повинні випадково змінюватися адміністратором;  
* впливають на доступні можливості CMS або Client Project;  
* можуть впливати на build/runtime architecture.

Наприклад:

доступні CMS modules  
feature flags  
registered content types  
registered extensions  
editor capabilities  
project-specific CMS hooks  
storage/backend provider selection  
technical limits

---

## 5. Що НЕ повинно знаходитися в `cms.config.ts`

Не потрібно жорстко записувати туди:

site name  
phone  
logo  
active languages  
navigation  
SEO title  
social links  
maintenance mode  
client email

якщо ці значення повинні змінюватися адміністратором без нового deployment.

Такі дані належать Runtime Settings.

---

## 6. Runtime Settings

Runtime Settings зберігаються в backend.

На першому етапі:

Supabase

Адміністратор змінює їх через:

Admin → Settings

Наприклад:

Site Name  
Logo  
Favicon  
Contacts  
Navigation  
SEO  
Social links  
Languages  
Maintenance Mode  
Brand settings

Зміна Runtime Settings не повинна вимагати:

Git commit  
npm build  
deployment  
migration

---

## 7. Runtime Settings не обов'язково одна таблиця

Не потрібно створювати один великий JSON:

site_settings = {  
  languages: \[...\],  
  navigation: \[...\],  
  integrations: {...},  
  seo: {...},  
  ...  
}

Якщо дані є окремою бізнес-сутністю, вони повинні мати власну модель.

Наприклад:

languages  
navigation_items  
integrations

можуть бути окремими таблицями.

А прості глобальні значення можуть знаходитися в:

site_settings

Наприклад:

site name  
contact email  
phone  
maintenance mode

Точна database structure визначається в процесі реалізації.

---

## 8. Основне правило Runtime Settings

Питання для визначення місця налаштування:

> Чи повинен менеджер сайту мати можливість змінити це через Admin Panel без участі розробника?

Якщо відповідь:

YES

це найчастіше Runtime Setting.

Якщо:

NO

і параметр визначає технічну можливість застосунку — він належить Project Config.

---

## 9. Environment Config

Секрети та environment-specific значення зберігаються окремо.

Наприклад:

SUPABASE_URL=  
SUPABASE_KEY=  
SUPABASE_SECRET=  
SMTP_PASSWORD=  
STRIPE_SECRET=  
TELEGRAM_SECRET=

Environment Config не є CMS Settings.

Admin Panel не повинна отримувати доступ до server secrets.

---

## 10. Public та Private Environment Variables

Потрібно чітко розділяти:

Public environment

і:

Server-only environment

Public config може потрапляти в browser.

Наприклад:

public API URL  
public Supabase project URL

Server-only:

service role key  
payment secrets  
SMTP credentials  
private API tokens

Server-only secrets ніколи не повинні передаватися client bundle.

---

## 11. Nuxt Runtime Config

Environment values бажано централізувати через Nuxt Runtime Config.

Тобто application code не повинен хаотично читати:

process.env.X  
process.env.Y  
process.env.Z

у десятках файлів.

Використовується централізована конфігурація Nuxt.

Це дозволяє чітко розділити:

server runtime config  
public runtime config

---

## 12. Final CMS Configuration

CMS Core може формувати фінальний конфіг на основі декількох джерел.

Логічно:

CMS Core Defaults  
        ↓  
Project Config  
        ↓  
Runtime Settings  
        ↓  
Effective CMS State

Але Runtime Settings не повинні безконтрольно override будь-який technical config.

Наприклад, якщо:

cms.config.ts  
forms = false

адміністратор не повинен мати можливість через Database самостійно увімкнути Forms module, якщо цей модуль технічно не підключений.

---

## 13. Capability System

UI не повинен постійно напряму перевіряти:

config.modules.forms  
settings.formsEnabled  
user.permissions...

краще мати централізований capability API.

Наприклад:

cms.can('forms')  
cms.can('analytics')  
cms.can('multilingual')

або аналогічний механізм.

Capability може враховувати одночасно:

Project Config  
Runtime Settings  
User Permissions  
Feature availability

Наприклад:

Forms module exists  
\+  
Forms enabled for this project  
\+  
User has permission  
=  
Forms available

---

## 14. Config API

Компоненти не повинні знати, з якого конкретно джерела прийшло налаштування.

Можливий централізований API:

const cms = useCms()

cms.config  
cms.settings  
cms.capabilities

Наприклад:

cms.config.modules.forms  
cms.settings.siteName  
cms.capabilities.can('forms.manage')

Точний API визначається під час реалізації.

---

## 15. Config Loading

Project Config доступний відразу як частина застосунку.

Runtime Settings завантажуються з backend.

Не потрібно робити окремий database request для кожного компонента.

Рекомендована модель:

Application initialization  
        ↓  
load runtime settings  
        ↓  
normalize  
        ↓  
store/cache  
        ↓  
components consume settings

---

## 16. Runtime Settings Cache

Глобальні settings змінюються нечасто.

Тому не потрібно завантажувати їх заново в кожному компоненті.

Можна використовувати:

SSR data  
Nuxt caching  
shared application state

Конкретний caching mechanism визначається пізніше.

Після зміни Settings кеш повинен бути invalidated або оновлений.

---

## 17. Configuration Validation

Project Config повинен мати TypeScript typing.

Наприклад, якщо розробник пише:

modules: {  
  forms: 'yes'  
}

TypeScript повинен показати помилку.

Runtime Settings також повинні проходити validation перед використанням.

Не можна вважати будь-які дані з database автоматично валідними.

---

## 18. Default Values

Якщо необов'язкове runtime setting відсутнє, CMS може використовувати default value.

Наприклад:

maintenance mode → false

Але для критичних значень не потрібно мовчки вигадувати fallback.

Наприклад, якщо для роботи інтеграції обов'язково потрібен API key, UI повинен показати:

Integration is not configured

а не намагатися працювати з порожнім значенням.

---

## 19. Module Configuration

Окремі модулі CMS можуть мати власний config namespace.

Наприклад концептуально:

modules: {  
  forms: {  
    enabled: true  
  },

  analytics: {  
    enabled: true  
  }  
}

Але не потрібно робити складну plugin configuration system без реальної потреби.

На першому етапі достатньо простого структурованого object.

---

## 20. Client-specific configuration

Client Project повинен мати можливість додати власну technical configuration.

Наприклад:

custom collection behavior  
project-specific feature  
custom API endpoint  
specific CMS extension

Ці значення не потрібно додавати в CMS Core тільки через те, що вони потрібні одному клієнту.

Project Config є правильним місцем для подібної конфігурації.

---

## 21. Backend configuration

Як ми визначили в Data Layer, backend потенційно може бути замінений.

Тому Project Config може в майбутньому дозволяти визначити backend provider:

supabase  
custom API  
NestJS

Але Client Components не повинні використовувати цей параметр напряму.

Вони працюють через Repository/Data Layer.

---

## 22. Storage configuration

Аналогічно Storage Provider:

Supabase Storage  
S3  
R2

може бути infrastructure configuration.

Але `CmsImage` або Media Picker не повинні перевіряти provider.

Вони працюють через Storage Adapter.

---

## 23. Dynamic Settings

Не всі Runtime Settings повинні завантажуватися на Public Website.

Наприклад:

CMS-specific configuration  
integration admin state  
internal settings

не повинні автоматично потрапляти в public payload.

Public Runtime отримує лише ті settings, які реально потрібні для рендерингу сайту.

Це важливо для:

* performance;  
* security;  
* bundle/data size.

---

## 24. Integrations та secrets

Integration Settings можуть складатися з двох частин.

Наприклад Telegram:

Runtime Settings:  
integration enabled  
notification preferences  
display status

Server Environment:

bot token  
secret

Не потрібно зберігати критичні secrets разом із звичайними editable settings, якщо в цьому немає необхідності.

Якщо secret все ж вводиться через Admin Panel, він повинен передаватися і зберігатися через безпечний server-side mechanism та ніколи не повертатися назад у відкритому вигляді.

---

## 25. Project Manifest

Окремо від Config бажано мати службовий manifest.

Наприклад:

.cms/project.json

Він не є runtime configuration сайту.

Manifest використовується CLI та CMS Core tooling.

Логічно він може містити:

CMS Core version  
schema version  
project creation metadata  
CLI version  
migration metadata

Точний формат визначається під час реалізації CLI.

---

## 26. Навіщо Project Manifest

Наприклад:

npx nuxt-cms update

може перевірити:

current CMS version  
current schema version  
required migrations  
compatibility

і виконати необхідні upgrade operations.

Не потрібно використовувати Runtime Settings для цієї інформації.

---

## 27. Project Config і Manifest — різні речі

`cms.config.ts`:

> Як повинен працювати цей Client Project?

`.cms/project.json`:

> В якому технічному стані знаходиться CMS installation?

Ці поняття не потрібно змішувати.

---

## 28. Settings Changes та Activity

Важливі зміни Runtime Settings бажано записувати в Activity.

Наприклад:

Default language changed  
Maintenance mode enabled  
Navigation updated  
Analytics connected

Не обов'язково логувати кожну маленьку технічну зміну.

Activity повинна залишатися meaningful.

---

## 29. Settings і Draft

Не всі Settings потребують Draft/Publish workflow.

Наприклад:

maintenance mode  
contact phone  
social link

можуть застосовуватися одразу після Save.

Для великих content-like settings, наприклад Navigation або global SEO content, за потребою можна використовувати Draft/Publish.

Не потрібно автоматично підключати Draft System до всіх Settings.

---

## 30. Settings Permissions

Runtime Settings повинні враховувати CMS permissions.

Наприклад:

settings.general.update  
settings.seo.update  
settings.languages.manage  
settings.integrations.manage

Editor не обов'язково повинен мати доступ до всіх Settings.

---

## 31. Не створювати Config Store для всього

Не потрібно автоматично складати:

config  
settings  
auth  
content  
editor  
media

в один величезний Pinia Store.

Configuration state повинен залишатися окремою відповідальністю.

Наприклад:

useCmsConfig()  
useSiteSettings()

або інша проста структура.

---

## 32. Що не потрібно створювати зараз

Без реальної необхідності не потрібні:

remote feature flag platform  
complex configuration registry  
configuration versioning engine  
multi-tenant config inheritance  
environment config dashboard  
dynamic plugin marketplace config

Для першої версії достатньо чотирьох зрозумілих рівнів.

---

## 33. Фінальна схема

               CMS Core  
                   │  
            Core Defaults  
                   │  
                   ▼  
             cms.config.ts  
                   │  
          Developer configuration  
                   │  
                   ▼  
             CMS Runtime  
                   │  
         ┌─────────┴──────────┐  
         ▼                    ▼  
 Backend Settings         Environment  
         │                    │  
 Admin-editable            Secrets  
         │                    │  
         └──────────┬─────────┘  
                    ▼  
              Effective State

Окремо:

.cms/project.json  
        ↓  
CLI / migrations / updates

---

## 34. Приклад розподілу конфігурації

| Налаштування | Де зберігається |
| ----- | ----- |
| Forms module available | `cms.config.ts` |
| Custom content type registered | `cms.config.ts` |
| Site name | Backend Settings |
| Logo | Backend Settings / Media |
| Active languages | Backend |
| Default locale | Backend |
| Phone | Backend Settings |
| Navigation | Backend |
| Maintenance mode | Backend |
| Supabase URL | Environment |
| Service role secret | Server Environment |
| Stripe secret | Server Environment |
| Storage provider | Project Config |
| CMS Core version | Project Manifest |
| Schema version | Project Manifest / migration system |

---

## 35. Основні правила

1. Не існує одного універсального config для всього.  
2. CMS Core має власні defaults.  
3. Developer configuration знаходиться в `cms.config.ts`.  
4. Admin-editable configuration знаходиться в backend.  
5. Secrets знаходяться в Environment / secure server configuration.  
6. Project Manifest є окремою службовою системою.  
7. Admin не може змінювати technical capabilities, якщо вони не доступні в Project Config.  
8. Developer не повинен змінювати код для звичайної зміни Site Settings.  
9. Runtime Settings не повинні автоматично потрапляти повністю на Public Website.  
10. Config та Settings повинні бути типізовані та validated.  
11. Components не повинні знати конкретне джерело configuration value.  
12. Не створювати великий JSON для всіх Settings, якщо дані є окремими сутностями.  
13. Не створювати складну configuration framework без необхідності.  
14. Backend і Storage providers можуть визначатися configuration layer, але використовуються через adapters.  
15. Secrets не повертаються в browser.  
16. Project Config API повинен залишатися максимально стабільним між версіями CMS Core.

---

## Ключовий принцип

> Розробник визначає, що сайт і CMS вміють. Адміністратор визначає, як конкретний сайт налаштований. Environment зберігає секрети та infrastructure-specific values.

Ці три рівні не повинні змішуватися.

Завдяки цьому Client Project залишається передбачуваним, CMS може безпечно оновлюватися, а більшість налаштувань сайту змінюються через Admin Panel без втручання в код або нового deployment.

# Блок 11. Security & System Architecture

## 1. Загальний опис

Security & System Architecture відповідає за безпечну роботу CMS, захист даних, керування доступом користувачів та системними налаштуваннями проєкту.

Основна задача цього блоку — забезпечити можливість власнику сайту керувати більшістю технічних налаштувань без прямого доступу до Supabase Dashboard або інших інструментів інфраструктури.

При цьому система повинна чітко розділяти:

* бізнес-налаштування;  
* системні налаштування;  
* секрети;  
* інфраструктурні параметри.

Не всі параметри можуть змінюватися через Admin Panel.

---

## 2. Основний принцип

Використовується просте правило:

> Все, що можна безпечно змінити через CMS без ризику пошкодити систему, повинно бути доступне Owner через Admin Panel.

> Все, що може вплинути на роботу інфраструктури, залишається доступним тільки розробнику.

---

## 3. Ролі доступу

Системний розділ доступний не всім користувачам.

Рекомендована модель:

| Роль | Доступ |
| ----- | ----- |
| Owner | Повний доступ |
| Admin | Немає доступу у V1 (окремі read-only пункти — лише якщо з'явиться реальна потреба) |
| Editor | Немає доступу |

Ролі V1 — лише Owner / Admin / Editor (Summary §25).

Усі критичні операції повинні перевірятися не тільки через UI, але й на Backend.

---

## 4. Розділ System

У CMS повинен існувати окремий розділ:

Settings  
│  
├── General  
├── Brand  
├── SEO  
├── Languages  
├── Social  
├── Advanced  
│  
└── System

System містить технічні налаштування проєкту.

Це не сторінка "для контенту", а інструмент для власника сайту або розробника.

---

## 5. Структура System

Рекомендована структура:

System  
│  
├── Overview  
├── Environment  
├── Integrations  
├── Security  
├── Sessions  
├── Activity  
├── Updates  
├── Diagnostics  
└── Advanced

Деякі розділи можуть бути позначені як **Soon** до моменту реалізації.

---

## 6. Overview

Містить службову інформацію про проєкт.

Наприклад:

* CMS Core Version  
* Project Version  
* Schema Version  
* Backend Provider  
* Storage Provider  
* Build Version  
* Deployment Date  
* Last Migration  
* Database Status  
* Storage Status

Ці дані призначені лише для перегляду.

---

## 7. Integration Secrets (не Environment)

> Застосунок, що вже працює, не може змінювати env хостингу (на Vercel / Netlify зміна env вимагає redeploy). Тому owner-managed integration secrets зберігаються не в «Environment», а в окремому secure secrets layer у backend (наприклад, Supabase Vault), записуються тільки через server route і читаються тільки server-side (Summary §28). Чи потрібен UI для secrets у V1, чи для першого provider достатньо env — відкрите рішення епіку 013.

Цей розділ дозволяє керувати секретами інтеграцій без відкриття Supabase Dashboard.

Приклади:

* Telegram Bot Token  
* Stripe Secret  
* LiqPay Keys  
* SMTP Credentials  
* Resend API Key  
* Google API Keys  
* OpenAI API Key (якщо буде використовуватися)

Цей розділ не використовується для зміни параметрів самої інфраструктури.

---

## 8. Secrets Management

Секрети повинні працювати аналогічно сучасним SaaS-системам.

Після збереження значення більше не відображається.

Наприклад:

Telegram Token

\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*

Користувач може:

* Replace  
* Remove  
* Validate

але не може отримати початкове значення назад.

---

## 9. System Variables

Не всі Environment Variables повинні бути редагованими.

Наприклад:

SUPABASE_URL

Backend Provider

Storage Provider

Node Version

Project ID

відображаються лише для перегляду.

Ці параметри визначають інфраструктуру проєкту і не повинні випадково змінюватися через Admin Panel.

---

## 10. Integrations

Integrations використовують Secrets Management.

Наприклад:

Telegram:

Enabled

Bot Token

Validate

Last Connection

Status

Stripe:

Publishable Key

Secret Key

Webhook Secret

Status

Після введення секрет автоматично використовується Backend.

UI більше його не показує.

---

## 11. Initial Setup Wizard

> **Поза V1.** Підключення самого Supabase не може бути сторінкою всередині вже запущеної CMS: воно виконується через CLI / `.env` / hosting setup. Перший Owner у V1 створюється через задокументований ручний SQL, пізніше — через CLI (епік 016). Опис нижче — ідея на майбутнє (Setup Wizard міг би працювати лише **після** підключення backend: перевірка connection, Languages, Integrations).

Після першого запуску нового проєкту CMS запускає Setup Wizard.

Наприклад:

Welcome to CMS

Step 1  
Project information

Step 2  
Create Owner

Step 3  
Languages

Step 4  
Storage

Step 5  
Integrations

Finish

Після завершення майстра більшість налаштувань можна змінювати через System.

Користувач не повинен відкривати Supabase Dashboard для стандартної конфігурації сайту.

---

## 12. Authentication

Authentication використовує Backend Provider (на першому етапі Supabase Auth).

CMS не повинна містити власну реалізацію авторизації.

У майбутньому Data/Auth Layer повинен дозволяти заміну Backend без зміни UI.

---

## 13. Authorization

Усі права перевіряються через Permission System.

Перевірки виконуються:

* у Backend;  
* у Repository Layer;  
* у UI.

UI ніколи не повинен бути єдиним місцем перевірки доступу.

---

## 14. RLS (Row Level Security)

На першому етапі використовується RLS Supabase.

Кожна бізнес-сутність повинна мати власні Policy.

Наприклад:

* Pages  
* Media  
* Forms  
* Activity  
* Settings  
* Users

Repository Layer не повинен обходити RLS.

---

## 15. Storage Security

Storage також використовує окремі Policy.

Наприклад:

* Public Files  
* Private Files  
* Temporary Uploads

Користувач не повинен отримувати доступ до файлів лише через знання URL.

---

## 16. Edit Mode Security

Edit Mode доступний лише авторизованим користувачам із відповідними правами.

Public Website ніколи не завантажує:

* Edit Toolbar  
* Editor Components  
* Editing Logic  
* Edit API

для неавторизованого користувача.

---

## 17. API Security

Backend API не повинен довіряти Client.

Усі перевірки виконуються сервером.

Наприклад:

* Permissions  
* Ownership  
* Validation  
* Business Rules

---

## 18. Sessions

У майбутньому може бути окремий розділ:

System

↓

Sessions

Наприклад:

* Active Sessions  
* Login History  
* Last Login  
* Device List  
* Force Logout

**Status:** Soon

---

## 19. Security

Може існувати окремий Security Dashboard.

Наприклад:

* Password Changed  
* Failed Login Attempts  
* 2FA Status  
* Trusted Devices

**Status:** Soon

---

## 20. Updates

CMS повинна показувати інформацію про нові версії.

Наприклад:

CMS Core

Current

1.3.0

Latest

1.4.1

З можливістю запуску оновлення через CLI.

У майбутньому можна реалізувати автоматичну перевірку сумісності.

**Status:** Soon

---

## 21. Diagnostics

System може містити просту сторінку діагностики.

Наприклад:

Database

✓

Storage

✓

Email

✓

Telegram

×

Analytics

✓

Це дозволяє швидко знайти проблему без перегляду логів.

---

## 22. Activity

Усі критичні системні дії повинні логуватися.

Наприклад:

* Secret updated  
* Integration connected  
* Owner changed  
* Permission changed  
* User removed  
* Environment updated

---

## 23. Що НЕ повинно редагуватися через CMS

Наступні речі залишаються відповідальністю розробника:

* Database Schema  
* SQL Migrations  
* RLS Policies  
* Storage Policies  
* Database Functions  
* Auth Configuration  
* Service Role Keys  
* JWT Configuration  
* Infrastructure Variables

Ці параметри не повинні бути доступними через Admin Panel.

---

## 24. Архітектурний принцип

System є центральною точкою керування технічним станом CMS.

При цьому:

* власник сайту може керувати більшістю налаштувань без доступу до Supabase;  
* секрети зберігаються безпечним способом і ніколи повторно не відображаються;  
* інфраструктурні параметри залишаються під контролем розробника;  
* майбутні можливості (Sessions, Security Dashboard, Updates, Diagnostics) закладаються в архітектуру відразу, але можуть бути реалізовані в наступних версіях (**Soon**).

---

## Основний принцип

> **CMS повинна максимально приховувати складність інфраструктури. Для більшості власників сайту робота із Supabase Dashboard взагалі не повинна бути необхідною.** При цьому архітектура повинна залишатися безпечною, масштабованою та готовою до заміни Backend Provider у майбутньому.

# Блок 12. API / Repository Contract

## 1. Загальний опис

API / Repository Contract визначає стандартний спосіб, яким Client Project і CMS Core працюють із даними.

Основна мета — зробити так, щоб розробник у звичайному Nuxt-коді не думав про:

* конкретні Supabase queries;  
* назви таблиць;  
* joins;  
* backend provider;  
* normalization;  
* error mapping;  
* cache implementation.

Замість цього він працює через зрозумілі Repository та Composable API.

Основний принцип:

> Client Project працює з CMS через application-level API, а не напряму з Supabase.

---

## 2. Загальна схема

Базовий потік:

Client Component  
      ↓  
Composable / Store  
      ↓  
Repository  
      ↓  
Backend Adapter  
      ↓  
Supabase / NestJS / інший backend

Для більш простих сценаріїв composable не обов'язковий:

Server Page / Server Logic  
      ↓  
Repository  
      ↓  
Backend

---

## 3. Repository — основний контракт із даними

Для кожної бізнес-сутності використовується Repository.

Наприклад:

PagesRepository  
MediaRepository  
LanguagesRepository  
FormsRepository  
SettingsRepository

Client Project може мати власні:

ProductsRepository  
DoctorsRepository  
CasesRepository

Repository відповідає за:

* отримання даних;  
* створення;  
* оновлення;  
* видалення / archive;  
* Draft / Publish там, де це підтримується;  
* transformation database data у application types.

---

## 4. Repository API має бути бізнес-орієнтованим

API не повинен просто копіювати SQL.

Погано:

pagesRepository.select({  
  table: 'pages',  
  where: ...  
})

Краще:

pagesRepository.getAll()  
pagesRepository.getBySlug(slug)  
pagesRepository.getDraft(id)  
pagesRepository.saveDraft(id, data)  
pagesRepository.publish(id)

Тобто назви методів повинні описувати дію CMS.

---

## 5. Composables

Composable використовується там, де потрібна Vue-specific поведінка.

Наприклад:

const {  
  pages,  
  loading,  
  error,  
  refresh  
} = usePages()

Composable може відповідати за:

* reactive state;  
* loading;  
* error;  
* filters;  
* pagination;  
* current selection;  
* refresh;  
* integration з Nuxt lifecycle.

Repository цього робити не повинен.

---

## 6. Repository і Composable не дублюють один одного

Не потрібно, щоб:

PagesRepository

і:

usePages()

містили однакову data-access logic.

Правило:

Repository = data access / business operations

Composable = Vue state / UI orchestration

Composable викликає Repository.

---

## 7. Core API

CMS Core повинен надавати універсальні API для Core-сутностей.

Наприклад:

useCms()  
useCmsAuth()  
usePermissions()  
useMedia()  
useLanguages()  
useSiteSettings()

Точні назви можуть бути змінені під час реалізації.

Головне — API повинно бути:

* коротким;  
* типізованим;  
* передбачуваним;  
* стабільним між версіями CMS Core.

---

## 8. `useCms()`

Може існувати один базовий entry point:

const cms = useCms()

який надає доступ до загального CMS context.

Наприклад концептуально:

cms.config  
cms.settings  
cms.user  
cms.permissions  
cms.capabilities

Але `useCms()` не повинен перетворюватися на giant object, через який проходить абсолютно все.

Для великих feature краще окремі composables.

---

## 9. Feature composables

Наприклад:

useMedia()  
useLanguages()  
usePages()  
useForms()

Кожен відповідає тільки за свою область.

Не потрібно створювати:

useCms().media().pages().settings()...

зі складною вкладеною API-структурою.

---

## 10. Client-specific composables

Client Project може створювати власні composables.

Наприклад:

useProducts()  
useDoctors()  
useApartments()

Вони можуть використовувати власні repositories:

useProducts()  
     ↓  
ProductsRepository  
     ↓  
Backend

CMS Core не повинен знати про ці бізнес-сутності.

---

## 11. Auto-import

Оскільки це Nuxt, бажано використовувати стандартний Nuxt auto-import там, де це доречно.

Наприклад у Client Project:

const { products } = useProducts()

без десятків ручних import.

Але auto-import не повинен приховувати архітектуру настільки, щоб було незрозуміло, звідки береться код.

---

## 12. Server-side data loading

Для SSR сторінок дані бажано отримувати на відповідному рівні сторінки або feature.

Наприклад:

const product = await productsRepository.getBySlug(route.params.slug)

або через:

useAsyncData(...)

із Repository всередині.

Не потрібно дозволяти кожному `CmsText` або `CmsImage` самостійно робити backend request.

---

## 13. Data ownership

Компоненти отримують уже підготовлені дані.

Наприклад:

Product Page  
    ↓  
load Product  
    ↓  
Product object  
    ↓  
ProductHero  
ProductInfo  
ProductCard

Той самий Product object може використовуватися в декількох місцях.

Це відповідає загальному принципу CMS:

> Business data існують незалежно від того, де вони рендеряться.

---

## 14. CMS primitives не завантажують бізнес-дані

`CmsText`, `CmsImage`, `CmsButton` не повинні знати, звідки прийшло значення.

Наприклад:

\<CmsText  
  v-model="product.title"  
  field-key="product.title"  
/\>

`CmsText` не викликає:

productsRepository.get(...)

і тим більше не викликає Supabase.

Він працює тільки з переданим value та Editor Context.

---

## 15. Mutation flow

Зміни повинні йти передбачуваним шляхом.

Для Admin CRUD:

Admin Component  
      ↓  
Composable  
      ↓  
Repository.update()  
      ↓  
Backend

Для Edit Mode:

Cms Primitive  
      ↓  
Editor Engine  
      ↓  
Draft Manager  
      ↓  
Repository.saveDraft()  
      ↓  
Backend

---

## 16. Public API і internal API

У CMS Core потрібно розрізняти:

#### Public API

Те, що дозволено використовувати Client Project.

Наприклад:

useCms()  
useMedia()  
CmsText  
CmsImage  
shared types  
repository interfaces/helpers

#### Internal API

Те, що використовується тільки CMS Core.

Наприклад:

Editor internals  
Toolbar internals  
internal store helpers  
Supabase adapter details  
private migration utilities

Client Project не повинен залежати від internal API.

---

## 17. Типізація

Усі public APIs повинні бути типізованими.

Наприклад:

const product: Product  
const media: CmsMedia  
const page: CmsPage

Repository не повинен повертати:

any

або raw backend response.

Це особливо важливо, оскільки CMS Core буде використовуватися в багатьох Client Projects.

---

## 18. Domain Types

Application types повинні бути незалежними від Backend Provider.

Погано:

PostgrestSingleResponse\<ProductRow\>

Краще:

Product

або:

CmsPage

Backend Adapter перетворює backend-specific response у нормальні domain/application types.

---

## 19. Error Contract

Так само повинна існувати стабільна модель помилок.

UI не повинен перевіряти:

PostgreSQL error code 42501

або Supabase-specific error.

Data Layer нормалізує помилки в application-level errors.

Наприклад:

NotFound  
PermissionDenied  
ValidationError  
Conflict  
NetworkError  
UnknownError

---

## 20. Pagination

Для списків з потенційно великою кількістю записів API повинно підтримувати pagination.

Наприклад:

productsRepository.getAll({  
  page,  
  limit,  
  search,  
  filters  
})

Але не потрібно створювати універсальний query DSL.

Достатньо простого typed options object.

---

## 21. Search і Filters

Repository кожної сутності визначає тільки реально потрібні filters.

Наприклад:

productsRepository.getAll({  
  search,  
  status,  
  category  
})

Не потрібно створювати універсальний engine для будь-яких database filters.

---

## 22. Sorting

Аналогічно:

mediaRepository.getAll({  
  sort: 'newest'  
})

або:

productsRepository.getAll({  
  sort: 'name'  
})

Supported values повинні бути типізованими.

---

## 23. CRUD не обов'язково однаковий для всіх сутностей

Не потрібно змушувати всі repositories мати:

create  
read  
update  
delete

якщо конкретній сутності це не підходить.

Наприклад:

ActivityRepository

може мати тільки:

getAll()  
log()

А:

PagesRepository

може мати:

getDraft()  
saveDraft()  
publish()

API визначається бізнес-поведінкою сутності.

---

## 24. Shared repository helpers

Якщо з'явиться реальна повторювана логіка, CMS Core може надати прості helpers.

Наприклад:

pagination helper  
error mapper  
backend client  
query normalization

Але не потрібно будувати складний `GenericRepository<T>` тільки заради DRY.

---

## 25. Backend Provider

Repository API не залежить від backend.

Сьогодні:

ProductsRepository  
      ↓  
Supabase Adapter

У майбутньому:

ProductsRepository  
      ↓  
NestJS API Adapter

Client Project продовжує використовувати:

useProducts()

без змін.

---

## 26. Caching

API Contract не повинен вимагати від компонента знати, де і як кешуються дані.

Caching може знаходитися:

* у Nuxt;  
* у Repository;  
* у backend;  
* у CDN.

Компонент просто викликає:

getBySlug()

і отримує дані.

---

## 27. Refresh / Invalidation

Composable може надавати:

refresh()

після mutation.

Наприклад:

Product updated  
    ↓  
repository.update()  
    ↓  
refresh product/list

Точний caching strategy визначається окремим Performance Block.

---

## 28. API не повинен бути надмірно “магічним”

Не потрібно створювати API на кшталт:

cms.entity('products')  
   .query()  
   .where(...)  
   .select(...)

якщо ти сам контролюєш Client Project.

Краще:

productsRepository.getAll()

Це:

* легше читати;  
* легше типізувати;  
* легше тестувати;  
* легше підтримувати.

---

## 29. CMS Core не повинен генерувати repositories для всього

Якщо Client Project має:

Products  
Doctors  
Apartments

Розробник просто створює потрібні repositories у Client Project.

CMS Core може надати conventions та helpers, але не повинен створювати складний dynamic repository registry.

---

## 30. Простота використання для розробника

Типовий Client Project повинен виглядати максимально просто.

Наприклад:

const { product, loading } = useProduct(slug)

або:

const product = await productsRepository.getBySlug(slug)

Після цього:

\<ProductHero :product="product" /\>  
\<ProductDetails :product="product" /\>

CMS-specific complexity не повинна проникати в кожний Vue-компонент.

---

## 31. Що не потрібно створювати зараз

Не потрібно:

GraphQL SDK  
generated REST SDK  
universal entity API  
query builder  
CQRS API  
Command Bus  
complex service container  
repository registry  
data mapper framework

Якщо конкретна проблема з'явиться пізніше, архітектуру можна розширити.

---

## 32. Приклад Core feature

Media:

MediaLibrary.vue  
      ↓  
useMedia()  
      ↓  
MediaRepository  
      ↓  
Storage / Backend Adapter

---

## 33. Приклад Client feature

Products:

ProductsPage.vue  
      ↓  
useProducts()  
      ↓  
ProductsRepository  
      ↓  
Backend Adapter

CMS Core не знає про Product.

---

## 34. Приклад Edit Mode

ProductHero.vue

\<CmsText v-model="product.title" /\>

        ↓

Editor Engine

        ↓

ProductsRepository.saveDraft()

        ↓

Backend

При цьому `CmsText` не знає, що редагується Product.

---

## 35. Naming

Бажано використовувати передбачувані назви:

usePages()  
useMedia()  
useLanguages()

PagesRepository  
MediaRepository  
LanguagesRepository

Client Project:

useProducts()  
ProductsRepository

Не потрібно створювати надмірно абстрактні назви типу:

ContentDataGateway  
ResourceManager  
DomainAccessor

якщо звичайний Repository зрозуміліший.

---

## 36. Основні правила

1. Client Project не працює напряму із Supabase.  
2. Основний Data Contract реалізується через Repository.  
3. Composables відповідають за Vue-specific state.  
4. Repository не зберігає UI state.  
5. CMS Core надає API тільки для універсальних CMS feature.  
6. Client-specific API знаходиться в Client Project.  
7. CMS primitives не завантажують бізнес-дані.  
8. Дані завантажуються на рівні page/feature та передаються компонентам.  
9. Repository API описує бізнес-дії, а не SQL.  
10. Public API повністю типізований.  
11. Backend-specific types не виходять за Data Layer.  
12. Backend-specific errors нормалізуються.  
13. CRUD API не потрібно примусово уніфікувати для всіх сутностей.  
14. Не створювати universal query builder без потреби.  
15. API повинно залишатися простим для щоденної роботи розробника.  
16. Backend Provider можна замінити без зміни API Client Project.  
17. CMS Core public API потрібно вважати стабільним контрактом і змінювати відповідно до semantic versioning.

---

## Ключовий принцип

> Repository відповідає на питання "що я хочу зробити з даними", а Backend Adapter — "як саме це зробити".

Client Project повинен залишатися максимально близьким до звичайної Nuxt/Vue-розробки.

Розробник отримує бізнес-дані через Repository або Composable, передає їх у свої Vue-компоненти та використовує CMS primitives тільки там, де контент повинен бути редагованим.


# Блок 13. Content Collections / Business Content Architecture

## 1. Загальний опис

Content Collections відповідають за повторювані бізнес-сутності, яких у проєкті може бути багато.

Наприклад:

* Products  
* Blog Posts  
* Cases  
* Services  
* Doctors  
* Team Members  
* Events  
* Categories  
* Testimonials

Основна задача Collection System — дати CMS універсальний спосіб працювати зі списками однотипних бізнес-даних без перетворення всієї CMS на page builder або universal entity engine.

Головний принцип:

> Collection — це набір записів одного бізнес-типу, структура якого визначається розробником.

---

## 2. Бізнес-сутність залишається бізнес-сутністю

Наприклад:

Product

є окремою бізнес-моделлю.

Вона може мати:

title  
price  
description  
image  
category  
status

Точні поля визначаються Client Project.

CMS Core не повинна заздалегідь знати всі можливі поля Product.

---

## 3. Collection не визначає структуру даних

CMS Core не повинна створювати універсальну структуру:

collection_fields  
collection_values  
dynamic_fields

лише для того, щоб підтримувати різні типи даних.

Якщо конкретному проєкту потрібні Products:

products

створюється нормальна таблиця Products.

Якщо потрібні Doctors:

doctors

створюється Doctors.

Це відповідає загальному принципу Business Data First.

---

## 4. CMS Core надає універсальний Collection UI

Хоча таблиці та бізнес-моделі різні, CMS може показувати їх через однакові інтерфейсні патерни.

Наприклад:

Products  
Cases  
Blog Posts  
Doctors

можуть використовувати однаковий:

* list layout;  
* search;  
* status filter;  
* pagination;  
* Create button;  
* Edit action;  
* Delete/Archive action;  
* SEO indicator;  
* Updated date.

Тобто універсальність досягається на рівні UI та API conventions, а не через універсальну таблицю.

---

## 5. Collection Registration

Client Project повинен мати простий спосіб повідомити CMS Core, які Collections існують.

Наприклад концептуально:

collections: {  
  products: {  
    label: 'Products'  
  },

  cases: {  
    label: 'Cases'  
  }  
}

Точний API визначається під час реалізації.

CMS Core може використати цю інформацію для:

* Pages / Content navigation;  
* Collection Manager;  
* breadcrumbs;  
* permissions;  
* generic list UI.

Не потрібно будувати складний dynamic schema builder.

---

## 6. Repository для кожної Collection

Кожен бізнес-тип має власний Repository.

Наприклад:

ProductsRepository  
CasesRepository  
BlogPostsRepository

CMS Collection UI працює через визначений Repository Contract.

Наприклад:

productsRepository.getAll()  
productsRepository.getById()  
productsRepository.create()  
productsRepository.update()  
productsRepository.archive()

Конкретний набір методів залежить від бізнес-моделі.

---

## 7. Composable

За необхідності Client Project може мати:

useProducts()  
useCases()  
useBlogPosts()

Composable відповідає за:

* loading;  
* filters;  
* pagination;  
* selected item;  
* refresh.

Data access залишається в Repository.

---

## 8. Collection Manager

CMS Core може мати універсальний Collection Manager.

Наприклад:

Content  
   ↓  
Products

або:

Content  
   ↓  
Blog Posts

UI може бути спільним, але конфігурація конкретної Collection визначається Client Project.

---

## 9. List View

Базово Collection Manager може підтримувати:

* title/name;  
* status;  
* SEO;  
* updated date;  
* primary image;  
* custom summary fields;  
* actions.

Не потрібно змушувати всі Collections мати однакові колонки.

Client Project може визначити, які summary fields потрібні.

---

## 10. Create

Користувач може створювати новий запис Collection, якщо має відповідний permission.

Наприклад:

Create Product

створює:

new Product record

Це не створення нового типу Product.

Тип уже визначений розробником.

---

## 11. Template Pages

Деякі Collection Items можуть автоматично мати public page.

Наприклад:

Product \#15

доступний як:

/products/macbook-pro

При цьому frontend template уже написаний розробником.

Наприклад:

pages/products/\[slug\].vue

Користувач лише створює новий Product.

Nuxt route автоматично використовує існуючий template для будь-якого запису.

---

## 12. Це не генерація сторінки

Важливо:

Create Product

не означає:

створити нову Vue page  
створити секції  
створити layout

Frontend template існує один раз.

Новий Product просто отримує нові дані.

Схема:

Product record  
      ↓  
existing Nuxt template  
      ↓  
rendered Product Page

---

## 13. Один запис може використовуватися в багатьох місцях

Наприклад Product може бути показаний:

/products  
/home  
/search  
/category/laptops  
/products/macbook-pro

При цьому існує один Product record.

Не потрібно копіювати дані для кожної сторінки.

---

## 14. Status

Бізнес-сутності можуть мати прості статуси.

Наприклад:

Active  
Hidden

або:

Draft  
Published  
Archived

Залежить від конкретного Content Type.

Не потрібно примусово застосовувати один status enum до всіх Collections.

---

## 15. Draft / Publish

Якщо Collection Item має public page або важливий public content, він може використовувати Draft / Publish workflow.

Наприклад:

Blog Post  
Product  
Case

можуть мати:

Draft  
Published  
Revisions

А простий Team Member може, наприклад, використовувати лише:

Active / Hidden

Draft System не потрібно підключати до всіх Collections автоматично.

---

## 16. SEO

SEO підтримується лише для сутностей, які мають власний public route або іншу SEO-потребу.

Наприклад:

Product  
Blog Post  
Case

можуть мати:

slug  
SEO title  
SEO description  
OG image

FAQ Item зазвичай не потребує власного SEO.

---

## 17. Slug

Якщо Collection Item має public page, slug є частиною business data.

Наприклад:

Product  
slug = macbook-pro

Frontend використовує:

/products/\[slug\]

Repository повинен мати можливість отримати запис:

getBySlug(slug)

---

## 18. Relations

Collections можуть мати нормальні relational зв'язки.

Наприклад:

Product  
   ↓  
Category

або:

Blog Post  
   ↓  
Author

Не потрібно зберігати relations у generic JSON.

Використовуються нормальні PostgreSQL relations.

---

## 19. Categories

Category є окремою бізнес-сутністю, якщо вона реально потрібна.

Наприклад:

Product  
    ↓  
Category

Не потрібно автоматично створювати universal taxonomy engine для всіх Collections.

Якщо Blog потребує Categories, а Products — іншої структури, вони можуть бути реалізовані окремо.

---

## 20. Repeatable Collection vs Business Collection

Потрібно розрізняти дві різні речі.

#### Business Collection

Наприклад:

Products  
Doctors  
Blog Posts

Це незалежні бізнес-сутності.

Вони можуть:

* мати власний Repository;  
* мати public route;  
* використовуватися в різних місцях;  
* мати relations.

#### Local Repeatable Collection

Наприклад:

Hero benefits  
Pricing features  
FAQ items конкретної сторінки  
Gallery images

Це просто повторюваний список усередині конкретного content model.

Він не обов'язково потребує окремої глобальної Collection Manager page.

---

## 21. Коли створювати окрему бізнес-сутність

Рекомендоване правило:

Створювати окрему бізнес-сутність, якщо запис:

* використовується в кількох місцях;  
* має власний життєвий цикл;  
* має власні permissions;  
* має власний route;  
* має relations;  
* потребує окремого CRUD.

Якщо це лише:

3 benefits у Hero

окремий `benefits` business module зазвичай не потрібен.

---

## 22. Repeatable local data

Local Collection може бути просто частиною content data.

Наприклад:

Hero  
  benefits\[\]

або:

Pricing  
  features\[\]

`CmsCollection` дозволяє:

* Add;  
* Delete;  
* Duplicate;  
* Reorder.

Але це не перетворює `benefits` на глобальну бізнес-сутність.

---

## 23. Stable ID для repeatable items

Навіть local array items повинні мати стабільні ID.

Не покладатися лише на:

array index

Потрібно для:

* reorder;  
* Undo / Redo;  
* Draft;  
* History;  
* Edit Mode selection.

---

## 24. Reordering

Не всі Business Collections потребують ручного reorder.

Наприклад Products можуть сортуватися:

name  
price  
created date

А Team Members можуть мати ручний:

sort_order

Рішення приймається для конкретної бізнес-сутності.

---

## 25. Search

Collection Manager може підтримувати search.

Repository визначає, за якими полями реально виконується search.

Наприклад:

Products → title / SKU  
Blog → title  
Doctors → name

Не потрібно створювати складний global full-text search engine на старті.

---

## 26. Filters

Filters визначаються конкретною Collection.

Наприклад Products:

Status  
Category

Blog:

Status  
Author

CMS Core може мати універсальний UI filters, але правила задає Client Project.

---

## 27. Pagination

Великі Collections повинні використовувати pagination.

Наприклад:

Products  
Blog Posts  
Form Submissions

Не потрібно завантажувати тисячі records одразу.

Pagination реалізується через Repository Contract.

---

## 28. Delete vs Archive

Для основних бізнес-сутностей бажано використовувати Archive/Soft Delete.

Наприклад:

Product  
   ↓  
Archive

Фізичне видалення може виконуватися окремо.

Це дозволяє:

* Restore;  
* Activity;  
* безпечну роботу з relations.

---

## 29. Delete Protection

Якщо сутність використовується іншими сутностями, видалення повинно враховувати relations.

Наприклад:

Category  
    ↓  
25 Products

CMS не повинна мовчки видалити Category та зламати Products.

Потрібен warning або блокування залежно від relation.

---

## 30. Media

Business Collections використовують загальну Media Library CMS Core.

Наприклад:

Product  
    ↓  
mediaId

Не потрібно створювати:

products_images

як окрему storage system, якщо це не обумовлено бізнес-моделлю.

---

## 31. Localization

Business Collections повинні підтримувати локалізацію відповідно до фінальної Localization Architecture.

Наприклад:

Product  
title  
description  
slug

можуть бути localized.

А:

price  
SKU  
stock

зазвичай ні.

Точну storage model локалізації потрібно фіналізувати після узгодження Content Model.

---

## 32. Content Lock

Business Collection Items використовують Content Lock.

Наприклад:

Product \#15

може редагувати тільки один CMS user одночасно.

Але інший користувач одночасно може редагувати:

Product \#16

Lock працює на рівні конкретного record.

---

## 33. Permissions

Permissions можуть бути feature-specific.

Наприклад:

products.view  
products.create  
products.edit  
products.publish  
products.archive

Client Project може визначити permissions для власних business modules.

Не потрібно створювати їх вручну в компонентах.

---

## 34. Activity

Meaningful operations із Collection Items повинні потрапляти в Activity.

Наприклад:

Product created  
Product updated  
Product published  
Product archived  
Product restored

Не потрібно логувати кожне натискання клавіші.

---

## 35. Revisions

Collections із Draft/Publish можуть підтримувати Revisions так само, як Pages.

Наприклад:

Blog Post  
    ↓  
Revision history

Не потрібно створювати окрему revision architecture для кожної Collection.

Використовується загальна Revision System.

---

## 36. Admin UX

Collections бажано мати передбачуваний UX.

Наприклад:

Content  
    ↓  
Products  
       ↓  
All Products  
Create Product

або:

Content  
    ↓  
Blog Posts

Інтерфейс має залишатися однаковим між Collections там, де це логічно.

---

## 37. Collection-specific UI

Якщо конкретна бізнес-сутність потребує спеціального UI, Client Project може його реалізувати.

Наприклад Product може мати:

inventory  
variants  
pricing

і generic Collection Edit Screen уже недостатньо.

У такому разі створюється custom feature UI без необхідності змінювати CMS Core.

---

## 38. Generic UI не є обов'язковим

Не потрібно змушувати всі Business Collections працювати через один універсальний edit form.

CMS Core може надати:

* list components;  
* filters;  
* actions;  
* common layouts.

А Client Project визначає конкретний Edit UI.

Це дозволяє уникнути обмежень generic CMS builder.

---

## 39. Реєстрація Collection в Admin navigation

Client Project може зареєструвати Collection у CMS.

Наприклад концептуально:

registerCollection({  
  key: 'products',  
  label: 'Products',  
  repository: productsRepository  
})

Точний API може бути простішим.

Після цього CMS може показати:

Content  
   ↓  
Products

без hardcode у CMS Core.

---

## 40. Core Collections і Client Collections

CMS Core може містити універсальні системні Collections:

Pages  
Media  
Forms

Client Project додає:

Products  
Doctors  
Blog Posts

Core не повинен знати їх наперед.

---

## 41. Template page lifecycle

Для Content Type з public template:

Create Product  
       ↓  
Product Draft  
       ↓  
fill data  
       ↓  
Publish  
       ↓  
/products/\[slug\]

Не створюється новий frontend файл.

Public route працює через дані.

---

## 42. Приклад Products

Products  
     ↓  
ProductsRepository  
     ↓  
Database

Public:

/products  
     ↓  
getAll()

/products/macbook-pro  
     ↓  
getBySlug()

Edit Mode:

Product template  
     ↓  
CmsText(product.title)  
CmsImage(product.image)  
CmsText(product.description)  
     ↓  
ProductsRepository.saveDraft()

---

## 43. Приклад локальної Collection

Hero:

Hero  
   ↓  
benefits\[\]

Frontend:

\<CmsCollection v-model="hero.benefits"\>  
  ...  
\</CmsCollection\>

Admin може:

Add Benefit  
Delete Benefit  
Reorder Benefits

Але немає:

Content → Benefits

бо це не глобальна бізнес-сутність.

---

## 44. Що не потрібно створювати зараз

Не потрібно:

Universal Entity System  
Dynamic Field Builder  
Dynamic Database Schema Builder  
Page Builder  
Generic Relation Engine  
Universal Taxonomy System  
Generic CRUD Generator для всіх можливих випадків

якщо цього не вимагає конкретний Client Project.

---

## 45. Основні правила

1. Collection — це набір записів конкретної бізнес-сутності.  
2. Структуру бізнес-сутності визначає Client Project.  
3. CMS Core не зберігає всі Collections в одній universal table.  
4. Кожна основна Business Collection може мати власну таблицю та Repository.  
5. CMS Core надає conventions і reusable Collection UI.  
6. Client Project реєструє власні Collections у CMS.  
7. Create Item створює бізнес-запис, а не frontend page/component.  
8. Template Pages визначаються розробником у Nuxt.  
9. Один business record може використовуватися в багатьох місцях сайту.  
10. Business Collection і local repeatable array — різні поняття.  
11. Local repeatable item не потрібно автоматично робити глобальною сутністю.  
12. Repeatable items мають стабільні ID.  
13. Draft/Publish підключається тільки там, де реально потрібен.  
14. SEO підключається тільки для routable/SEO-relevant сутностей.  
15. Relations використовують нормальні database relations.  
16. Не створювати universal taxonomy без потреби.  
17. Search, filters і sorting визначаються конкретним business module.  
18. Великі Collections використовують pagination.  
19. Основні сутності бажано Archive/Soft Delete замість негайного physical delete.  
20. Media використовує спільну Media Library.  
21. Content Lock працює на рівні конкретного Collection Item.  
22. Permissions визначаються через загальну Permission System.  
23. Revisions використовують спільну Revision Architecture.  
24. Generic Collection UI можна розширювати або замінювати custom UI в Client Project.  
25. CMS Core не повинен перетворюватися на dynamic business-model builder.

---

## Ключовий принцип

> CMS Core дає універсальні інструменти для роботи з бізнес-контентом, але самі бізнес-моделі залишаються частиною Client Project.

`Product`, `Doctor` або `Case` існують незалежно від сторінок і Vue-компонентів. Розробник визначає їх структуру та те, де вони використовуються, а CMS забезпечує зручне створення, редагування, публікацію, пошук та керування цими даними.


# Блок 14. Forms Architecture

## 1. Загальний опис

Forms Module відповідає за:

* відображення форм на публічному сайті;  
* validation;  
* прийом submissions;  
* зберігання заявок;  
* read / unread / archived / spam states;  
* notifications;  
* export;  
* перегляд submissions через Admin Panel.

CMS не є універсальним no-code Form Builder.

Структуру конкретної форми визначає розробник у Client Project.

Наприклад:

Contact Form  
Quote Request  
Book a Call  
Newsletter  
Event Registration

CMS Core надає спільну інфраструктуру для їх роботи.

Основний принцип:

> Client Project визначає поля та бізнес-логіку форми, а CMS Core забезпечує стандартний lifecycle submission, validation infrastructure, storage, notifications та Admin UI.

---

## 2. Form і Submission — різні сутності

Потрібно чітко розділяти:

Form

та:

Submission

`Form` описує конкретну форму сайту.

Наприклад:

Contact Form

`Submission` — це одна конкретна заявка:

Name: Anna  
Email: anna@example.com  
Message: ...

Одна Form може мати багато Submissions.

Схема:

Form  
  │  
  ├── Submission  
  ├── Submission  
  ├── Submission  
  └── Submission

---

## 3. Структура Form

Form повинна мати стабільний identifier.

Наприклад:

contact  
quote-request  
newsletter  
event-registration

CMS повинна знати:

* яка це форма;  
* чи активна вона;  
* де вона використовується;  
* які notification settings застосовуються;  
* скільки submissions вона отримала.

Точні database columns визначаються під час реалізації.

---

## 4. Структура полів визначається Client Project

Не потрібно створювати універсальну систему:

form_fields  
field_types  
field_options  
dynamic_validation_rules

якщо немає задачі дозволити адміністратору самостійно будувати форми.

Наприклад Contact Form може бути написана як звичайний Vue-компонент:

\<ContactForm /\>

з відомими розробнику полями.

Наприклад:

name  
email  
phone  
service  
message

Саме Client Project визначає ці поля.

---

## 5. CMS Core не повинен бути Form Builder

Адміністратор не повинен через CMS:

* створювати довільні input;  
* змінювати тип поля;  
* будувати форму drag & drop;  
* додавати conditional logic;  
* проектувати layout форми.

Якщо конкретному проєкту колись знадобиться form builder, це може бути окремою feature.

Для базової CMS це зайва складність.

---

## 6. Base Form Components

CMS Core може містити універсальні компоненти форми:

BaseInput  
BaseTextarea  
BaseSelect  
BaseCheckbox  
BaseRadio  
BaseFormError  
BaseFormField

Але вони залишаються UI primitives.

Client Project використовує їх для побудови конкретної форми.

---

## 7. Form Registration

Client Project повинен мати простий спосіб зареєструвати форму в CMS.

Наприклад концептуально:

registerForm({  
  key: 'contact',  
  label: 'Contact Form'  
})

Точний API визначається під час реалізації.

Після registration CMS може:

* показувати форму в Admin → Forms;  
* рахувати submissions;  
* керувати notifications;  
* показувати usage;  
* дозволяти enable / disable.

---

## 8. Public Form Flow

Типовий flow:

Visitor  
   ↓  
Vue Form  
   ↓  
Client Validation  
   ↓  
Submit  
   ↓  
Server endpoint  
   ↓  
Server Validation  
   ↓  
Spam Protection  
   ↓  
Save Submission  
   ↓  
Notifications  
   ↓  
Success Response

Frontend validation потрібна для UX.

Backend validation є обов'язковою для безпеки.

---

## 9. Server-side submission

Form submission не повинен напряму записувати дані в таблицю з browser через unrestricted access.

Рекомендований flow:

Public Form  
    ↓  
POST /api/forms/contact  
    ↓  
Nuxt Server / Backend  
    ↓  
Validate  
    ↓  
Rate limit / spam checks  
    ↓  
Forms Service  
    ↓  
Repository  
    ↓  
Database

Це дозволяє централізовано контролювати:

* validation;  
* spam;  
* rate limiting;  
* notifications;  
* security.

---

## 10. Validation

Validation повинна існувати на двох рівнях.

#### Client-side

Для швидкого UX:

required  
email  
min/max length  
format

#### Server-side

Повторює всі критичні правила.

Не можна довіряти frontend validation.

Користувач може вручну відправити HTTP request.

---

## 11. Використання існуючої validation logic

Якщо Client Project вже має власний composable або validation utilities, Forms Module не повинен змушувати використовувати окрему validation library без необхідності.

CMS Core може визначити спільний contract validation, але конкретна реалізація може залишатися простою.

Не потрібно підключати важку schema library тільки заради форм, якщо існуючої validation достатньо.

---

## 12. Submission Data

Submission повинна зберігати:

* reference на Form;  
* submission payload;  
* status;  
* timestamps;  
* metadata;  
* source information за потребою.

Точна структура payload залежить від форми.

Для forms payload JSON може бути виправданим, оскільки різні форми можуть мати різні структури.

Наприклад:

Contact:  
name  
email  
message

а:

Event Registration:  
name  
email  
ticketType  
company  
guests

Не обов'язково створювати окрему database table для submissions кожної форми.

---

## 13. JSON для Submission payload

На відміну від основних бізнес-сутностей, тут JSON є логічним варіантом.

Наприклад:

form_submissions

form_id  
payload  
status  
created_at

Де:

{  
  "name": "Anna",  
  "email": "anna@example.com",  
  "message": "Hello"  
}

Причина:

Submission є immutable event-like record з потенційно різною структурою залежно від Form.

Точну database model визначає розробник у плані епіку.

---

## 14. Submission Status

Базові states:

Unread  
Read  
Archived  
Spam

За необхідності в майбутньому можна додати:

Resolved  
Replied

але не потрібно створювати CRM workflow без реальної потреби.

---

## 15. Unread

Нова submission за замовчуванням:

Unread

Після відкриття:

Read

Dashboard може показувати:

Unread Forms: 7

---

## 16. Archive

Archive використовується замість видалення для звичайної роботи.

Наприклад:

Read submission  
      ↓  
Archive

Submission залишається в database та history.

---

## 17. Delete

Фізичне видалення submissions може існувати як окрема permission-protected operation.

Для звичайного workflow краще використовувати Archive.

---

## 18. Spam

Form Submission може бути позначена:

Spam

Spam може визначатися:

* автоматично;  
* вручну адміністратором.

Для першої версії не потрібно будувати власний ML spam engine.

Достатньо:

* honeypot;  
* rate limiting;  
* basic heuristics;  
* optional CAPTCHA provider.

---

## 19. Honeypot

Для простих public forms можна додати невидиме поле.

Звичайний користувач його не заповнює.

Прості bots часто заповнюють.

Це дешевий перший рівень spam protection.

---

## 20. Rate Limiting

Public Form endpoint повинен мати rate limiting.

Наприклад обмеження:

IP / session / time window

Точні limits визначаються під час реалізації.

Не потрібно hardcode одне значення для всіх проєктів.

---

## 21. CAPTCHA

CAPTCHA не обов'язкова для кожного сайту.

Архітектура повинна дозволяти підключити provider, якщо spam стане проблемою.

Наприклад:

Cloudflare Turnstile  
reCAPTCHA

але це не повинно бути mandatory dependency CMS Core.

---

## 22. Notifications

Після успішного submission можуть запускатися notifications.

Наприклад:

Submission saved  
      ↓  
Email notification  
Telegram notification  
Webhook

Notification failure не повинна видаляти submission.

Головний принцип:

> Спочатку надійно зберегти submission, потім виконувати secondary actions.

---

## 23. Email Notifications

Для кожної форми можна визначити:

enabled  
recipients  
subject  
reply-to behavior

Наприклад:

Contact Form  
→ info@company.com

або:

Quote Request  
→ sales@company.com

---

## 24. Telegram Notifications

Якщо Telegram Integration підключена, Form може мати:

Send submissions to Telegram

Приклад flow:

Contact Submission  
      ↓  
save  
      ↓  
Telegram integration  
      ↓  
message

Forms Module не повинен напряму працювати з Telegram API.

Він викликає Integration Layer.

---

## 25. Notification Configuration

Notification preferences є Runtime Settings.

Адміністратор може змінювати їх через CMS.

Наприклад:

Forms  
  ↓  
Contact Form  
  ↓  
Notification Settings

---

## 26. Secrets

SMTP credentials, API keys та Telegram tokens не повинні зберігатися разом із Form settings.

Вони використовують Secrets / System Architecture.

Form знає лише:

notification provider enabled  
recipient  
template/preferences

---

## 27. Form Usage

CMS бажано знати, де використовується Form.

Наприклад:

Contact Form

Used on:  
Home  
Contact  
Service Template

Це корисно для:

* Admin UI;  
* disable warnings;  
* maintenance;  
* debugging.

---

## 28. Disable Form

Адміністратор може:

Disable Form

Але це не повинно ламати frontend.

Frontend повинен отримати зрозумілий state.

Наприклад:

form disabled

і Client Project вирішує:

* приховати форму;  
* показати повідомлення;  
* показати alternative CTA.

---

## 29. Delete Form

Якщо Form зареєстрована в коді Client Project, Admin не повинен фізично "видаляти" її definition через CMS.

Він може:

Enable / Disable

Structure/registration контролює Developer.

Це відповідає загальному принципу системи: CMS змінює контент і runtime state, але не frontend structure.

---

## 30. Form Submissions List

Admin → Forms → конкретна Form показує submissions.

Підтримуються:

All  
Unread  
Read  
Archived  
Spam

Може бути search та date filter.

Не потрібно робити складний CRM interface.

---

## 31. Submission Detail

При відкритті submission CMS показує всі передані поля.

Оскільки payload може відрізнятися між формами, UI повинен вміти generic display:

Field label  
Value

Client Project або Form registration може надавати labels/display metadata.

---

## 32. Sensitive Fields

Не всі поля submissions повинні автоматично показуватися всім CMS users.

У майбутньому Form може визначити:

sensitive fields

але для першої версії достатньо permission на перегляд Forms/Submissions.

Не потрібно створювати field-level permissions без необхідності.

---

## 33. Export

CMS може підтримувати:

Export CSV

для submissions конкретної Form.

Filters, які активні в Admin, можуть застосовуватися до Export.

Не потрібно на старті підтримувати:

Excel  
PDF  
XML  
10 custom formats

CSV достатньо для V1.

---

## 34. Export Security

Export може містити персональні дані.

Тому потрібен permission:

forms.export

Export action бажано записувати в Activity для чутливих проєктів.

---

## 35. Forms Permissions

Приклади:

forms.view  
forms.submissions.view  
forms.submissions.update  
forms.export  
forms.settings.update

Не всі Editors повинні автоматично бачити submissions.

---

## 36. Activity

Meaningful actions:

Form disabled  
Form enabled  
Notification settings changed  
Submission archived  
Submission marked spam  
Submissions exported

можуть потрапляти в Activity.

Не потрібно логувати:

Submission opened

якщо це створює зайвий шум.

---

## 37. Public submission не є CMS user

Відправник форми не повинен створювати:

auth.users

якщо сама форма не є реєстраційною.

Наприклад:

Contact Form

просто створює Submission.

---

## 38. Registration Forms

Якщо форма насправді є:

User Registration

це вже Auth flow.

Вона не повинна використовувати звичайний Form Submission mechanism як основний спосіб створення users.

Можна логувати registration event окремо, але Auth залишається відповідальністю Auth System.

---

## 39. Form Attachments

Якщо конкретна форма дозволяє file uploads:

CV  
Document  
Image

файли повинні використовувати Storage/Media infrastructure.

Для приватних attachments використовується private storage.

Submission зберігає reference на файл, а не raw file.

---

## 40. Attachment Security

Потрібно перевіряти:

* MIME;  
* size;  
* allowed types;  
* access permissions.

Form attachments не повинні автоматично потрапляти в public Media Library.

---

## 41. Draft / Publish

Forms definitions зазвичай не потребують Draft / Publish, оскільки їх structure визначена в коді.

Runtime settings форми:

enabled  
notifications

можуть зберігатися звичайним Save.

Submission також не має Draft/Publish lifecycle.

---

## 42. Localization

Public labels і validation messages визначаються Client Project та його localization system.

CMS не повинна зберігати структуру полів лише заради перекладу labels.

Notification templates можуть бути localized, якщо конкретному проєкту це потрібно.

---

## 43. Repository Architecture

Forms Module використовує Repository/Data Layer.

Наприклад:

FormsRepository  
SubmissionsRepository

або один repository, якщо так простіше.

Точне розділення визначається під час реалізації.

---

## 44. Submission Service

Для прийому public submissions бажано мати окремий service.

Наприклад:

FormsService.submit()

Він координує:

validation  
spam protection  
save  
notifications

Repository при цьому залишається data-access layer.

---

## 45. Form Contract

Client Project може реєструвати metadata конкретної Form.

Концептуально:

registerForm({  
  key: 'contact',  
  label: 'Contact Form',  
  fields: \[...\]  
})

Але `fields` тут можуть використовуватися лише як metadata для:

* Admin display;  
* Export headings;  
* validation mapping;

а не як dynamic form builder.

Точний API може бути значно простішим.

---

## 46. Не дублювати schema

Якщо типи форми вже визначені TypeScript-кодом, не потрібно без причини описувати ту саму structure у трьох різних місцях.

Потрібно вибрати простий спосіб отримання metadata без зайвої duplication (рішення епіку 011).

---

## 47. Error Handling

Public Form повинна отримувати normalized errors.

Наприклад:

ValidationError  
RateLimitError  
SpamRejected  
ServerError

Не потрібно передавати browser raw database errors.

---

## 48. Success Flow

Після успішної submission Client Project вирішує UX.

Наприклад:

Success message  
Redirect  
Open confirmation  
Clear form

CMS Core не повинна жорстко задавати один UX.

---

## 49. Webhooks

У майбутньому Forms Module може підтримувати Webhooks через Integration Layer.

Наприклад:

New submission  
      ↓  
Webhook  
      ↓  
CRM

Це можна позначити:

Soon

на першому етапі.

---

## 50. Auto Reply

Можна передбачити:

Send confirmation email to visitor

як майбутню або optional feature.

Наприклад:

Thanks, we received your request.

**Status: Soon / Optional**

---

## 51. Anti-spam Dashboard

Складний anti-spam dashboard на старті не потрібен.

Достатньо:

Spam filter  
Mark as spam  
Restore

Advanced anti-spam analytics можна додати пізніше.

---

## 52. Data Retention

Forms можуть містити персональні дані.

Архітектура повинна дозволяти в майбутньому визначити:

retention period

наприклад автоматичне очищення старих submissions.

На старті це можна залишити:

**Status: Soon**

---

## 53. Що не потрібно створювати зараз

Не потрібно:

No-code Form Builder  
Conditional Form Builder  
Drag & Drop Fields  
Complex Workflow Engine  
CRM  
Marketing Automation  
Built-in Email Marketing  
Advanced Spam AI  
Universal PDF Generator

CMS Core повинен вирішувати основну задачу:

Form  
→ Submission  
→ Store  
→ Notify  
→ Manage

---

## 54. Фінальна схема

Client Project

ContactForm.vue  
QuoteForm.vue  
NewsletterForm.vue

       │  
       ▼

Forms Infrastructure — CMS Core

       │  
       ▼

Public Server Endpoint

       │  
       ▼

Validation  
Spam Protection  
Rate Limit

       │  
       ▼

Forms Service

   ┌───┴────┐  
   ▼        ▼

Repository Notifications  
   │        │  
   ▼        ▼

Database  Integration Layer

Admin:

Forms  
   ↓  
Form  
   ↓  
Submissions  
   ↓  
Read / Archive / Spam / Export

---

## 55. Основні правила

1. CMS Core не є no-code Form Builder.  
2. Структуру конкретної Form визначає Client Project.  
3. CMS Core забезпечує універсальну Forms Infrastructure.  
4. Form і Submission є різними поняттями.  
5. Public submission проходить через server-side endpoint.  
6. Server validation є обов'язковою.  
7. Frontend validation існує для UX.  
8. Submission зберігається до виконання secondary notifications.  
9. Notification failure не повинна втрачати submission.  
10. Form payload може зберігатися як JSON, якщо структура форм відрізняється.  
11. Submission має стандартні states: Unread / Read / Archived / Spam.  
12. Для звичайної роботи використовується Archive замість Delete.  
13. Public forms повинні мати basic spam protection та rate limiting.  
14. CAPTCHA підключається тільки за необхідності.  
15. Notification providers працюють через Integration Layer.  
16. Secrets не належать Forms Module.  
17. Form може бути Disabled, але її code definition контролює Developer.  
18. CMS users не можуть через Admin змінювати frontend structure форми.  
19. Submission sender не створюється як Auth User автоматично.  
20. File attachments використовують private Storage infrastructure.  
21. Permissions контролюють перегляд, export та settings.  
22. CSV достатньо як базовий Export format.  
23. Forms використовують Repository/Data Layer.  
24. Client Project визначає success UX.  
25. Не створювати CRM або marketing automation усередині Forms Module без реальної потреби.

---

## Ключовий принцип

> Розробник створює форму як звичайну частину Client Project, а CMS Core бере на себе всю повторювану інфраструктуру після натискання Submit.

Client Project відповідає за поля, дизайн та UX форми.

CMS Core відповідає за безпечний прийом даних, validation pipeline, storage, statuses, notifications та управління submissions через Admin Panel.

# Блок 15. Integrations Architecture

> Довгострокове бачення, не план V1. У V1 (`docs/MASTER_PLAN.md` C-97) немає реєстру провайдерів, UI інтеграцій і owner-managed секретів: сторонні сервіси й сповіщення — код Client Project (хук `cms:forms:submitted`), credentials — його server-only env. Аналітика (§19–20) — епік 013, підхід визначать D-62 і D-63.

## 1. Загальний опис

Integrations Module відповідає за підключення зовнішніх сервісів до CMS та Client Project.

Приклади:

* Telegram;  
* WhatsApp;  
* Google Analytics;  
* Google Tag Manager;  
* Email provider;  
* Stripe;  
* LiqPay;  
* WayForPay;  
* Webhooks;  
* інші зовнішні API.

Основна задача — не дозволити кожному модулю CMS напряму працювати з конкретним SDK або API зовнішнього сервісу.

Використовується єдиний **Integration Layer**.

Основний принцип:

> CMS feature викликає абстрактну інтеграцію, а конкретний Integration Provider відповідає за роботу із зовнішнім сервісом.

---

## 2. Загальна схема

Наприклад, Forms Module хоче відправити повідомлення в Telegram.

Не рекомендується:

Forms  
  ↓  
Telegram SDK

Правильна схема:

Forms Module  
    ↓  
Integration Layer  
    ↓  
Telegram Provider  
    ↓  
Telegram API

Так само:

Checkout  
    ↓  
Integration Layer  
    ↓  
Stripe Provider  
    ↓  
Stripe API

---

## 3. Integration Provider

Кожна зовнішня інтеграція реалізується окремим Provider.

Наприклад:

TelegramIntegration  
EmailIntegration  
StripeIntegration  
GoogleAnalyticsIntegration

Provider відповідає за:

* connection;  
* validation configuration;  
* виконання API requests;  
* нормалізацію помилок;  
* health/status check.

---

## 4. Інтеграція не повинна бути універсальною на 100%

Не потрібно створювати один великий interface типу:

connect()  
send()  
charge()  
track()  
notify()  
upload()  
...

для абсолютно всіх сервісів.

Telegram і Stripe мають принципово різну бізнес-логіку.

Краще мати невеликі capability contracts.

Наприклад:

NotificationProvider  
PaymentProvider  
AnalyticsProvider  
WebhookProvider

Конкретний provider реалізує тільки потрібні capabilities.

---

## 5. Категорії інтеграцій

Логічно можна виділити:

| Категорія | Приклади |
| ----- | ----- |
| Communication | Telegram, WhatsApp |
| Email | SMTP, Resend, іншій provider |
| Analytics | GA4, GTM |
| Payments | Stripe, LiqPay, WayForPay |
| Automation | Webhooks |
| Other | project-specific APIs |

Це переважно UI/організаційний поділ.

Не потрібно створювати складну hierarchy в коді тільки через ці категорії.

---

## 6. Core Integrations і Client Integrations

CMS Core може містити integrations, які часто використовуються в багатьох проєктах.

Наприклад:

Telegram  
Email  
Google Analytics  
Google Tag Manager

Платіжні інтеграції теж можуть знаходитися в Core, якщо вони реально повторюються між проєктами.

Client Project може додати специфічний provider.

Наприклад:

ClientCRMIntegration  
CustomBookingAPI  
WarehouseIntegration

Для цього не потрібно змінювати базову бізнес-логіку CMS Core.

---

## 7. Registration

Client Project або CMS Core повинен мати простий механізм реєстрації інтеграції.

Концептуально:

registerIntegration({  
  key: 'telegram',  
  provider: TelegramIntegration  
})

Точний API визначається при реалізації.

Не потрібно створювати dynamic plugin marketplace або складну runtime plugin loader систему.

---

## 8. Integration State

Кожна інтеграція повинна мати зрозумілий стан.

Базові стани:

Not Connected  
Connected  
Needs Attention  
Disabled  
Coming Soon

#### Not Connected

Не налаштована.

#### Connected

Configuration валідна, інтеграція працює.

#### Needs Attention

Наприклад:

* invalid token;  
* webhook broken;  
* API unavailable;  
* configuration incomplete.

#### Disabled

Configuration може існувати, але інтеграція вимкнена.

#### Coming Soon

Функція показана в UI, але ще не реалізована.

---

## 9. Admin UI

Integrations Page може показувати cards.

Наприклад:

Telegram  
Connected  
\[Configure\]

Stripe  
Not Connected  
\[Connect\]

WhatsApp  
Coming Soon

Якщо є проблеми:

3 integrations need attention

може показуватися system warning.

---

## 10. Configure

Кнопка Configure відкриває UI конкретної інтеграції.

Наприклад Telegram:

Bot Token  
Chat ID  
Notifications Enabled  
Test Connection

Stripe:

Publishable Key  
Secret configured  
Webhook status  
Test mode

Не потрібно змушувати всі integrations використовувати абсолютно однакову форму.

CMS Core може надати спільний layout, а поля визначає provider.

---

## 11. Secrets Management

API keys, tokens та passwords не повинні зберігатися як звичайні Runtime Settings.

Вони використовують Secrets Management із Security & System Architecture.

Наприклад:

Telegram Bot Token  
Stripe Secret  
SMTP Password

Після збереження secret:

••••••••••••

Власник може:

Replace  
Remove  
Validate

але не повинен бачити raw secret повторно.

---

## 12. Public і Server Keys

Потрібно розрізняти public і private configuration.

Наприклад Stripe:

Publishable Key

може бути доступний browser.

Secret Key

тільки server-side.

Provider визначає, які values можуть бути public.

---

## 13. Integration Settings

Не секретні параметри зберігаються як Runtime Settings.

Наприклад Telegram:

enabled  
sendFormNotifications  
chat destination

а token зберігається окремо як secret.

Тобто:

Integration Settings  
\+  
Secrets  
=  
Effective Integration Configuration

---

## 14. Provider API

Provider повинен мати простий application API.

Наприклад для notifications:

notificationProvider.send(message)

для payments:

paymentProvider.createPayment(...)

для analytics:

analyticsProvider.track(...)

CMS feature не повинна знати:

Telegram endpoint  
Stripe SDK internals  
GA HTTP API details

---

## 15. Forms Integration

Forms Module може викликати notification capability.

Flow:

Submission  
    ↓  
Save to Database  
    ↓  
Notification Service  
    ↓  
Telegram Provider  
Email Provider

Якщо Telegram не працює:

Submission залишається збереженою.

Integration failure не повинен знищувати основну бізнес-операцію.

---

## 16. Secondary Operations

За замовчуванням integration side effects є secondary operations.

Наприклад:

Save submission

є primary.

Send Telegram

secondary.

Send Email

secondary.

Primary operation не повинна rollback лише тому, що Telegram тимчасово недоступний.

Виняток — інтеграції, де external operation і є primary business operation, наприклад payment.

---

## 17. Payment Integrations

Payment integrations потребують окремої уваги.

Наприклад:

Stripe  
LiqPay  
WayForPay

Frontend не повинен визначати фінальний payment status самостійно.

Flow:

Client  
  ↓  
Backend  
  ↓  
Payment Provider  
  ↓  
Payment Gateway

Фінальний статус підтверджується backend/webhook.

---

## 18. Payment Webhooks

Для payment providers webhook verification є обов'язковою частиною integration.

Наприклад:

Stripe  
  ↓  
Webhook  
  ↓  
Nuxt/Nest Backend  
  ↓  
Verify signature  
  ↓  
Update payment state

Не можна довіряти:

success=true

лише тому, що browser redirect повідомив про успішну оплату.

---

## 19. Analytics Integrations

Analytics трохи відрізняється від інших integrations.

Для GA/GTM CMS може:

* зберігати configuration;  
* показувати connection status;  
* додавати необхідні scripts;  
* отримувати limited analytics data для Dashboard.

Але CMS не повинна намагатися повністю замінити Google Analytics.

---

## 20. Public Analytics Scripts

GA/GTM code повинен підключатися тільки якщо integration:

enabled \+ configured

Не потрібно включати analytics scripts у public bundle, якщо integration вимкнена.

Також потрібно враховувати cookie/consent policy конкретного проєкту.

---

## 21. Email Provider

Email краще розглядати як provider capability.

Наприклад:

EmailProvider

реалізаціями можуть бути:

SMTP  
Resend  
інший provider

Forms Module та інші feature просто викликають:

sendEmail()

і не залежать від конкретного provider.

---

## 22. Один активний Provider

Для певної capability зазвичай достатньо одного активного provider.

Наприклад:

Email  
→ Resend

або:

Email  
→ SMTP

Не потрібно підтримувати складне multi-provider routing без потреби.

---

## 23. Telegram

Telegram — хороший базовий notification provider.

Може використовуватися для:

* Forms submissions;  
* System alerts;  
* integration errors;  
* project-specific notifications.

Але конкретний module сам визначає, коли потрібно надіслати notification.

Telegram provider лише вміє доставити повідомлення.

---

## 24. WhatsApp

WhatsApp можна закласти як:

Coming Soon

у V1.

Причина — API та business setup можуть бути значно складнішими, ніж Telegram.

Architecture при цьому вже підтримує додавання provider пізніше.

---

## 25. Webhook Integration

Webhook — універсальна проста інтеграція.

Наприклад:

New Form Submission  
      ↓  
Webhook  
      ↓  
Client CRM

Webhook configuration:

URL  
secret  
enabled  
event types

Webhook payload формується backend.

---

## 26. Webhook Security

Webhook повинен підтримувати signature/secret verification.

Не варто просто відправляти unsigned JSON у зовнішній endpoint, якщо webhook використовується для важливих даних.

---

## 27. Integration Events

Можна використовувати просту внутрішню event-модель.

Наприклад:

form.submitted  
content.published  
user.created

і integrations можуть реагувати на певні events.

Але не потрібно зараз створювати повноцінний Event Bus framework.

На першому етапі достатньо простих service calls / hooks.

---

## 28. Hooks

CMS Core може в майбутньому надати прості hooks:

afterFormSubmit  
afterPublish  
afterUserCreate

Client Project може підключити власну integration logic.

Це значно простіше, ніж plugin system.

---

## 29. Retry

Для secondary integration operations корисно мати можливість повторити невдалу операцію.

Наприклад:

Telegram failed

не обов'язково одразу будувати складну queue system.

Для V1 достатньо:

* error logging;  
* manual retry або простий server retry.

Advanced jobs/queues можна додати пізніше.

---

## 30. Integration Errors

External API errors повинні нормалізуватися.

UI не повинен показувати:

HTTP 401 invalid_grant XYZ...

як є.

Краще:

Telegram token is invalid.

або:

Stripe connection needs attention.

Technical details можуть залишатися в logs.

---

## 31. Health Check

Provider може підтримувати:

testConnection()

або:

healthCheck()

Admin натискає:

Test Connection

і отримує:

Connected

або зрозумілу помилку.

---

## 32. Connection Status

Не потрібно виконувати зовнішній API request при кожному відкритті Integrations Page.

Можна зберігати:

last checked  
last success  
last error

а реальну перевірку запускати:

* при Save;  
* вручну через Test;  
* періодично в майбутньому.

---

## 33. Diagnostics

System → Diagnostics може використовувати Integration Layer.

Наприклад:

Email       ✓  
Telegram    ✓  
Stripe      !  
GA          ✓

Це стикується з Security & System Architecture.

---

## 34. Activity

Meaningful integration actions можуть записуватися в Activity:

Telegram connected  
Stripe configuration replaced  
Integration disabled  
Webhook changed

Secret value ніколи не записується в Activity.

---

## 35. Logging

Technical integration errors можуть йти в application/server logs.

Не потрібно зберігати необмежено всі зовнішні API responses в database.

Особливо якщо вони можуть містити sensitive data.

---

## 36. Permissions

Приклади:

integrations.view  
integrations.configure  
integrations.test  
integrations.disable

Зазвичай Configure повинен бути доступний Owner/Admin.

Editor не потребує доступу.

---

## 37. Integration Removal

Видалення integration configuration не повинно видаляти історичні business data.

Наприклад, якщо Stripe відключений, старі payment records не повинні зникати.

Integration configuration та business records — різні речі.

---

## 38. Provider-specific SDK

Якщо конкретний provider має офіційний SDK, його можна використовувати всередині Integration Provider.

Наприклад:

StripeProvider  
    ↓  
Stripe SDK

Але Stripe SDK не повинен імпортуватися в:

Forms  
Products  
Admin Components

---

## 39. Lazy Loading

Великі provider SDK бажано не включати без необхідності.

Наприклад, якщо Client Project не використовує Stripe, Stripe-specific code не повинен потрапляти в runtime bundle.

Integration architecture повинна враховувати:

dynamic import  
server-only dependencies  
tree shaking

---

## 40. Server-side Provider

Більшість integration providers, особливо з secrets, повинні працювати server-side.

Наприклад:

Telegram  
Stripe  
SMTP  
Webhooks

Browser викликає server API.

Secret ніколи не потрапляє до frontend.

---

## 41. Client-side Integration

Деякі integrations мають client-side частину.

Наприклад:

Google Analytics  
GTM  
Stripe.js

Provider повинен чітко розділяти:

server configuration  
public/client runtime

---

## 42. Environment-specific Integrations

Development і Production можуть використовувати різну configuration.

Наприклад:

Stripe Test

у development.

Stripe Live

у production.

Secrets повинні підтримувати environment-specific values там, де це необхідно.

Не потрібно реалізовувати складний environment dashboard на старті — достатньо правильної infrastructure architecture.

---

## 43. Initial Setup

> Setup Wizard — поза V1 (див. Блок 11 §11). Пункт описує ідею на майбутнє.

Setup Wizard може пропонувати підключити базові integrations.

Наприклад:

Email  
Telegram  
Analytics

але integrations не повинні блокувати завершення setup, якщо вони optional.

---

## 44. Integration Templates

CMS Core може мати готові Providers для типових services.

Це дає Client Project готову інтеграцію без копіювання коду.

Наприклад:

TelegramProvider  
GAProvider  
ResendProvider

Оновлення та bugfix provider надходять через CMS Core package.

---

## 45. Client-specific Integration

Якщо клієнту потрібен власний CRM:

Client Project  
    ↓  
CustomCRMIntegration

він реалізується в Client Project.

CMS Core може надати base types/helpers, але не повинен включати клієнтський API у Core.

---

## 46. Не робити Plugin System зараз

Integration Registration не означає, що потрібна plugin marketplace architecture.

Не потрібно:

dynamic plugins from npm at runtime  
plugin sandbox  
plugin store  
plugin permissions engine  
plugin marketplace

Проста registration API достатня.

---

## 47. Feature Flags

Integration може бути недоступна для конкретного Client Project через Project Config.

Наприклад:

payments = false

Тоді Payments section взагалі не показується.

Runtime setting не може увімкнути feature, якої технічно немає в проєкті.

---

## 48. Coming Soon

Integrations Page може показувати майбутні integrations.

Наприклад:

WhatsApp  
Coming Soon

або:

CRM Webhooks  
Soon

Але таких cards не повинно бути десятки.

Показувати тільки integrations, які реально плануються найближчим часом і мають цінність для користувача.

---

## 49. Необов'язкові V1 Integrations

Для першої версії достатньо невеликого базового набору.

Наприклад:

Telegram  
Email  
Google Analytics  
Google Tag Manager

Payments додаються в проєкти, де вони реально потрібні.

Не потрібно реалізовувати всі 8 integrations із UI-макету до запуску Core.

---

## 50. Що не потрібно створювати зараз

Не потрібно:

Plugin Marketplace  
Complex Event Bus  
Distributed Queue System  
Multi-provider routing  
Integration Workflow Builder  
Zapier replacement  
Custom scripting engine  
OAuth framework для всіх можливих provider

Integration Layer повинен залишатися невеликим і передбачуваним.

---

## 51. Фінальна схема

                 CMS Features

 Forms    Payments    Analytics    System  
   │          │           │          │  
   └──────────┴───────────┴──────────┘  
                      │  
                      ▼  
               Integration Layer  
                      │  
      ┌───────────────┼────────────────┐  
      ▼               ▼                ▼  
 Notification     Payment          Analytics  
 Capability       Capability       Capability  
      │               │                │  
   Telegram         Stripe             GA  
   Email            LiqPay             GTM  
      │               │                │  
      ▼               ▼                ▼  
                External Services

Project-specific:

Client Project  
     ↓  
Custom Integration Provider  
     ↓  
Integration Layer

---

## 52. Основні правила

1. CMS features не працюють напряму із зовнішніми API.  
2. Зовнішній сервіс інкапсулюється в Integration Provider.  
3. Не створювати один giant interface для всіх integrations.  
4. Використовувати невеликі capability contracts.  
5. Core integrations знаходяться в CMS Core.  
6. Client-specific integrations знаходяться в Client Project.  
7. Integrations реєструються через простий registration mechanism.  
8. Secret configuration зберігається через Secrets Management.  
9. Raw secrets не повертаються в browser.  
10. Public та server configuration чітко розділяються.  
11. Forms та інші feature працюють через Integration Layer.  
12. Secondary integration failure не повинен руйнувати успішну primary operation.  
13. Payment integrations підтверджуються backend/webhook.  
14. Не довіряти payment status із browser.  
15. Analytics не повинна автоматично завантажувати scripts, якщо integration disabled.  
16. Provider SDK ізольований усередині Provider.  
17. Великі/непотрібні SDK не повинні входити в bundle проєктів, які їх не використовують.  
18. Integration configuration враховує permissions.  
19. Integration errors нормалізуються.  
20. Provider може мати health/test connection API.  
21. Sensitive values не записуються в Activity або logs.  
22. Integration можна Disable без видалення історичних business data.  
23. Project-specific API не додаються в CMS Core.  
24. Не створювати plugin marketplace architecture без реальної необхідності.  
25. Майбутні integrations можна показувати як Soon, але лише вибірково.

---

## Ключовий принцип

> Зовнішній сервіс є змінною реалізацією capability, а бізнес-модуль CMS повинен залежати від самої capability, а не від Telegram, Stripe, Resend або іншого конкретного provider.

Це дозволяє додавати, замінювати та оновлювати integrations без переписування Forms, Payments, Admin UI або інших частин Client Project.

# Блок 16. CLI / Updates / Developer Workflow

## 1. Загальний опис

CMS Core є окремим публічним npm-пакетом, який підключається до будь-якого Nuxt-проєкту.

CLI відповідає за:

* створення нового проєкту;  
* підключення CMS Core;  
* початкове налаштування;  
* оновлення Core;  
* запуск міграцій;  
* перевірку сумісності;  
* спрощення повсякденної роботи розробника.

Основна задача CLI — прибрати ручні повторювані дії та зробити створення нового проєкту максимально простим.

---

## 2. Основний принцип

Розробник не повинен вручну:

* копіювати CMS Core;  
* копіювати migrations;  
* створювати базову структуру;  
* змінювати десятки конфігів.

Усе це повинно виконуватися CLI.

---

## 3. Створення нового проєкту

Основний сценарій:

npx nuxt-cms create

CLI:

↓

створює новий Nuxt-проєкт через офіційний nuxi

↓

встановлює CMS Core

↓

додає базову конфігурацію

↓

створює необхідну структуру директорій

↓

копіює Core migrations

↓

створює Project Config

↓

готово

CLI не повинен замінювати офіційний генератор Nuxt.

Він використовує його всередині.

---

## 4. Додавання CMS у вже існуючий Nuxt-проєкт

Другий сценарій:

npx nuxt-cms add

CLI:

* перевіряє, що це Nuxt-проєкт;  
* встановлює CMS Core;  
* додає необхідну конфігурацію;  
* підключає Admin із Core layer (Admin не генерується в Client Project);  
* додає Core migrations;  
* не змінює існуючу бізнес-логіку Client Project.

---

## 5. Структура проєкту

Після генерації розробник одразу отримує готову структуру.

Наприклад:

app/  
├── pages/  
├── components/  
├── repositories/  
└── composables/

cms.config.ts  
supabase/migrations/

(структура Nuxt 4: `pages/`, `components/` тощо — всередині `app/`; Admin приходить із CMS Core layer, тому `admin/` у Client Project не створюється)

Точна структура може змінюватися під час реалізації, але вона повинна залишатися стабільною між версіями.

---

## 6. CMS Core як окремий пакет

CMS Core живе окремо від Client Project.

Наприклад:

CMS Core  
↓

npm package

Client Project:

Nuxt Project  
↓

install CMS Core

Оновлення Core не повинно вимагати копіювання файлів між проєктами.

---

## 7. Semantic Versioning

CMS Core використовує Semantic Versioning.

Наприклад:

1.2.3

де:

* Major — можливі breaking changes;  
* Minor — нові можливості без порушення сумісності;  
* Patch — bug fixes.

Це дозволяє безпечно оновлювати клієнтські проєкти.

---

## 8. Оновлення CMS Core

CLI повинен підтримувати простий процес оновлення.

Наприклад:

npx nuxt-cms update

CLI:

* перевіряє поточну версію;  
* визначає доступні оновлення;  
* оновлює npm package;  
* перевіряє schema version;  
* пропонує виконати міграції.

---

## 9. Міграції

CMS Core має власі Core Migrations.

Client Project має власі Project Migrations.

Ці дві групи не повинні змішуватися.

Наприклад:

CMS Core  
↓

Core Migrations

Client Project  
↓

Project Migrations

CLI повинен запускати їх у правильному порядку.

---

## 10. Schema Version

У системі повинна існувати Schema Version.

Наприклад:

CMS Core

1.4.0

↓

Database Schema

1.4

CLI повинен перевіряти відповідність між версією Core та схемою бази.

---

## 11. Breaking Changes

Якщо нова версія містить breaking changes, CLI повинен попередити розробника.

Наприклад:

Current:

1.3

Latest:

2.0

Breaking changes detected.

Після цього розробник сам приймає рішення про оновлення.

---

## 12. Migration Runner

Після оновлення CLI може запропонувати:

Run migrations?

Якщо відповідь позитивна — запускаються тільки ті Core migrations, які ще не були застосовані.

---

## 13. Doctor

CLI може містити команду:

npx nuxt-cms doctor

Вона перевіряє:

* Nuxt Version;  
* CMS Core Version;  
* Database Schema Version;  
* конфігурацію;  
* підключення до Backend;  
* основні залежності.

Doctor не змінює проєкт.

Він лише повідомляє про проблеми.

---

## 14. Project Manifest

Після інсталяції створюється службовий Project Manifest.

Наприклад:

CMS Version

Schema Version

Project ID

Installed Features

CLI використовує його для оновлень і перевірок.

---

## 15. Feature Detection

CLI не повинен припускати, що в кожному проєкті є однаковий набір модулів.

Наприклад:

Payments

Not installed

Тоді CLI не намагатиметься оновлювати відповідні міграції або конфігурацію.

---

## 16. Safe Update

Оновлення не повинно автоматично змінювати код Client Project.

CLI може:

* оновити Core;  
* оновити migrations;  
* повідомити про breaking changes.

Але не повинен переписувати кастомні Vue-компоненти або бізнес-логіку.

---

## 17. Update Guide

Для Major-релізів бажано підтримувати короткий Migration Guide.

Наприклад:

1.3 → 2.0

• перейменовано...  
• потрібно змінити...  
• потрібно запустити...

Це значно спрощує оновлення старих проєктів.

---

## 18. CLI не замінює Package Manager

CLI не повинен ставати альтернативою npm.

Він працює поверх стандартних інструментів.

Встановлення залежностей виконує npm/pnpm.

---

## 19. Конфігурація

CLI працює з:

* Project Config;  
* CMS Config;  
* Environment;  
* Project Manifest.

Він не повинен змінювати Runtime Settings користувача.

---

## 20. Повторний запуск

Команди CLI повинні бути максимально idempotent.

Наприклад:

npx nuxt-cms add

не повинен створити дублікати:

* migrations;  
* конфігурації;  
* директорій.

CLI повинен вміти визначати вже встановлені компоненти.

---

## 21. Developer Experience

Основна ціль CLI — зробити роботу максимально простою.

Типовий сценарій:

npx nuxt-cms create

↓

відразу отримати готовий Nuxt-проєкт із CMS Core.

Типовий сценарій оновлення:

npx nuxt-cms update

↓

оновити Core

↓

запустити міграції

↓

готово.

---

## 22. Що не потрібно створювати зараз

Не потрібно:

* власний генератор Nuxt;  
* власний package manager;  
* власний dependency manager;  
* cloud installer;  
* web installer;  
* interactive wizard на десятки кроків;  
* автоматичне виправлення всіх можливих конфліктів.

CLI повинен залишатися невеликим і передбачуваним.

---

## 23. Основні правила

1. CMS Core є окремим публічним npm-пакетом.  
2. CLI використовує офіційний `nuxi`, а не власний генератор Nuxt.  
3. `nuxt-cms create` створює новий Nuxt-проєкт і встановлює CMS Core.  
4. `nuxt-cms add` додає CMS у вже існуючий Nuxt-проєкт.  
5. Core та Client Project залишаються незалежними.  
6. Core Migrations і Project Migrations розділені.  
7. CLI підтримує Semantic Versioning.  
8. Оновлення проходить через стандартний процес `update → migrations`.  
9. CLI не змінює кастомний код Client Project автоматично.  
10. `doctor` перевіряє стан проєкту, але не вносить зміни.  
11. Повторний запуск команд не повинен ламати або дублювати структуру проєкту.  
12. Основна мета CLI — максимально спростити створення, оновлення та підтримку проєктів без приховування того, як працює система.

---

## Ключовий принцип

> **Розробник повинен витрачати час на створення функціональності для клієнта, а не на розгортання, копіювання конфігурацій і ручне оновлення CMS Core.** CLI автоматизує повторювані технічні задачі, залишаючи контроль над бізнес-логікою та структурою проєкту за розробником.


# Блок 17. Performance Architecture

## 1. Загальний опис

Performance Architecture визначає правила, за якими CMS Core, Admin Panel, Edit Mode і Client Project повинні працювати без зайвого навантаження на публічний сайт.

Основна задача — зробити так, щоб функціональність CMS не погіршувала швидкість звичайного Public Website.

Головний принцип:

> Public Runtime повинен завантажувати тільки те, що реально потрібно відвідувачу сайту.

Admin, Edit Mode, Tiptap, Media Picker, History, Draft Manager та інші CMS-specific feature не повинні потрапляти в public bundle без необхідності.

---

## 2. Розділення Runtime

Система повинна бути розділена щонайменше на три runtime-зони:

Public Runtime  
Admin Runtime  
Editor Runtime

#### Public Runtime

Містить тільки:

* client site components;  
* легкі CMS primitives;  
* data fetching;  
* необхідну business logic;  
* public integrations.

#### Admin Runtime

Містить:

* Dashboard;  
* Tables;  
* Forms;  
* Settings;  
* Media Library;  
* Activity;  
* Integrations.

#### Editor Runtime

Містить:

* Editor Engine;  
* Toolbar;  
* Overlay;  
* Draft Manager;  
* History;  
* Tiptap;  
* Media Picker;  
* editor-specific stores.

---

## 3. Public Runtime є пріоритетом

Усі архітектурні рішення повинні перевірятися питанням:

> Чи додає ця feature зайвий JS, CSS або requests у Public Website?

Якщо відповідь "так", feature повинна бути ізольована або lazy-loaded.

---

## 4. Code Splitting

Admin та Edit Mode повинні бути окремими chunks.

Наприклад:

/public/\*

не повинно автоматично тягнути:

/admin/\*  
/admin/edit/\*

Завантаження Editor Runtime відбувається лише після відкриття Edit Mode.

---

## 5. Dynamic Imports

Важкі feature та dependencies повинні завантажуватися динамічно.

Наприклад:

Tiptap  
Media Picker  
Charts  
Large Admin Tables  
Payment SDK

не повинні імпортуватися глобально.

---

## 6. Editor Dependencies

Editor-specific dependencies повинні бути ізольовані.

Наприклад `CmsText` у Public Mode не повинен статично імпортувати:

Tiptap  
EditorToolbar  
HistoryManager  
DraftManager

В іншому випадку bundler може включити ці залежності в Public bundle.

---

## 7. CSS Splitting

Стилі також повинні бути розділені.

Наприклад:

runtime.css  
admin.css  
editor.css

Public Website не повинен отримувати:

* Admin tables styles;  
* modal styles;  
* editor overlays;  
* toolbar;  
* admin sidebar;  
* editor controls.

---

## 8. CMS Primitives

`CmsText`, `CmsImage`, `CmsButton` та інші primitives у Public Mode повинні бути максимально легкими.

У public path не повинно бути:

editor watchers  
keyboard listeners  
selection tracking  
history tracking  
draft logic  
editor requests

CMS behavior активується тільки в Edit Mode.

---

## 9. SSR First

Public Website за замовчуванням повинен використовувати Nuxt SSR/SSR-friendly rendering там, де це доцільно.

Це важливо для:

* SEO;  
* First Contentful Paint;  
* social previews;  
* initial page load.

Не потрібно переводити весь сайт у client-only SPA через існування CMS.

---

## 10. Client-side JavaScript

Не кожен компонент потребує повної hydration.

Статичні або малоінтерактивні частини сайту бажано залишати максимально простими.

Client-side JS потрібен тільки там, де є реальна interaction logic.

---

## 11. Hydration

Не потрібно робити hydration optimization вручну на старті для кожного компонента.

Спочатку потрібно:

* правильно розділити runtime;  
* не затягувати editor dependencies;  
* контролювати bundle.

Після цього можна додавати більш тонкі оптимізації.

---

## 12. Data Fetching

Дані бажано отримувати на рівні Page або Feature.

Наприклад:

Product Page  
   ↓  
ProductsRepository.getBySlug()  
   ↓  
Product data  
   ↓  
ProductHero  
ProductDetails  
RelatedProducts

Не потрібно:

CmsText → request  
CmsImage → request  
ProductCard → request

для одного й того самого object.

---

## 13. Avoid N+1 Requests

Repository повинен дозволяти отримати дані логічними запитами.

Наприклад Product Page може отримати:

Product  
Category  
Media

в одному або декількох оптимізованих requests.

Не потрібно створювати десятки послідовних browser requests.

---

## 14. Repository оптимізація

Repository Layer може:

* використовувати joins;  
* batch queries;  
* server-side data transformation;  
* кеш.

UI не повинен знати конкретну optimization strategy.

---

## 15. Caching

Кешування повинно застосовуватися тільки там, де це реально дає користь.

Можливі рівні:

Browser  
Nuxt  
Server  
Database  
CDN

Не потрібно створювати власний caching framework.

---

## 16. Public Content Cache

Published content зазвичай змінюється значно рідше, ніж читається.

Тому Pages, Products, Blog Posts та інший public content можна кешувати.

Після Publish запускається invalidation/revalidation.

---

## 17. Draft не кешується як Public Content

Draft не повинен випадково потрапляти в public cache.

Public і Draft data повинні мати чітко розділені cache keys або endpoints.

---

## 18. Cache Invalidation

Publish повинен повідомляти caching layer, що конкретний content змінився.

Наприклад:

Product \#15 published  
        ↓  
invalidate Product \#15  
        ↓  
invalidate related listing pages if needed

Не обов'язково очищати весь cache сайту після кожної зміни.

---

## 19. Media Optimization

Зображення є одним із найбільших факторів performance.

Потрібно використовувати:

* responsive images;  
* lazy loading;  
* correct dimensions;  
* modern formats;  
* CDN/image provider там, де це доступно.

Не потрібно завантажувати original 5000px image для картки 300px.

---

## 20. Image Dimensions

CMS/Media Layer бажано знати dimensions image.

Frontend може використовувати їх для коректного layout і зменшення CLS.

---

## 21. Lazy Loading Images

Зображення поза initial viewport зазвичай повинні lazy-load.

Hero/LCP image, навпаки, не повинна сліпо lazy-load.

---

## 22. LCP Images

Для основного Hero image або іншого Largest Contentful Paint елемента потрібно дозволити:

priority  
preload  
eager loading

де це реально потрібно.

Це визначає Client Project.

---

## 23. SVG

SVG не потребує image optimization pipeline у тому ж вигляді, що raster images.

Не потрібно автоматично перетворювати всі SVG у WebP.

---

## 24. Video

Великі video files можуть дуже сильно впливати на performance.

Для background video або великих media бажано:

* lazy load;  
* poster;  
* external video provider;  
* compressed assets.

CMS Core не повинен сам ставати video transcoding platform.

---

## 25. Third-party Scripts

Зовнішні integrations можуть бути значним джерелом performance проблем.

Наприклад:

GA  
GTM  
chat widgets  
maps  
payment SDK

Вони повинні завантажуватися тільки якщо integration реально увімкнена.

---

## 26. Conditional Integrations

Якщо:

Google Analytics = disabled

GA script не завантажується.

Якщо:

Stripe = not used on current route

Stripe client SDK бажано не завантажувати глобально.

---

## 27. Admin Performance

Admin Panel не має таких жорстких SEO/LCP вимог, як Public Website, але все одно повинна залишатися швидкою.

Для великих списків використовуються:

* pagination;  
* server filtering;  
* server sorting;  
* lazy loading.

---

## 28. Великі таблиці

Не завантажувати:

50 000 submissions  
10 000 products  
20 000 activity entries

в browser одразу.

Pagination або cursor-based loading є обов'язковими для великих dataset.

---

## 29. Search

Search не повинен щоразу завантажувати всі дані та фільтрувати їх у browser.

Для великих collection search виконується backend/database.

---

## 30. Debounce

Search input, autosave та інші часті operations повинні використовувати debounce, якщо це зменшує непотрібну кількість requests.

Наприклад:

Search  
Autosave  
Slug availability check

---

## 31. Autosave

Autosave не повинен виконувати backend request після кожного натискання клавіші.

Рекомендована модель:

local changes  
    ↓  
debounce  
    ↓  
Save Draft

---

## 32. Edit Mode Performance

Edit Mode може бути важчим за Public Website, але не повинен ставати повільним через кількість editable fields.

Не потрібно створювати:

* окремий watcher для кожного поля;  
* глобальний listener для кожного component;  
* великий DOM overlay для кожного editable element постійно.

---

## 33. Hover / Selection

Editor overlays повинні бути максимально централізованими.

Наприклад один Selection Manager значно дешевший і простіший, ніж сотні незалежних toolbar instances.

---

## 34. Rich Text

Tiptap не потрібно ініціалізувати для всіх Rich Text fields одночасно.

Краще ініціалізувати editor тоді, коли конкретне поле реально переходить у Editing state.

---

## 35. Collections в Edit Mode

Великі local collections не повинні створювати складний редакторський UI для всіх items одночасно.

Controls з'являються для активного / selected item.

---

## 36. Admin Charts

Charts на Dashboard/Analytics повинні lazy-load, якщо library важка.

Chart library не повинна потрапляти в Public bundle.

---

## 37. Tree Shaking

CMS Core imports повинні бути організовані так, щоб bundler міг виключати невикористаний код.

Не створювати один великий entry point, який side-effect import'ами підключає всі feature.

---

## 38. Side Effects

Пакет CMS Core повинен мінімізувати глобальні side effects.

Наприклад не потрібно при import Core автоматично:

initialize editor  
load analytics  
load all CSS  
register all providers

Initialization повинна бути контрольованою.

---

## 39. Core Modules

Feature, яких немає в конкретному проєкті, бажано не тягнути в runtime.

Наприклад:

Payments disabled  
Forms disabled  
Analytics disabled

відповідний код не повинен без причини потрапляти в bundle.

---

## 40. Bundle Monitoring

Production build бажано періодично аналізувати.

Потрібно контролювати:

* public JS size;  
* editor chunk size;  
* admin chunk size;  
* duplicate dependencies;  
* великий third-party code.

---

## 41. Performance Regression

Після важливих Core updates потрібно перевіряти, що public bundle випадково не став значно більшим.

Наприклад bug:

CmsText imports EditorToolbar

може непомітно додати сотні KB у кожну public page.

---

## 42. Performance Acceptance Criteria

Можна мати кілька простих automated checks.

Наприклад:

Public routes do not load Tiptap  
Public routes do not load Admin chunk  
Public routes do not load Editor CSS

Точні bundle limits можна визначити пізніше.

---

## 43. Database Indexes

Поля, які часто використовуються для:

slug  
status  
locale  
created_at  
foreign keys

повинні мати відповідні indexes там, де це потрібно.

Не потрібно індексувати кожну колонку.

Індекси визначаються реальними query patterns.

---

## 44. Pagination Strategy

Для маленьких collection звичайна page/limit pagination достатня.

Для дуже великих dataset можна перейти на cursor pagination.

Не потрібно ускладнювати всі repositories cursor pagination на старті.

---

## 45. Realtime

Supabase Realtime не потрібно автоматично підключати до всіх таблиць.

Realtime використовується тільки там, де є конкретна потреба.

Наприклад:

Content Locks  
Presence

можуть його використовувати.

Products list або Settings не потребують постійної realtime subscription без причини.

---

## 46. Background Operations

Повільні secondary tasks у майбутньому можна переносити в background jobs.

Наприклад:

Email  
Webhook retries  
Image processing

Але на першій версії не потрібно будувати queue infrastructure, якщо реального bottleneck немає.

---

## 47. Server-side Secrets і Performance

Server-only providers та SDK не повинні потрапляти в browser bundle.

Наприклад:

Stripe Server SDK  
SMTP library  
Supabase Admin client

повинні імпортуватися тільки server-side.

---

## 48. Loading States

Performance — це не лише абсолютна швидкість.

UI повинен мати правильний perceived performance:

skeleton  
loading state  
optimistic UI там, де безпечно

але не потрібно додавати складні animations.

---

## 49. Optimistic UI

Optimistic updates можна використовувати для простих безпечних actions.

Наприклад:

Mark submission as read

Але Publish, Payments або destructive operations не повинні показувати success до реального підтвердження backend.

---

## 50. Public Website не залежить від Admin availability

Якщо якась Admin-specific integration або Editor API тимчасово недоступні, Published Website повинен продовжувати працювати.

Public Runtime повинен залежати тільки від необхідних public data/services.

---

## 51. Graceful Failure

Якщо analytics або сторонній widget не завантажився, це не повинно ламати основний сайт.

Secondary integrations повинні fail independently.

---

## 52. Не оптимізувати завчасно

Не потрібно створювати:

custom CDN  
custom cache engine  
Redis  
complex distributed queues  
microservices  
edge architecture

лише тому, що це "швидше".

Спочатку використовуються стандартні можливості Nuxt, CDN/hosting та Supabase.

---

## 53. Порядок оптимізації

Якщо з'являється performance problem:

Measure  
   ↓  
Identify bottleneck  
   ↓  
Optimize  
   ↓  
Measure again

Не потрібно будувати складну інфраструктуру на припущеннях.

---

## 54. Фінальна схема

Public:

Client Page  
    ↓  
Light CMS Runtime  
    ↓  
Repository  
    ↓  
Published Data  
    ↓  
Optimized Media

NO:  
Admin  
Editor  
Tiptap  
History  
Media Picker

Edit:

Client Page  
    ↓  
CMS Runtime  
    \+  
Editor Runtime (lazy)  
    ↓  
Draft Data

Admin:

Admin Route  
    ↓  
Admin Runtime  
    ↓  
Repositories

---

## 55. Основні правила

1. Public performance має найвищий пріоритет.  
2. Admin, Editor і Public Runtime повинні бути розділені.  
3. Editor dependencies не повинні потрапляти в Public bundle.  
4. Admin CSS не повинен потрапляти в Public Website.  
5. Heavy dependencies завантажуються lazy/dynamically.  
6. CMS primitives у Public Mode залишаються максимально легкими.  
7. Дані завантажуються на рівні Page/Feature, а не кожним primitive.  
8. Не допускати N+1 requests.  
9. Published content можна кешувати.  
10. Draft і Published cache повинні бути чітко розділені.  
11. Publish повинен підтримувати targeted cache invalidation.  
12. Media повинні використовувати responsive/lazy loading там, де це доречно.  
13. LCP media обробляється окремо від звичайних lazy images.  
14. Third-party scripts завантажуються тільки за необхідності.  
15. Великі Admin datasets використовують pagination/filtering backend-side.  
16. Search не завантажує всі дані в browser.  
17. Autosave використовує debounce.  
18. Tiptap не ініціалізується для всіх fields одночасно.  
19. Realtime використовується тільки для конкретних задач.  
20. Server-only dependencies не потрапляють у browser bundle.  
21. Bundle size потрібно періодично контролювати.  
22. Core updates не повинні створювати performance regressions.  
23. Не будувати складну performance infrastructure без виміряної потреби.

---

## Ключовий принцип

> **CMS Core може бути складним усередині, але Public Website не повинен платити за цю складність.**

Відвідувач сайту повинен отримувати тільки код, стилі, дані та сторонні ресурси, необхідні для конкретної public page. Уся CMS-specific функціональність повинна залишатися ізольованою та завантажуватися тільки тоді, коли вона реально використовується.

# Блок 18. Testing Strategy

## 1. Загальний опис

Testing Strategy повинна бути мінімальною, практичною та дешевою в підтримці.

Мета тестів — не отримати максимальний coverage, а захистити критичну логіку CMS Core і Client Project від регресій.

Основний принцип:

> Тестувати тільки те, поломка чого реально може зламати CMS, втратити дані, порушити permissions або зламати публічний сайт.

Не потрібно тестувати кожен компонент, кожен prop або кожну UI-деталь.

---

## 2. Рівні тестування

Для системи достатньо трьох основних типів тестів:

| Тип | Використання |
| ----- | ----- |
| Unit Tests | Чиста логіка |
| Component Tests | Критичні CMS components |
| Integration Tests | Repository / backend / важливі workflows |

E2E tests не є обов'язковою частиною базової Testing Strategy.

---

## 3. E2E Tests

Повноцінні browser E2E tests типу Playwright/Cypress не потрібно використовувати за замовчуванням.

Причини:

* UI часто змінюється;  
* дизайн може змінювати selectors;  
* тести потребують постійного maintenance;  
* вони повільніші;  
* для невеликої команди їх підтримка часто дорожча за користь.

Тому для V1:

E2E → не використовуємо

Якщо в майбутньому з'явиться конкретний критичний flow, який реально виправдовує E2E, можна додати один або кілька тестів окремо.

Але E2E не повинні бути фундаментальною вимогою CMS Core.

---

## 4. Unit Tests

Unit tests використовуються для чистої логіки, яка:

* не залежить від UI;  
* легко тестується;  
* має критичне значення.

Наприклад:

permissions  
validation  
slug normalization  
content limits  
status transitions  
draft comparison  
error normalization  
config merging

---

## 5. Що тестувати в CMS Core

CMS Core повинен мати тести для критичної універсальної логіки.

Наприклад:

#### Permissions

Owner can publish  
Editor cannot manage users  
User without CMS membership cannot open admin

#### Draft / Publish

Draft does not change Published content  
Publish updates Published version  
Restore creates Draft

#### Content Lock

first editor gets lock  
second editor cannot edit  
expired lock can be acquired

#### Validation

required field blocks Publish  
warning does not block Publish

#### Repository Error Mapping

backend permission error  
→ PermissionDenied

---

## 6. CMS Components

Не потрібно тестувати всі Base Components.

Наприклад, немає великого сенсу писати десятки тестів для:

BaseButton  
BaseBadge  
BaseDivider

якщо вони мають дуже просту поведінку.

Тестувати потрібно CMS primitives, де є важлива логіка.

Наприклад:

CmsText  
CmsImage  
CmsCollection  
CmsButton

---

## 7. CmsText

Критичні сценарії:

Public Mode → render value  
Edit Mode → editable behavior available  
validation error → displayed correctly  
Reset → restores published value

Не потрібно тестувати:

font size  
margin  
exact CSS classes  
pixel position

---

## 8. CmsImage

Критичні сценарії:

renders media  
decorative image does not require alt  
non-decorative image validates alt  
replace changes media reference

Не потрібно тестувати точний layout Media Picker.

---

## 9. CmsCollection

Для Collection важливо перевірити:

Add item  
Delete item  
Duplicate item  
Reorder  
Stable IDs preserved

Це критична логіка для Edit Mode.

---

## 10. Repository Tests

Repository Layer є важливою межею системи.

Тому бажано перевіряти:

data mapping  
correct business result  
normalized errors  
filters/pagination

Але не потрібно тестувати сам Supabase SDK.

Наприклад, тест має перевіряти:

ProductsRepository.getBySlug()  
→ Product

а не внутрішню реалізацію `.from().select()`.

---

## 11. Integration Tests

Integration tests потрібні лише для важливих flows, які складаються з декількох частин системи.

Наприклад:

Repository  
\+  
Test Database

або:

FormsService  
\+  
Validation  
\+  
Repository

Не потрібно робити integration test для кожного module.

---

## 12. Draft / Publish Integration

Це один із найбільш критичних сценаріїв.

Бажано мати тест:

create Draft  
↓  
edit  
↓  
save  
↓  
Publish  
↓  
Published contains new data  
↓  
Revision created

Такий тест дає набагато більше користі, ніж десятки дрібних UI tests.

---

## 13. Content Lock Integration

Так само варто перевірити:

User A acquires lock

User B tries  
→ rejected

lock expires

User B acquires  
→ success

Бо помилка тут може призвести до втрати контенту.

---

## 14. Forms

Для Forms достатньо кількох критичних tests.

Наприклад:

valid submission → saved  
invalid submission → rejected  
spam submission → rejected/marked  
notification failure → submission remains saved

UI Contact Form при цьому можна не тестувати окремо, якщо там немає складної логіки.

---

## 15. Integrations

Не потрібно робити реальні API calls до:

Telegram  
Stripe  
Resend

в кожному test run.

Provider можна mock'ати.

Наприклад:

FormsService  
↓  
MockNotificationProvider

Перевіряється, що CMS правильно викликає integration.

---

## 16. Payment Integrations

Якщо конкретний Client Project використовує payments, критичну payment logic потрібно тестувати окремо.

Наприклад:

valid webhook  
invalid webhook signature  
duplicate webhook  
successful payment state

Це вже Client Project responsibility, якщо Payments не є універсальною частиною CMS Core.

---

## 17. Client Project Tests

Client Project не повинен повторно тестувати CMS Core.

Наприклад, якщо `CmsText` уже протестований у Core, немає потреби повторювати його tests у кожному Client Project.

Client Project тестує тільки власну критичну бізнес-логіку.

Наприклад:

price calculation  
booking availability  
order calculation  
custom repository  
business validation

---

## 18. Що не тестувати в Client Project

Не потрібно писати tests на кожну:

HeroSection  
AboutSection  
Footer  
ProductCard

якщо вони лише рендерять props.

Якщо component не має складної логіки, test зазвичай не потрібен.

---

## 19. Simple Rule

Перед написанням test потрібно поставити питання:

> Якщо цей код зламається, це буде серйозна проблема?

Якщо:

YES

тест, ймовірно, потрібен.

Якщо:

це просто змінить padding кнопки

тест не потрібен.

---

## 20. Test Database

Для Repository / integration tests бажано мати окреме test environment.

Не використовувати Production Database.

Можна використовувати:

local Supabase

або окремий test project.

Точна infrastructure визначається пізніше.

---

## 21. Fixtures

Для tests можна мати невеликий набір predictable test data.

Наприклад:

Owner  
Editor  
Published Page  
Draft Page  
Product  
Media

Не потрібно створювати великий fake database.

---

## 22. Mocking

Mock використовувати тільки там, де це реально спрощує test.

Наприклад:

External APIs  
Email Provider  
Telegram Provider  
Storage

Не потрібно mock'ати кожен внутрішній function call.

Тест повинен залишатися зрозумілим.

---

## 23. Test Isolation

Тести не повинні залежати від порядку виконання.

Кожен critical integration test повинен:

prepare data  
run test  
cleanup

або працювати з resettable test environment.

---

## 24. Migrations

Core migrations бажано мати мінімальну автоматичну перевірку.

Наприклад:

empty DB  
↓  
run all Core migrations  
↓  
success

Це дуже корисно, тому що broken migration може заблокувати установку або update усіх клієнтських проєктів.

---

## 25. Migration Upgrade Test

Для важливих major updates бажано перевіряти сценарій:

previous schema  
↓  
new migrations  
↓  
latest schema

Не обов'язково підтримувати tests для кожної історичної версії назавжди.

---

## 26. Public Runtime Regression

Окремо важливо контролювати правило з Performance Architecture:

Public Website

не повинен завантажувати:

Tiptap  
Editor Runtime  
Admin Runtime  
Editor CSS

Це можна перевіряти невеликим build/regression test або script.

---

## 27. Не робити Snapshot Tests на UI

Не рекомендується активно використовувати великі Vue snapshot tests.

Вони часто створюють noise:

class changed  
markup slightly changed  
snapshot failed

і розробник просто натискає update snapshot.

Краще тестувати конкретну поведінку.

---

## 28. CSS / Visual Testing

Pixel-perfect automated visual testing не потрібен.

Дизайн перевіряється вручну під час розробки.

Якщо в майбутньому проєкт стане великою командною системою, можна додати visual regression tools.

Для V1:

не потрібно

---

## 29. CI

У CI достатньо запускати мінімальний набір checks:

TypeScript  
Lint  
Critical Tests  
Build

Наприклад:

npm run typecheck  
npm run lint  
npm run test  
npm run build

Точні scripts визначаються під час реалізації.

---

## 30. Tests перед release CMS Core

Перед release CMS Core бажано автоматично перевіряти:

TypeScript passes  
Critical unit tests pass  
Critical integration tests pass  
Build succeeds

Для major release додатково:

migration check

---

## 31. Fast Test Suite

Повний Core test suite повинен залишатися швидким.

Якщо test suite починає займати багато часу, розробник перестає запускати його локально.

Тому краще:

30 важливих tests

ніж:

1000 tests

які перевіряють дрібні деталі.

---

## 32. Bug Regression

Якщо знайдений серйозний bug у CMS Core:

1. відтворити bug;  
2. написати test;  
3. виправити bug;  
4. переконатися, що test проходить.

Таким чином важливі реальні проблеми поступово збільшують test coverage там, де це справді потрібно.

---

## 33. Coverage

Не потрібно ставити мету:

90% coverage  
100% coverage

Coverage percentage не є KPI для проєкту.

Мета:

> Critical behavior coverage.

---

## 34. Recommended Tooling

Для Nuxt/Vue логічно використовувати легкий стандартний stack.

Наприклад:

Vitest  
Vue Test Utils  
Nuxt test utilities

Не потрібно підключати багато різних testing frameworks.

Точний набір визначається під час реалізації.

---

## 35. Стратегія CMS Core

Пріоритет тестування:

#### Highest

Auth / Permissions  
Draft / Publish  
Content Lock  
Repositories  
Migrations

#### Medium

CmsText  
CmsImage  
CmsCollection  
Forms Service  
Integration Providers

#### Low / usually manual

Admin layout  
Dashboard widgets  
Simple UI components  
Client section rendering  
CSS

---

## 36. Стратегія Client Project

Пріоритет:

#### Test

custom business logic  
calculations  
custom repositories  
payments  
critical validation  
complex custom features

#### Usually don't test

simple sections  
layout  
static components  
pure presentation  
standard CMS Core behavior

---

## 37. Що не потрібно створювати

Не потрібно:

великий E2E suite  
Cypress infrastructure  
Playwright suite для кожної сторінки  
visual regression system  
100% coverage  
tests для кожного BaseComponent  
snapshot tests для всього UI  
окрема QA infrastructure

якщо проєкт цього реально не потребує.

---

## 38. Фінальна схема

                CMS Core

Critical Business Logic  
        ↓  
      Unit Tests

Repositories / Services  
        ↓  
 Integration Tests

Critical CMS Primitives  
        ↓  
 Component Tests

Migrations / Build  
        ↓  
 Automated Checks

Client Project:

Custom Business Logic  
        ↓  
 Tests only where important

Presentation / Layout  
        ↓  
 Manual verification

---

## 39. Основні правила

1. Testing Strategy повинна залишатися мінімальною.  
2. Тестуємо критичну поведінку, а не весь код.  
3. Coverage percentage не є ціллю.  
4. E2E не використовуються за замовчуванням.  
5. Visual/CSS regression testing не потрібен у V1.  
6. CMS Core тестує власну універсальну логіку.  
7. Client Project не дублює tests CMS Core.  
8. Client Project тестує тільки власну критичну бізнес-логіку.  
9. Permissions, Draft/Publish, Content Lock і Migrations мають найвищий пріоритет.  
10. Простий UI без бізнес-логіки не потребує tests.  
11. External integrations можна mock'ати.  
12. Production Database ніколи не використовується для automated tests.  
13. Core migrations повинні мати хоча б базовий smoke test.  
14. CI запускає тільки невеликий набір важливих checks.  
15. Test suite повинен залишатися швидким.  
16. Для серйозного bug бажано додавати regression test.  
17. Не створювати testing infrastructure, підтримка якої дорожча за користь.

---

## Ключовий принцип

> **Тести повинні страхувати дорогі помилки, а не створювати ще один окремий проєкт, який потрібно постійно підтримувати.**

Для CMS Core тестуються критичні універсальні механізми. Для Client Project — тільки критична специфічна бізнес-логіка. Дизайн, layout та прості presentation components перевіряються вручну.

# Блок 19. Future / Soon Roadmap

## 1. Загальний опис

CMS Core будується як довгострокова система, тому архітектура повинна дозволяти поступове розширення функціональності без кардинальної перебудови.

При цьому перша версія повинна залишатися максимально простою, швидкою та легкою в підтримці.

Основний принцип:

> Архітектура повинна бути готовою до майбутніх можливостей, але реалізовуються тільки ті функції, які реально потрібні для поточної версії.

Не потрібно створювати складні модулі "про запас".

---

## 2. Принцип розвитку

Нові можливості повинні:

* використовувати існуючу архітектуру;  
* не вимагати переписування Core;  
* не ламати існуючі Client Projects;  
* додаватися як окремі модулі або розширення.

Major оновлення допускаються, але повинні супроводжуватися migration guide.

---

## 3. Функції, які можуть з'явитися пізніше

Можливі напрямки розвитку:

#### Security

* Two-Factor Authentication (2FA)  
* Trusted Devices  
* Active Sessions  
* Login History

---

#### Content

* Scheduled Publish  
* Scheduled Unpublish  
* Content Approval Workflow  
* Comments між редакторами

---

#### AI

* AI Translation  
* AI SEO Suggestions  
* AI Content Assistant  
* AI Image Alt Generator

---

#### Forms

* Auto Reply Templates  
* Advanced Spam Protection  
* CAPTCHA Providers  
* Webhook Retries

---

#### Integrations

* WhatsApp  
* CRM Integrations  
* Zapier / Make  
* Discord  
* Slack

---

#### Media

* Image Optimization Pipeline  
* Automatic WebP/AVIF  
* Image Cropping  
* Version History

---

#### Analytics

* Розширені Dashboard Widgets  
* Custom Reports  
* Goals / Events  
* Conversion Statistics

---

#### System

* Backup Manager  
* Restore Wizard  
* Diagnostics  
* Update Checker

---

## 4. Soon Features

У самій Admin Panel можна показувати лише ті функції, які плануються найближчим часом.

Наприклад:

WhatsApp  
Soon

2FA  
Soon

Scheduled Publish  
Soon

Image Crop  
Soon

Не потрібно додавати десятки карток "Soon", які роками не будуть реалізовані.

---

## 5. Feature Flags

Нові можливості повинні мати можливість бути вимкненими.

Наприклад:

ai = false

payments = false

analytics = true

Тоді відповідний модуль навіть не відображається в Admin Panel.

---

## 6. Не перевантажувати V1

У першу версію свідомо не входять:

* Plugin Marketplace;  
* Visual Page Builder;  
* Workflow Engine;  
* Dynamic Form Builder;  
* Microservices;  
* Queue Infrastructure;  
* Redis;  
* Multi-tenant SaaS;  
* Власна CRM;  
* Email Marketing Platform;  
* Universal Automation Builder.

Якщо колись виникне реальна потреба, вони можуть бути реалізовані окремими модулями.

---

## 7. Принцип сумісності

Нові можливості не повинні вимагати зміни архітектури Client Project.

Наприклад, якщо в майбутньому додається Scheduled Publish, існуючі сторінки та репозиторії повинні продовжувати працювати без переписування.

---

## 8. Оновлення Client Projects

При оновленні CMS Core клієнтські проєкти повинні отримувати:

* нові можливості;  
* виправлення помилок;  
* покращення продуктивності;  
* покращення безпеки.

При цьому оновлення не повинні автоматично змінювати бізнес-логіку конкретного проєкту.

---

## 9. Що визначає розвиток системи

Пріоритет мають функції, які:

* використовуються в більшості клієнтських сайтів;  
* зменшують кількість дублювання коду;  
* покращують Developer Experience;  
* не ускладнюють Core без необхідності.

Не додаються функції лише тому, що вони "можуть колись знадобитися".

---

## 10. Основні правила

1. Core залишається компактним.  
2. Нові можливості додаються поступово.  
3. Архітектура завжди важливіша за кількість функцій.  
4. Не реалізовувати складні модулі без реальної потреби.  
5. "Soon" використовується тільки для найближчих функцій.  
6. Клієнтські проєкти повинні легко оновлюватися до нових версій Core.  
7. Зворотна сумісність є пріоритетом там, де це можливо.

---

## Ключовий принцип

> **CMS Core повинен рости разом із потребами проєктів, а не випереджати їх.**

Кожна нова функція повинна вирішувати реальну проблему, не ускладнюючи систему для тих проєктів, яким вона не потрібна.

# Блок 20. Deployment / Production Architecture

## 1. Загальний опис

Deployment Architecture визначає, як Client Project переходить від локальної розробки до production.

CMS Core при цьому залишається окремим npm-пакетом і не деплоїться як самостійний застосунок.

Production unit — це конкретний Client Project:

Client Nuxt Project  
      \+  
nuxt-cms-core  
      \+  
Project Business Logic  
      \+  
Project Configuration  
      ↓  
Deployment

Основна задача — зробити deployment максимально простим і передбачуваним без зайвої DevOps-інфраструктури.

---

## 2. Основні середовища

На базовому рівні достатньо трьох environment:

Local  
Stage / Preview  
Production

Не потрібно створювати:

Development  
QA  
Integration  
Pre-stage  
Pre-production  
Canary

якщо немає реальної команди та процесу, який цього потребує.

---

## 3. Local Environment

Local використовується для:

* розробки сайту;  
* розробки Client-specific features;  
* тестування CMS;  
* migrations;  
* debugging.

Client Project використовує власну local configuration.

Наприклад:

.env  
.env.local

Local environment не повинен використовувати Production secrets.

---

## 4. Local Supabase

Для локальної розробки бажано мати окремий development database environment.

Можливі два підходи:

Local Supabase

або:

окремий development Supabase project

Конкретний варіант можна вибрати під час реалізації.

Основне правило:

> Локальна розробка не повинна випадково змінювати Production Database.

---

## 5. Stage / Preview

Stage потрібен для перевірки Client Project перед Production.

Він може використовуватися для:

* перевірки нового дизайну;  
* перевірки CMS changes;  
* демонстрації клієнту;  
* перевірки integrations;  
* acceptance перед release.

Stage не обов'язково повинен бути постійним окремим сервером.

Можна використовувати preview deployments hosting provider.

---

## 6. Stage Data

Stage не повинен мати write access до Production Database.

Найбезпечніша модель:

Stage  
 ↓  
Stage Database

або sanitized copy production data.

Не рекомендується підключати Stage напряму до Production з повними credentials.

---

## 7. Production

Production — єдине environment, яке обслуговує реальних користувачів.

Production має:

Production Nuxt App  
Production Supabase  
Production Storage  
Production Secrets  
Production Domain

Production credentials не використовуються локально без крайньої необхідності.

---

## 8. Незалежність Client Projects

Кожен Client Project деплоїться незалежно.

Наприклад:

Client A  
├── Nuxt deployment  
├── Supabase project  
└── Domain

Client B  
├── Nuxt deployment  
├── Supabase project  
└── Domain

CMS Core є shared npm dependency, але infrastructure клієнтів не повинна бути спільною за замовчуванням.

Це ізолює:

* database;  
* users;  
* storage;  
* failures;  
* billing;  
* migrations.

---

## 9. Hosting

Nuxt Client Project може деплоїтися на будь-який hosting, який нормально підтримує Nuxt runtime.

Deployment Architecture не повинна бути жорстко прив'язана до одного provider.

Можливі:

Vercel  
Netlify  
Cloudflare  
Node hosting  
VPS  
інші Nuxt-compatible providers

Конкретний provider вибирається для Client Project.

---

## 10. CMS Core не має окремого hosting

`nuxt-cms-core`:

npm package

а не:

окремий CMS server

Після build Client Project CMS Core є частиною самого застосунку.

Тобто немає архітектури:

Client Website  
   ↓  
Central CMS Server

Кожен сайт залишається незалежним.

---

## 11. Environment Variables

Environment-specific configuration зберігається поза repository.

Наприклад:

SUPABASE_URL  
SUPABASE_KEY (publishable)  
SUPABASE_SECRET (server-only)  
server secrets

Owner-managed integration secrets — окремий secure secrets layer або env, залежно від рішення епіку 013 (Summary §28). Значення, що відрізняються між environments без нового build, задаються через `NUXT_PUBLIC_*` / `NUXT_*` override.

Production secrets задаються через hosting/environment configuration.

Вони не commit'яться у Git.

---

## 12. `.env.example`

Client Project повинен мати:

.env.example

який містить необхідні variable names без secret values.

Наприклад:

SUPABASE_URL=  
SUPABASE_KEY=  
SUPABASE_SECRET=

Це полегшує setup нового environment.

---

## 13. Secrets

Secret values не повинні:

* commit'итися в Git;  
* потрапляти в frontend bundle;  
* логуватися;  
* показуватися в build output.

Server secrets використовуються тільки server-side.

---

## 14. Build

Перед Production deployment проєкт повинен успішно пройти:

install  
↓  
typecheck  
↓  
critical tests  
↓  
build  
↓  
deploy

Не потрібно робити десятки pipeline stages.

---

## 15. Мінімальний CI

Для Client Project достатньо простого CI pipeline.

Наприклад:

Push / Pull Request

↓

Install

↓

TypeScript

↓

Critical Tests

↓

Build

Якщо щось не проходить — deployment блокується.

---

## 16. CMS Core CI

`nuxt-cms-core` має власний CI незалежно від Client Projects.

Перед release Core:

typecheck  
critical tests  
build  
migration check

Після цього публікується нова npm version.

---

## 17. Оновлення Client Project

Client Project не повинен автоматично переходити на кожну нову версію CMS Core.

Наприклад:

Client A  
nuxt-cms-core 1.4

Client B  
nuxt-cms-core 1.6

це нормальна ситуація.

Розробник сам вирішує, коли оновлювати конкретний Client Project.

---

## 18. Version Pinning

Production Client Project повинен мати передбачувану version CMS Core.

Не рекомендується дозволяти неконтрольоване автоматичне отримання breaking updates.

Package lock повинен фіксувати фактичну встановлену версію dependencies.

---

## 19. Update Flow

Типовий flow:

nuxt-cms-core  
1.4  
↓  
new version 1.5  
↓  
update Client Project  
↓  
local check  
↓  
stage / preview  
↓  
migrations  
↓  
production deploy

Не потрібно одразу оновлювати всі клієнтські проєкти.

---

## 20. Database Migrations

Database migrations є окремою частиною deployment.

Потрібно розділяти:

Core Migrations

та:

Project Migrations

Deployment tooling повинен знати, які migrations вже застосовані.

---

## 21. Migration Order

За замовчуванням:

Core migrations  
      ↓  
Project migrations

але конкретні dependencies між migrations повинні бути явними.

Не потрібно покладатися на ручне виконання SQL у Production Dashboard як основний production workflow.

---

## 22. Migration Safety

Production migration не повинна без необхідності:

* видаляти таблицю;  
* видаляти колонку;  
* масово втрачати дані;  
* змінювати тип даних небезпечним способом.

Для небезпечних migrations потрібна окрема перевірка.

---

## 23. Backward-compatible migrations

Де це можливо, migrations бажано робити сумісними з попередньою версією application.

Наприклад замість:

delete old_column  
\+  
deploy frontend

краще:

add new_column  
↓  
deploy compatible code  
↓  
migrate data  
↓  
later remove old_column

Це зменшує ризик downtime.

---

## 24. Deployment Order

Для звичайного backward-compatible release:

Database migration  
      ↓  
Application deployment

або інша безпечна послідовність залежно від конкретної migration.

CLI/update tooling повинно попереджати про version/schema incompatibility.

---

## 25. Schema Compatibility

Client Project повинен мати можливість перевірити:

Installed CMS Core version  
vs  
Database Schema Version

Якщо schema несумісна, Admin не повинен мовчки працювати в потенційно небезпечному стані.

Можна показати System warning:

Database update required.

---

## 26. Major Updates

Major CMS Core update не повинен автоматично деплоїтися.

Flow:

read migration guide  
↓  
update locally  
↓  
run migrations  
↓  
test critical flows  
↓  
preview  
↓  
production

---

## 27. Rollback Application

Hosting provider бажано повинен дозволяти повернути попередній deployment.

Наприклад:

Production v25  
↓  
bad release  
↓  
Rollback  
↓  
Production v24

Це не обов'язково означає автоматичний rollback database.

---

## 28. Database Rollback

Database rollback значно складніший за frontend rollback.

Тому основний принцип:

> Migrations повинні проєктуватися так, щоб rollback був потрібен якомога рідше.

Для критичних migrations перед виконанням потрібен backup.

---

## 29. Preview Deployment

При Pull Request або feature branch можна створювати preview deployment.

Це особливо корисно для:

* дизайну;  
* frontend changes;  
* CMS UI;  
* демонстрації клієнту.

Preview environment не повинен мати Production write credentials.

---

## 30. Demo для клієнта

Якщо сайт показується клієнту до фінальної передачі, краще використовувати:

Preview / Stage deployment

а не віддавати repository або production credentials.

Доступ можна обмежити:

* password;  
* authentication;  
* hosting-level protection.

Точна система залежить від hosting provider.

---

## 31. Захист проєкту до передачі

До фінальної передачі клієнту розробник контролює:

Git repository  
Deployment access  
Supabase access  
Secrets  
npm package access

Клієнту можна дати CMS Owner access без видачі infrastructure credentials.

CMS Owner і infrastructure owner — не обов'язково одна й та сама роль.

---

## 32. Передача клієнту

Якщо проєкт повністю передається клієнту, процес передачі може включати:

hosting ownership  
Supabase ownership  
domain  
environment secrets  
repository

але це вже business/deployment process конкретного проєкту.

CMS Core architecture не повинна вимагати передачі самого Core source code.

Клієнтський проєкт використовує npm package.

---

## 33. Domain

Production domain налаштовується на hosting provider.

Наприклад:

example.com  
www.example.com

CMS повинна мати Runtime Setting:

Site URL

але DNS та SSL залишаються infrastructure responsibility.

---

## 34. HTTPS

Production сайт повинен працювати тільки через HTTPS.

Hosting provider зазвичай керує TLS certificates.

CMS Core не повинна реалізовувати власну certificate infrastructure.

---

## 35. Environment-specific Integrations

External integrations повинні мати окремі Production credentials.

Наприклад:

Stripe Test → Stage

Stripe Live → Production

Не використовувати production payment credentials для локальної розробки.

---

## 36. Analytics

Preview / Local середовища за замовчуванням не повинні забруднювати Production Analytics.

Наприклад GA integration може бути:

disabled

для development/preview.

---

## 37. Search Indexing

Stage / Preview environment не повинні індексуватися пошуковими системами.

Для них повинно бути:

noindex

або hosting-level protection.

Production indexing керується CMS Settings.

---

## 38. Error Logging

Production повинна мати базовий error logging.

Не обов'язково одразу будувати складну observability platform.

Мінімально потрібно мати можливість побачити:

* server errors;  
* failed integrations;  
* critical CMS errors.

У майбутньому можна підключити спеціалізований monitoring provider.

---

## 39. Health Checks

System / Diagnostics може перевіряти:

Database  
Storage  
CMS version  
Schema version  
Email  
Critical integrations

але сам Public Website не повинен залежати від Diagnostics module.

---

## 40. Deploy Notifications

Автоматичні Slack/Telegram повідомлення про кожен deploy не є обов'язковими.

Якщо пізніше це стане корисно — можна додати через Integration Layer.

---

## 41. Production Checklist

Перед першим production release бажано перевірити:

Environment configured  
Database migrations applied  
RLS enabled  
Storage policies configured  
Owner created  
Domain configured  
HTTPS works  
robots/indexing correct  
Forms work  
Critical integrations work  
Build succeeds

Це може бути простий checklist, а не окрема система.

---

## 42. Deployment не повинен залежати від CMS Core repository

Client Project build використовує опубліковану version `nuxt-cms-core`.

Production не повинен clone CMS Core repository окремо.

Схема:

Client Repository  
     ↓  
npm install  
     ↓  
nuxt-cms-core package  
     ↓  
Nuxt build

---

## 43. Немає Central CMS Infrastructure

За замовчуванням не створюється:

Central CMS Backend  
Central Database  
Central Storage

для всіх клієнтів.

Кожен Client Project є незалежним deployment.

Це спрощує:

* security;  
* billing;  
* maintenance;  
* customization;  
* ownership.

---

## 44. CI/CD не повинен бути складним

На першій версії не потрібні:

Jenkins  
Kubernetes  
ArgoCD  
Terraform  
complex Docker infrastructure  
multi-stage enterprise pipeline

якщо hosting provider і стандартний Git workflow вирішують задачу.

---

## 45. Docker

Docker не є обов'язковою частиною CMS Core architecture.

Його можна використовувати в конкретному Client Project, якщо infrastructure цього потребує.

CMS Core не повинна вимагати Docker для звичайної розробки.

---

## 46. Автоматизація

Автоматизувати потрібно повторювані та безпечні операції.

Наприклад:

build  
tests  
preview deploy  
production deploy  
version checks

Небезпечні production operations можуть залишатися явними.

Наприклад:

major migration  
destructive database operation  
major CMS upgrade

---

## 47. Failed Deployment

Якщо application deployment не пройшов:

* поточна Production version повинна залишитися працювати;  
* незавершений build не повинен замінити working release.

Це бажано забезпечувати можливостями hosting provider.

---

## 48. Public Website Stability

Admin або external integration failure не повинні автоматично робити Public Website недоступним.

Наприклад:

Telegram unavailable

не повинен зламати rendering Home Page.

Так само temporary Admin error не повинен впливати на Published Content.

---

## 49. Що не потрібно створювати зараз

Не потрібно:

власний deployment platform  
Jenkins  
Kubernetes  
Docker requirement  
Infrastructure as Code для кожного простого сайту  
Central CMS hosting  
Complex release orchestration  
Automatic DB rollback engine  
Canary deployments  
Blue/green deployment system

без реальної потреби.

---

## 50. Фінальна схема

Development:

Developer  
   ↓  
Client Project  
   ↓  
Local Environment  
   ↓  
Local / Development Backend

Release:

Git  
 ↓  
CI  
 ↓  
Typecheck  
Critical Tests  
Build  
 ↓  
Preview / Stage  
 ↓  
Production

Production:

Client Project  
     ↓  
Nuxt Hosting  
     │  
     ├── nuxt-cms-core  
     │  
     └── Client Business Logic

          ↓

     Client Supabase

Database  
Auth  
Storage

CMS Core:

CMS Core Repository  
      ↓  
CI  
      ↓  
npm publish  
      ↓  
nuxt-cms-core version  
      ↓  
Client Projects update when needed

---

## 51. Основні правила

1. Кожен Client Project деплоїться незалежно.  
2. CMS Core не є центральним CMS server.  
3. CMS Core доставляється через npm package.  
4. Local, Stage/Preview і Production повинні бути логічно розділені.  
5. Local/Preview не повинні мати неконтрольований write access до Production.  
6. Production secrets не commit'яться в Git.  
7. Server secrets не потрапляють у browser.  
8. CI залишається простим: typecheck, critical tests, build.  
9. Client Projects оновлюють CMS Core незалежно один від одного.  
10. CMS Core update не повинен автоматично потрапляти в усі Production projects.  
11. Core і Project migrations залишаються розділеними.  
12. Schema Version перевіряється на сумісність із CMS Core.  
13. Major update проходить через local → preview → production.  
14. Application rollback повинен бути простим через hosting provider.  
15. Database migrations повинні бути максимально безпечними та backward-compatible.  
16. Preview environment не індексується пошуковими системами.  
17. Production analytics не повинна збирати local/preview traffic без потреби.  
18. Client може мати CMS Owner access без infrastructure access.  
19. CMS Core не вимагає Docker.  
20. Не створювати складний DevOps stack без реальної потреби.

---

## Ключовий принцип

> **Кожен клієнтський сайт є незалежним Nuxt-застосунком зі своєю інфраструктурою, а `nuxt-cms-core` є лише версіонованою dependency всередині цього проєкту.**

Deployment повинен залишатися максимально близьким до стандартної Nuxt-розробки: Git → перевірки → build → preview → production. CMS Core не повинен вимагати окремої DevOps-платформи або центральної SaaS-інфраструктури.

# Блок 21. Backup / Recovery Architecture

## 1. Загальний опис

Backup / Recovery Architecture визначає, як система повинна поводитися у випадку:

* випадкового видалення контенту;  
* помилкового Publish;  
* невдалої migration;  
* пошкодження database;  
* втрати media;  
* помилки deployment;  
* критичної зміни configuration.

Основна задача — забезпечити можливість відновлення системи без створення складної backup infrastructure.

Основний принцип:

> Для звичайних помилок користувача використовується внутрішня CMS recovery logic. Для критичних infrastructure failures використовується backup на рівні backend/storage/hosting.

---

## 2. Два рівні Recovery

Потрібно чітко розділяти:

#### Application Recovery

Працює всередині CMS.

Наприклад:

Revision Restore  
Soft Delete  
Restore Media  
Restore Collection Item  
Undo Draft Changes

#### Infrastructure Recovery

Працює на рівні:

Database  
Storage  
Hosting  
Environment

і використовується при серйозній поломці системи.

---

## 3. Revision Restore не є Backup

Revision System використовується для відновлення контенту.

Наприклад:

Published v7  
↓  
помилковий Publish  
↓  
Restore v6  
↓  
Draft  
↓  
Publish  
↓  
v8

Це не замінює database backup.

Якщо database повністю втрачена, Revision також буде втрачена разом із нею.

---

## 4. Soft Delete

Для важливих CMS entities бажано використовувати Soft Delete / Archive.

Наприклад:

Page  
Product  
Case  
Media

не повинні фізично видалятися одразу після натискання Delete.

Flow:

Delete  
↓  
Archived / Trash  
↓  
Restore

Фізичне видалення можна виконувати пізніше.

---

## 5. Media Recovery

Media повинні використовувати той самий принцип.

Наприклад:

Media Library  
↓  
Delete  
↓  
Trash  
↓  
Restore

Фізичний файл не обов'язково видаляється одразу зі Storage.

Це захищає від випадкової втрати файлів.

---

## 6. Retention

Soft-deleted records і files можуть зберігатися певний період.

Наприклад:

30 days  
60 days  
90 days

Конкретний retention визначається пізніше.

Не потрібно нескінченно зберігати всі видалені дані.

---

## 7. Database Backup

Production Database повинна мати регулярний backup mechanism.

На першому етапі бажано максимально використовувати можливості Backend Provider.

Для Supabase це означає використовувати доступні backup/recovery можливості конкретного тарифу.

CMS Core не повинна самостійно реалізовувати database backup engine.

---

## 8. Storage Backup

Database backup і Storage backup — різні речі.

Наприклад:

Database

може бути відновлена, але фізичні images/files можуть бути втрачені окремо.

Тому важливий production project повинен мати strategy для:

Database  
\+  
Storage

Точна реалізація залежить від Storage Provider.

---

## 9. Configuration Backup

Необхідно розрізняти:

#### Runtime Settings

зберігаються в database і потрапляють у database backup.

#### Project Config

cms.config.ts

зберігається в Git.

#### Environment Secrets

зберігаються в hosting / secure environment.

Тобто повне відновлення проєкту може потребувати декількох джерел.

---

## 10. Git як backup коду

Client Project code повинен зберігатися в Git repository.

Git є джерелом відновлення:

* frontend structure;  
* business logic;  
* migrations;  
* configuration;  
* package versions.

Database не повинна використовуватися як backup source для application code.

---

## 11. Package Versions

`package-lock` / equivalent lockfile повинен дозволяти відновити конкретний working dependency state.

Наприклад:

Nuxt version  
nuxt-cms-core version  
other dependencies

Це особливо важливо для старих Client Projects.

---

## 12. Backup перед Major Update

Перед major update CMS Core бажано мати актуальний backup Production Database.

Flow:

Backup  
↓  
Update nuxt-cms-core  
↓  
Run migrations  
↓  
Deploy

Особливо якщо migrations змінюють структуру важливих таблиць.

---

## 13. Backup перед небезпечною Migration

Для destructive або risky migration backup є обов'язковим.

Наприклад:

drop column  
data transformation  
large relation migration  
storage migration

Звичайна additive migration не обов'язково потребує окремого manual backup щоразу, якщо production backup system уже працює.

---

## 14. Migration Failure

Якщо migration падає:

Migration  
↓  
Error

application deployment не повинен продовжуватися в несумісному стані.

Потрібно:

* зупинити release;  
* визначити стан database;  
* виправити migration або restore backup.

---

## 15. Application Rollback

Якщо проблема тільки у frontend/backend application code:

Deployment v20  
↓  
broken  
↓  
Rollback to v19

можна використати rollback hosting provider.

Але це працює лише якщо Database Schema сумісна з попередньою версією.

---

## 16. Database Rollback

Database rollback складніший.

Не потрібно розраховувати на автоматичний reverse migration для кожної зміни.

Основна стратегія:

* backward-compatible migrations;  
* backups;  
* обережні destructive operations.

---

## 17. Recovery після невдалого Publish

Якщо проблема тільки в контенті:

Wrong Publish

не потрібно відновлювати database backup.

Використовується:

Revision Restore

Це значно швидше і безпечніше.

---

## 18. Recovery після випадкового Delete

Якщо користувач видалив Product або Media:

Trash / Archive  
↓  
Restore

Database backup використовується тільки якщо дані вже були фізично очищені.

---

## 19. Recovery після втрати Database

При повній втраті database:

Create / recover database  
↓  
Restore backup  
↓  
verify migrations/schema  
↓  
verify storage references  
↓  
restart application

Після цього потрібно перевірити:

* Auth;  
* Pages;  
* Media metadata;  
* Settings;  
* Forms;  
* Users;  
* Revisions.

---

## 20. Recovery після втрати Storage

Якщо database працює, але фізичні media files втрачені:

Restore Storage Backup

Database records самі по собі не відновлять binaries.

Тому Media Architecture повинна чітко розділяти:

Media Entity  
vs  
Physical File

---

## 21. Backup Integrity

Backup не має цінності, якщо його неможливо відновити.

Для важливих production projects бажано періодично перевіряти, що backup mechanism реально працює.

Не обов'язково автоматизувати повний restore test на старті.

---

## 22. Backup Manager у CMS

У майбутньому System може мати:

System  
↓  
Backups

Наприклад:

Last backup  
Backup status  
Restore instructions

Але CMS не повинна сама зберігати backup files у своїй основній database.

**Status: Soon**

---

## 23. Manual Backup

Для важливих змін Owner/Developer у майбутньому може мати кнопку:

Create Backup

Але це повинно викликати backend/infrastructure mechanism.

Не потрібно реалізовувати backup через browser.

**Status: Soon**

---

## 24. Backup Notifications

У майбутньому можна показувати warning:

Last successful backup:  
12 days ago

або:

Backup failed

через System Diagnostics.

**Status: Soon**

---

## 25. Backup Permissions

Backup/Restore operations є критичними.

Вони повинні бути доступні тільки:

Owner

або developer/system administrator.

Editor/Admin без відповідного permission не повинні запускати infrastructure restore.

---

## 26. Secrets Recovery

Secrets можуть не входити в database backup.

Тому production recovery process повинен враховувати:

Stripe Secret  
SMTP Credentials  
Telegram Token  
Supabase credentials

Вони відновлюються через secure environment configuration.

---

## 27. Environment Recovery

Для повного відновлення Client Project потрібно мати можливість відтворити:

Code  
Dependencies  
Database  
Storage  
Environment  
Domain configuration

Тобто backup — це не один `.zip`.

---

## 28. Disaster Recovery Documentation

Для production project бажано мати короткий recovery checklist.

Наприклад:

1. Restore Database  
2. Restore Storage  
3. Configure Environment  
4. Deploy known stable version  
5. Run compatibility check  
6. Verify site

Не потрібно створювати складний disaster recovery framework.

---

## 29. Recovery Verification

Після infrastructure restore потрібно перевірити мінімально:

Public Website loads  
Admin login works  
Published content exists  
Media loads  
Forms accept submissions  
Critical integrations work

---

## 30. Backups і Client Ownership

Оскільки кожен Client Project має власний Supabase/Storage/Hosting, backups також ізольовані по клієнтах.

Проблема одного проєкту не повинна впливати на інший.

---

## 31. CMS Core Source

Backup Client Project не повинен містити source code CMS Core.

Достатньо:

package.json  
lockfile  
CMS Core version

Потрібна версія відновлюється через package registry.

---

## 32. Якщо package version більше недоступна

Оскільки `nuxt-cms-core` є critical package, package registry повинен зберігати опубліковані production versions.

Не рекомендується видаляти старі released versions, які використовуються Client Projects.

---

## 33. Recovery і Schema Version

Після Restore Database CLI/System повинні перевіряти:

Database Schema Version  
vs  
nuxt-cms-core Version

Перед запуском Admin.

Це захищає від ситуації:

old database  
\+  
new application

без необхідних migrations.

---

## 34. Recovery Mode

У майбутньому CMS може мати спеціальний system state:

Maintenance / Recovery Mode

який тимчасово блокує Admin mutations під час відновлення.

Але окремий складний Recovery UI для V1 не потрібен.

---

## 35. Activity і Restore

Application-level restore operations повинні потрапляти в Activity.

Наприклад:

Product restored  
Revision restored  
Media restored

Infrastructure-level database restore не обов'язково можна коректно відобразити всередині тієї самої Activity історії.

---

## 36. Що не потрібно створювати зараз

Не потрібно:

власний database backup engine  
власний storage replication service  
automatic disaster recovery platform  
cross-region replication  
automatic DB rollback system  
backup encryption infrastructure  
complex restore UI

якщо це вже вирішує infrastructure provider.

---

## 37. Фінальна схема

Звичайна помилка користувача:

Wrong content  
     ↓  
Revision / Trash  
     ↓  
Restore

Infrastructure failure:

Production Failure  
       ↓  
Known Stable Code  
       \+  
Database Backup  
       \+  
Storage Backup  
       \+  
Environment  
       ↓  
Restore Project

Major update:

Backup  
  ↓  
Core Update  
  ↓  
Migrations  
  ↓  
Deploy  
  ↓  
Verify

---

## 38. Основні правила

1. Revision System не є заміною Database Backup.  
2. Для звичайних помилок використовується application-level recovery.  
3. Важливі entities використовують Archive/Soft Delete.  
4. Media не повинні фізично видалятися одразу без необхідності.  
5. Production Database повинна мати регулярний backup.  
6. Storage backup розглядається окремо від Database.  
7. Code зберігається і відновлюється через Git.  
8. Project Config також зберігається в Git.  
9. Secrets зберігаються окремо від Database.  
10. Перед risky migration або Major Update потрібен актуальний backup.  
11. Не покладатися на automatic reverse migrations як головний recovery mechanism.  
12. Application rollback і Database rollback — різні операції.  
13. Після restore перевіряється Schema Version.  
14. Released CMS Core versions не повинні без причини видалятися з package registry.  
15. Backup/Restore infrastructure operations доступні тільки Owner/Developer.  
16. Не створювати власну backup platform, якщо задачу вже вирішує Backend/Hosting provider.

---

## Ключовий принцип

> **CMS повинна самостійно вирішувати повсякденні помилки контенту через Draft, Revisions, Trash та Restore, а критичне відновлення інфраструктури повинно спиратися на надійні backup-механізми backend/storage/hosting provider.**

Це дозволяє отримати нормальний рівень захисту від втрати даних без побудови окремої складної backup-системи всередині CMS Core.
