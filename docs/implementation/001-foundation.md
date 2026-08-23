# 001 — Package foundation

Перший implementation step: довести, що `nuxt-cms-core` технічно існує як reusable Nuxt package.

## Що зроблено

Пакет перетворено зі стартера Nuxt-застосунку на Nuxt Layer, який реєструє внутрішній Nuxt Module.

- Layer entry: `nuxt.config.ts` реєструє `./src/module` через `createResolver`.
- Контракт конфігу: `src/config.ts` (`CmsConfig`, `ResolvedCmsConfig`, `defineCmsConfig`, `resolveCmsConfig`).
- Module: `src/module.ts` читає `cms.config.ts` через `c12`, мержить із дефолтами і віддає результат через віртуальний `#cms/config`.
- Runtime: `app/composables/useCms()` повертає `{ version, config }`.
- Playground: consumer-застосунок з `extends: ['nuxt-cms-core']` для перевірки package ззовні.

`cms.config.ts` у клієнтському проєкті опційний. Єдине поле на цьому етапі — `debug`.

## Ключові рішення

- Layer + internal Module, а не окремий публічний module entry. Layer дає auto-import composables, Module — build-time логіку.
- Конфіг експортується через `#cms/config` (`addTemplate` + alias), а не через `runtimeConfig`. Це build-time значення, не env override.
- Нових dependencies не додавали: `@nuxt/kit` і `c12` уже були в дереві.

## Перевірено

- `useCms()` доступний у playground без явного імпорту.
- Зміна `debug` у `cms.config.ts` перезапускає dev і оновлює значення.
- Без `cms.config.ts` застосунок працює на дефолтах (`debug: false`).
- `npm run build` і `npm run preview` віддають той самий результат.

## Обмеження

Якщо `cms.config.ts` спочатку не існував, а потім його створили, dev-сервер треба перезапустити вручну. Модуль не стежить за неіснуючим файлом.

## Що свідомо не робили

Auth, Admin, Edit Mode, repositories, migrations, media, localization, forms, plugins, middleware і будь-які майбутні CMS features.
