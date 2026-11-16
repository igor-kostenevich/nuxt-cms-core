# Публічний сайт — сценарії перевірки

Читання опублікованого контенту і primitives у Public Runtime (епіки 005–007,
[005](../implementation/005-pages.md), [006](../implementation/006-primitives.md),
[007](../implementation/007-draft-publish.md)).

### PUB-PAGE-01 — Сторінка без контенту в БД
**Кроки:** відкрити `/about` (рядка `about` у seed немає).
**Очікувано:** сторінка з дефолтами з коду, без помилок.
**E2E:** так.

### PUB-PAGE-02 — Draft не видно на сайті
**Кроки:** в Edit Mode змінити заголовок → Save draft (без Publish) → відкрити `/` у вікні без
входу.
**Очікувано:** на сайті старий заголовок. Після Publish — новий (без перезапуску сервера).
**E2E:** так.

### PUB-SAFE-01 — Небезпечний вміст з БД не виконується
**Кроки:** у Studio записати в опубліковану сторінку `hero.cta.href = "javascript:alert(1)"` і в rich
text текст `<img src=x onerror=alert(1)>` → відкрити `/`.
**Очікувано:** кнопка без лінку (звичайна `<button>`), HTML показано як текст, жодного alert.
**E2E:** так.

### PUB-BUNDLE-01 — Публічні сторінки без коду адмінки й редактора
**Кроки:** `npm run build && npm run check:bundle`; додатково у DevTools → Network на `/`.
**Очікувано:** скрипт — OK; у Network немає admin / editor / Tiptap чанків і admin CSS.
**E2E:** так (скрипт уже є).
