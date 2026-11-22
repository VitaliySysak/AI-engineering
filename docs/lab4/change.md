# Обмежена зміна: `axios.getUri()` відхиляє url, на якому падає `buildURL`, через `AxiosError` з `ERR_BAD_REQUEST`, а не голий `TypeError`

- Дата: 2026-11-22 · форк: https://github.com/VitaliySysak/axios · нульова точка: `9f0f4ddfe72b4c06afafe1a658e6ee53d35b5760`
- Коміт нового тесту (ПЕРЕД зміною): [80ebc96c](https://github.com/VitaliySysak/axios/commit/80ebc96c4b16851e8e6e74ad707f51c8fcce3934)
- Коміт зміни: [4baf9678](https://github.com/VitaliySysak/axios/commit/4baf9678ef9a85fbc9e3514fe9114805bbe55322) · гілка: `lab4/change` (від `c99ba7cc` — характеризаційні тести кроку 01)
- План відкоту закомічено раніше за зміну: `c681d20` у курсовому репозиторії, 2026-11-22 15:55:58 +0200; коміт зміни у форку — 16:00 того ж дня
- Чому проєктові це потрібно: **баг, зафіксований тестом кроку 01** — `URL-обʼєкт замість рядка з непорожніми params кидає TypeError (зафіксований баг)`
  ([characterization.md](characterization.md), розділ 2). Плюс власне правило проєкту з `AGENTS.md`: «Throw `AxiosError` for axios-originated failures; never raw `Error`… Wrap third-party errors with `AxiosError.from(…)`». Node-адаптер для того самого збою вже так робить
  ([http.js#L1014-L1028](https://github.com/VitaliySysak/axios/blob/9f0f4ddfe72b4c06afafe1a658e6ee53d35b5760/lib/adapters/http.js#L1014-L1028)); `getUri` — ні
  ([Axios.js#L316-L323](https://github.com/VitaliySysak/axios/blob/9f0f4ddfe72b4c06afafe1a658e6ee53d35b5760/lib/core/Axios.js#L316-L323))

Відкинутий варіант: навчити `buildURL` приймати URL-обʼєкт. Саме це мейнтейнери додали в `847d89b4` (#10866) і
відкотили в `34adfd90` (#10874, 9 файлів) — це зміна публічної поведінки, а не виправлення.

## 1. Приймання (КОМАНДИ, не побажання)

Усі — у `change-tree` на коміті `4baf9678`, PowerShell.

| команда | очікуваний код виходу | фактичний |
|---|---|---|
| `npm run test:vitest:unit` | 0 | 0 (1811 тестів, 79 файлів) |
| `npx vitest run --project unit tests/unit/helpers/buildURL.characterization.test.js` | 0 | 0 (8) |
| `npx vitest run --project unit tests/unit/core/getUri.badRequest.test.js` | 0 | 0 (3) |
| `npm run lint` | 0 | 0 |
| `npx prettier --check lib/core/Axios.js` | 0 | 0 |
| `npx --yes madge@8.0.0 --circular lib` | 0, «No circular dependency found!» | 0, так (новий імпорт `AxiosError` у `Axios.js` циклу не дав) |
| `git diff --stat c99ba7cc 4baf9678 -- package.json package-lock.json .github tests/unit/helpers` | порожньо | порожньо |

## 2. Що змінено

| файл | рядків + / − | яке твердження цей файл підтверджує |
|---|---|---|
| [lib/core/Axios.js](https://github.com/VitaliySysak/axios/blob/4baf9678ef9a85fbc9e3514fe9114805bbe55322/lib/core/Axios.js#L323-L330) | +10 / −2 | L14 `import isAxiosError` — розпізнати вже готову `AxiosError` наявним хелпером проєкту; L17 `import AxiosError, { getCauseStackIndex }` — щоб було чим загорнути; L323–L330 `try/catch` лише навколо `buildURL`: `AxiosError` пролітає без змін, решта → `AxiosError.from(error, ERR_BAD_REQUEST, config)` |
| [tests/unit/core/getUri.badRequest.test.js](https://github.com/VitaliySysak/axios/blob/80ebc96c4b16851e8e6e74ad707f51c8fcce3934/tests/unit/core/getUri.badRequest.test.js) | +41 / −0 | новий тест на нову поведінку: `isAxiosError`, `code === ERR_BAD_REQUEST`, `cause` — вихідний `TypeError` |

Один файл реалізації, один коміт зміни. Оновлене характеризаційне твердження: **немає** — тест кроку 01 перевіряє
`buildURL` напряму, а його поведінка не змінилася (`TypeError` лишається, загортає вже `getUri`).

Свідомо не зроблено: запис у `PRE_RELEASE_CHANGELOG.md`, якого `AGENTS.md` axios вимагає «for every PR». PR в
upstream ми не відкриваємо, а другий файл вийшов би за межу кроку; агент сам на це вказав у підсумку.

## 3. Три докази

1. **Характеризація після зміни:** `npx vitest run --project unit tests/unit/helpers/buildURL.characterization.test.js` → код 0, **8 тестів**
   (та сама кількість, що на кроці 01). Увесь unit-набір: `npm run test:vitest:unit` → код 0, **1811** (1808 кроку 01 + 3 нові).
   Вивід: [char-after.txt](https://github.com/VitaliySysak/axios/blob/37890f40160132682451d293d8b04a52e0c0f23d/lab4-evidence/step02/char-after.txt),
   [unit-after.txt](https://github.com/VitaliySysak/axios/blob/37890f40160132682451d293d8b04a52e0c0f23d/lab4-evidence/step02/unit-after.txt).
2. **Новий тест:** на своєму коміті `80ebc96c` (до зміни) — **ЧЕРВОНИЙ**, `Tests 3 failed (3)`:
   `expected false to be true` (isAxiosError), `expected undefined to be 'ERR_BAD_REQUEST'`, `expected undefined to be an instance of TypeError`
   ([new-test-red.txt](https://github.com/VitaliySysak/axios/blob/37890f40160132682451d293d8b04a52e0c0f23d/lab4-evidence/step02/new-test-red.txt));
   після зміни — **ЗЕЛЕНИЙ**, `Tests 3 passed (3)` ([new-test-green.txt](https://github.com/VitaliySysak/axios/blob/37890f40160132682451d293d8b04a52e0c0f23d/lab4-evidence/step02/new-test-green.txt)).
3. **До / після на тому самому вході** — скрипт [before-after.mjs](https://github.com/VitaliySysak/axios/blob/37890f40160132682451d293d8b04a52e0c0f23d/lab4-evidence/step02/before-after.mjs)
   кличе `axios.getUri` з трьома входами з проєкту (URL-обʼєкт — з історії #10866; вкладеність 150 — з `tests/unit/core/paramsMerge.test.js`; params — з README):

   | вхід | до (`9f0f4ddf`) | після (`4baf9678`) |
   |---|---|---|
   | `{ url: new URL('http://localhost/foo'), params: { foo: 'bar' } }` | кидає `TypeError`, `isAxiosError=false`, `code=undefined` | кидає `AxiosError`, `isAxiosError=true`, `code=ERR_BAD_REQUEST`, `cause=TypeError`, той самий `message` |
   | `{ url: '/resource', params: <вкладеність 150> }` | `AxiosError`, `code=ERR_FORM_DATA_DEPTH_EXCEEDED` | без змін — той самий код |
   | `{ url: '/foo#hash', params: { query: 'axios', page: 1 } }` | `"/foo?query=axios&page=1"` | без змін |

## 4. Межі агента в цьому прогоні

- Інструмент і модель із версією: Claude Code 2.1.302, `claude -p --model haiku` → `claude-haiku-5-5` (за `modelUsage`)
- Режим: **`--permission-mode dontAsk`**
- Дозволені інструменти дослівно: `--tools "Read,Grep,Glob,Edit,Bash" --allowedTools "Read,Grep,Glob,Edit(lib/core/Axios.js),Bash(npx vitest run *),Bash(git diff *)" --strict-mcp-config --max-turns 12 --max-budget-usd 1.00`
- Заборона на тестову теку дослівно: `--disallowedTools "Edit(tests/**)"` (саме `Edit(...)` — правила для `Write`/`MultiEdit` не перевіряються)
- Ізоляція: `git worktree add -b lab4/change ..\change-tree c99ba7ccaaac34310e0e9fa6ed9d22252164d195`; `node_modules` — junction на основний checkout ·
  `git -C ..\axios status --short` після обох прогонів: **порожньо (чистий)**; `git diff --stat -- tests/` після прогонів: порожньо
- Прогін 1 (сесія `c9a56fb8-6cfb-4948-9c08-97c6c6c3ed9d`): 7 ходів, $0.0066, відмов дозволів 0. Прогін 2 (сесія `28fb4b7e-2023-4fae-a1cf-4d74bec72525`): 9 ходів, $0.0060, **1 відмова** — складений Bash `cd … && git diff && npx eslint … | tail` (у переліку немає `eslint`); агент не обходив і сказав про це в підсумку

## 5. Перегляд дифа

Хто і чим: я очима, рядок за рядком — **до** власного прогону тестів (агент свої тести вже прогнав; їм я не вірив).
Машинну другу думку (`claude ultrareview`) не брав: її запускає лише людина, і вона платна; у чужий репозиторій нічого не надсилали.

Що виправлено за переглядом і брамою:
- **Спроба 1 відхилена.** Диф ([attempt1.diff](https://github.com/VitaliySysak/axios/blob/37890f40160132682451d293d8b04a52e0c0f23d/lab4-evidence/step02/attempt1.diff)) загортав **будь-яку** помилку `buildURL`. Перегляд цього не помітив — помітив повний unit-набір: впав наявний тест
  `paramsMerge.test.js > retains default and lowered serializer depth limits`, бо `AxiosError` з `ERR_FORM_DATA_DEPTH_EXCEEDED` перекодовувалась на `ERR_BAD_REQUEST`
  (`AxiosError.from` бере переданий `code` замість `error.code`) — [attempt1-unit.txt](https://github.com/VitaliySysak/axios/blob/37890f40160132682451d293d8b04a52e0c0f23d/lab4-evidence/step02/attempt1-unit.txt).
  Незакомічену правку прибрано `git checkout -- lib/core/Axios.js` (диф збережено), агента перезапущено з уточненням: `AxiosError` пропускати без змін.
- У спробі 2 кожен рядок має твердження з розділу 2; зайвих немає.

Що відкинуто і чому:
- Підказка агента додати запис у `PRE_RELEASE_CHANGELOG.md` — другий файл, PR в upstream не відкриваємо (розділ 2).
- Пропозиція агента переписати перевірку через `instanceof AxiosError` замість імпорту `isAxiosError` — `isAxiosError` уже є в проєкті й не залежить від ідентичності класу між збірками; лишив.
- Не передавати в `AxiosError.from` додаткові `{ url, exists: true }`, як у `http.js` — це поля, які читає саме HTTP-шлях; для `getUri` вони нічого не підтверджують.

## 6. Кінцевий стан форка

**Зміна лишається** в гілці [`lab4/change`](https://github.com/VitaliySysak/axios/tree/lab4/change) (`80ebc96c` тест → `4baf9678` зміна);
**відкот — доказом** у гілці [`lab4/rollback-drill`](https://github.com/VitaliySysak/axios/tree/lab4/rollback-drill) (`f86f39c9`, не зливається).
Типова гілка форка `v1.x` лишається на нульовій точці `9f0f4ddf`; звіти всіх кроків — у `lab4/step-00`.
