# nuxt-cms-core

Перевикористовуване ядро CMS для Nuxt 4: Nuxt Layer + внутрішній Nuxt Module, backend —
Supabase за repositories. Client Project (конкретний сайт) підключає Core як dependency і
сам будує сторінки, дизайн і бізнес-логіку. CMS редагує контент, а не структуру — це не
page builder.

## Джерела правди (у цьому порядку)

1. `docs/MASTER_PLAN.md` — канонічні рішення (§2), фази й епіки (§4), наскрізні обмеження (§5),
   реєстр відкритих рішень (§6), ризики (§7).
2. `docs/source/architecture.md` — почищена архітектурна дока (Architecture Summary + Блоки 3–21).
   Читати лише блоки, які епік вказує в «Джерела»: файл великий (~17.5k рядків).
3. `docs/implementation/README.md` — статуси епіків; `docs/implementation/00N-*.md` — що зроблено.
4. `.cursor/rules/project.mdc` — правила коду.

Якщо вимога неоднозначна або рішення є в реєстрі відкритих (§6) — питати, не вигадувати
схему БД, API чи архітектуру.

## Як працюємо

Епік за епіком, маленькими завершеними зрізами:
план епіку (plan mode, закрити блокуючі рішення) → реалізація → запис
`docs/implementation/00N-*.md` + важливі сценарії ручної перевірки в `docs/testing/` (кандидати в
e2e) → агент `review` (`.claude/agents/review.md`) → оновити статус у MASTER_PLAN і README.

Не комітити, не пушити, не створювати PR і не встановлювати залежності без явного прохання.

## Структура репо

```
nuxt.config.ts        Layer entry, реєструє src/module і @nuxt/icon
src/                  Nuxt Module і контракт cms.config (defineCmsConfig, #cms/config)
bin/                  Заготовка CLI nuxt-cms (сам CLI — 016)
app/data/             Supabase-клієнти (єдині імпорти SDK), CmsDataError, repositories, storage/ (Storage Adapter)
app/auth/             Матриця прав can() — має збігатися з SQL cms_can()
app/composables/      Публічне API: useCms, useCmsAuth, useSiteSettings, useCmsPage, usePermissions (усі exports —
                      глобальні auto-imports у Client)
app/components/admin/ Admin* UI під .cms-admin
app/components/cms/   Cms* primitives (Public Runtime): :value + field-key, дефолт — slot, без v-model (C-47)
app/primitives/       Хелпери primitives поза auto-imports: field-key, безпечний href, rich-text renderer
app/editor/           Editor Runtime (Edit Mode): Engine, Overlay, панелі, editable-гілки primitives.
                      Public імпортує лише context.ts; решта — через import() (C-21, C-65)
app/types/            Domain types; index.ts — публічний entry `nuxt-cms-core/types` для Client
app/pages/admin/      Admin-сторінки (login, shell, settings)
app/admin/            Композабли й хелпери адмінки поза auto-imports (useAdminI18n, useAdminSettings,
                      useAdminValidation — імпортувати явно, C-40); locales/ — словники, ключі cms.*
supabase/migrations/  Core migrations (публікуються з пакетом)
supabase/tests/       pgTAP smoke-тести міграцій (не публікуються)
playground/           Тестовий Client Project
scripts/              Dev-скрипти (не публікуються): check-public-bundle.mjs
tests/                Vitest
docs/                 MASTER_PLAN, source/architecture.md, implementation/, testing/ (сценарії
                      ручної перевірки, кандидати в e2e)
```

## Команди

```
npm run dev       # playground (nuxi dev playground)
npm run build     # build playground
npm run check:bundle # після build: public-сторінки не тягнуть Admin / Editor / Tiptap (DoD, C-21)
npm test          # vitest run (node; Nuxt-середовище — файли `*.nuxt.test.ts` / `tests/nuxt/**`)
npm run typecheck # nuxi typecheck playground + tsc -p src
npm run lint      # eslint (@nuxt/eslint-config, без stylistic)
npm run test:db   # pgTAP smoke-тест міграцій (supabase test db, потрібен локальний Supabase)
npm run gen:types # app/data/database.types.ts з локальної схеми — після кожної міграції
supabase start    # локальний Supabase (Docker); ключі — supabase status → .env
```

Без Docker — хмарний dev-проєкт (`supabase link`), див. README (MASTER_PLAN C-37).

## Ключові інваріанти (деталі — MASTER_PLAN §2)

- UI → Composable → Repository → Backend Adapter. Компоненти не звертаються до Supabase.
- Repository має лише методи своєї сутності; без BaseRepository «про запас».
- RLS на кожну mutation; `can()` в UI — не захист; secret key лише server-side.
- Anon-клієнт — singleton; клієнт із сесією — лише на request event; SSR-дані через `useAsyncData`.
- Public Runtime не тягне Admin / Editor / Tiptap / admin CSS — `npm run check:bundle` в DoD.
- Значення з БД — недовірений вхід: rich text рендериться без `v-html`, `href` — через allow-list
  (`app/primitives/link.ts`). Формати значень primitives — стабільний контракт, змінювати адитивно.
- Edit Mode — `/admin/edit/...`, та сама клієнтська сторінка, Draft замість Published.
- `cms.config.ts` — лише серіалізовані значення (потрапляє в client bundle).
- Переклади адмінки — `useAdminI18n()`, не vue-i18n / `@nuxtjs/i18n`; ізольовані від i18n Client Project.
- Тести — лише критична логіка (permissions, Publish, Lock, repositories, міграції). Без E2E.
- Мова документації — українська; код, ідентифікатори й коментарі в коді — англійською.
