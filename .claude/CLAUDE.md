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
`docs/implementation/00N-*.md` → агент `review` (`.claude/agents/review.md`) → оновити статус
у MASTER_PLAN і README.

Не комітити, не пушити, не створювати PR і не встановлювати залежності без явного прохання.

## Структура репо

```
nuxt.config.ts        Layer entry, реєструє src/module і @nuxt/icon
src/                  Nuxt Module і контракт cms.config (defineCmsConfig, #cms/config)
bin/                  Заготовка CLI nuxt-cms (сам CLI — 016)
app/data/             Supabase-клієнти (єдині імпорти SDK), CmsDataError, repositories
app/auth/             Матриця прав can() — має збігатися з SQL cms_can()
app/composables/      useCms, useCmsAuth, useSiteSettings, usePermissions, ... (усі exports — глобальні
                      auto-imports у Client; хелпери адмінки — в app/admin/, його не сканують)
app/components/admin/ Admin* UI під .cms-admin
app/pages/admin/      Admin-сторінки (login, shell, settings)
app/admin/            Хелпери адмінки поза auto-imports; locales/ — словники (en, uk) для
                      useAdminI18n(), ключі cms.*
supabase/migrations/  Core migrations (публікуються з пакетом)
playground/           Тестовий Client Project
tests/                Vitest
docs/                 MASTER_PLAN, source/architecture.md, implementation/
```

## Команди

```
npm run dev       # playground (nuxi dev playground)
npm run build     # build playground
npm test          # vitest run (node; Nuxt-середовище — файли `*.nuxt.test.ts` / `tests/nuxt/**`)
npm run typecheck # nuxi typecheck playground + tsc -p src
npm run lint      # eslint (@nuxt/eslint-config, без stylistic)
supabase start    # локальний Supabase (Docker); ключі — supabase status → .env
```

Без Docker — хмарний dev-проєкт (`supabase link`), див. README (MASTER_PLAN C-37).

## Ключові інваріанти (деталі — MASTER_PLAN §2)

- UI → Composable → Repository → Backend Adapter. Компоненти не звертаються до Supabase.
- Repository має лише методи своєї сутності; без BaseRepository «про запас».
- RLS на кожну mutation; `can()` в UI — не захист; secret key лише server-side.
- Anon-клієнт — singleton; клієнт із сесією — лише на request event; SSR-дані через `useAsyncData`.
- Public Runtime не тягне Admin / Editor / Tiptap / admin CSS — перевірка бандла в DoD.
- Edit Mode — `/admin/edit/...`, та сама клієнтська сторінка, Draft замість Published.
- `cms.config.ts` — лише серіалізовані значення (потрапляє в client bundle).
- Переклади адмінки — `useAdminI18n()`, не vue-i18n / `@nuxtjs/i18n`; ізольовані від i18n Client Project.
- Тести — лише критична логіка (permissions, Publish, Lock, repositories, міграції). Без E2E.
- Мова документації — українська; код, ідентифікатори й коментарі в коді — англійською.
