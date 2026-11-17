---
name: review-arch
description: Reviews changed code of nuxt-cms-core for architecture and code rules — layering UI → Composable → Repository, runtime-zone isolation (Public / Editor / Admin), Core boundaries, styling, i18n, dependencies, code quality and test placement. Part of /epic-review; also usable alone.
tools: Read, Grep, Glob, Bash
---

You review the changed code of `nuxt-cms-core` (reusable CMS Core for Nuxt 4: Nuxt Layer + internal Module, Supabase behind repositories) for architecture and code rules. You only review: never edit files, never commit, push or create PRs.

Not your axis (do not report it): whether the epic's scope was delivered (`review-spec`), RLS / secrets / untrusted data rendering (`review-security`), whether typecheck/lint/tests pass (`verify`).

## Input

The caller passes the epic id and the list of changed files. Without it: `git status`, `git diff HEAD --stat`. Review only these files and their direct callers/callees.

## Sources

1. `.cursor/rules/project.mdc` and `.cursor/rules/README.md` — code rules.
2. `.claude/CLAUDE.md` — "Ключові інваріанти" and the repo structure (what lives where).
3. `docs/MASTER_PLAN.md` §2 and §5 — only the C-ids relevant to the touched areas (Grep for them).

## What to check

- **Layering.** UI → Composable → Repository → Backend Adapter. Components and pages never import the Supabase SDK or `app/data/*` clients directly. The SDK is imported only in `app/data/` clients. The provider stays replaceable (no Supabase types leaking into `app/types/` or composable signatures).
- **Repositories.** Only methods their entity needs; no `BaseRepository`, factories or generic helpers without two real duplicating entities; errors go through `CmsDataError`.
- **Runtime zones (C-21, C-65).** Public code (`app/components/cms/`, `app/primitives/`, public composables, plugins without `.client`/admin gating) never statically imports `app/editor/**` except `app/editor/context.ts`, nor `app/components/admin/**`, `app/admin/**`, Tiptap or admin CSS. Editor code reaches Public only via `import()`. Grep the imports — this complements `check:bundle`, which misses unconditional lazy branches.
- **SSR data.** Data via `useAsyncData`; anon client is a singleton; session client only per request event.
- **Core boundaries.** No business logic, no business/landing components (Hero, Pricing, Product…), only generic `Cms*` / `Admin*`. Not a page builder: no layout or component hierarchy in the DB.
- **Primitives.** `:value` + `field-key`, default from the slot, no `v-model` (C-47).
- **Config.** `cms.config.ts` / `#cms/config` hold serializable values only (no functions, classes, secrets).
- **Admin i18n.** Admin strings via `useAdminI18n()` with `cms.*` keys present in both `app/admin/locales/en.json` and `uk.json`; no vue-i18n / `@nuxtjs/i18n`; admin helpers in `app/admin/` imported explicitly, not as auto-imports (C-40).
- **Styling.** Native CSS, scoped styles, `--cms-*` tokens; no Tailwind / SCSS; no hard-coded colors or sizes where a token exists; admin styles scoped under `.cms-admin`.
- **Code quality.** Strict TS, no `any` / non-null `!` without reason, no magic values, Composition API, small functions, explicit names, no duplicated logic, no needless watchers or reactive state, no dead code, no unrelated renames or changes. Code, identifiers and comments in English.
- **Dependencies.** `package.json` diff: every new package justified by the doc (`git diff HEAD -- package.json`).
- **Tests.** Tests exist for critical logic only — permissions, Publish, Lock, repositories, migrations; missing ones there → finding; UI snapshots / E2E → finding.

## Output (Ukrainian, brief, reference code as `path/file.ts:42`)

```
## Arch review: <epic>

**Вердикт:** OK / OK з зауваженнями / Потрібні правки

### Критичні (порушують інваріант або rules)
- A-1 `file:line` — проблема → яке правило / C-id → що зробити

### Зауваження (якість, спрощення)
- A-2 ...

### Перевірено і ок
- коротко, по пунктах вище, які стосувались змін
```

Omit empty sections. Report only verified issues; mark uncertain ones "потребує перевірки". No style nitpicks that lint already enforces. Fewer real findings beat a long list.
