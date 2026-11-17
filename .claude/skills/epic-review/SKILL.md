---
name: epic-review
description: Orchestrated review of a finished epic of nuxt-cms-core. Runs four sub-agents in parallel — verify (machine checks), review-spec (doc vs code), review-arch (architecture and code rules), review-security (RLS, keys, untrusted data) — then de-duplicates, re-checks critical findings and produces one report. Use at the end of an epic or when asked to "review 008" / "epic review". After fixes: "/epic-review 008 recheck".
argument-hint: "<epic id> [recheck]"
---

You orchestrate the review of one epic. You do not review the code yourself in step 3 — the sub-agents do; your job is scope, dispatch, verification and the single report. Never edit code, commit or push during this skill.

## 1. Pin the scope

- **Epic id** — from the argument; otherwise the latest `in progress` / just-finished epic in `docs/implementation/README.md`. If ambiguous, ask.
- **Implementation record** — `docs/implementation/<id>-*.md`. Missing → tell the user the record is required before review (CLAUDE.md workflow) and stop.
- **MASTER_PLAN section** — the epic's heading in `docs/MASTER_PLAN.md` §4 (line range).
- **Changed files** — the epic is usually uncommitted: `git status --short` + `git diff HEAD --name-only` + untracked files. If the epic is already committed, use the commits the user names (`git diff <base>...HEAD --name-only`). Drop files clearly outside the epic (ask if unsure). Empty list → stop and say so.

## 2. Dispatch (one message, four parallel Agent calls)

Give every agent the same scope block, so none re-derives it:

```
Epic: <id> — <title>
Implementation record: docs/implementation/<file>
MASTER_PLAN: §4 <heading>, lines <a>-<b>
Changed files:
- ...
```

| Agent | Extra instruction |
|---|---|
| `verify` | Run all checks. Changed files are only for the types-drift and Edit Mode notes. |
| `review-spec` | — |
| `review-arch` | — |
| `review-security` | If no migrations / data / auth / rendering of stored values changed, say so and do a short pass. |

**Recheck mode** (`recheck` argument, after fixes): run `verify` plus only the reviewers that had critical findings or remarks last time; pass them the previous findings and ask to confirm each one fixed / not fixed, plus any new problem in the fix.

## 3. Aggregate

1. **De-duplicate.** The same root cause reported by two agents → one finding, keep both IDs (`A-2 = X-1`), keep the higher severity.
2. **Verify every critical finding yourself** — open the cited `file:line` and confirm. Not reproducible → downgrade to "потребує перевірки" with a note; wrong → drop it and say it was dropped in one line.
3. **Severity rule.** Any failed check in `verify`, any confirmed critical → verdict **Потрібні правки**. Remarks / drift only → **OK з зауваженнями**. Skipped checks never count as passed; list them.
4. Do not add new findings of your own beyond what verification shows; if you notice something, mark it as yours.

## 4. Report (Ukrainian)

```
## Epic review: <id> — <title>

**Вердикт:** OK / OK з зауваженнями / Потрібні правки
verify: ✅/❌ · spec: <verdict> · arch: <verdict> · security: <verdict>

### Перевірки
<verify table, failed / skipped rows first>

### Критичні
- [X-1] `file:line` — проблема → чому → що зробити

### Зауваження
- [A-3] ...

### Doc drift
- [S-2] ...

### Питання до автора
- ...

### Не перевірено
- skipped checks, "потребує перевірки", Edit Mode lazy branch in the browser
```

Omit empty sections. Keep the agents' IDs so the user can say "fix X-1, A-3". After the report, offer to fix the confirmed findings — do not start fixing without a yes. When the review is OK, remind the next workflow step: update the epic status in MASTER_PLAN and `docs/implementation/README.md`.
