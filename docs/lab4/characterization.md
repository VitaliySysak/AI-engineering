# Характеризаційні тести: axios

- Дата: 2026-11-22 · форк: https://github.com/VitaliySysak/axios · нульова точка: `9f0f4ddfe72b4c06afafe1a658e6ee53d35b5760`
- Область: `lib/helpers/buildURL.js` — `buildURL(url, params, options)` отримує URL, обʼєкт параметрів і серіалізатор (функцію або обʼєкт опцій) і повертає рядок URL із доданим рядком запиту; разом із публічним входом `axios.getUri(config)`, який кличе її напряму
- Коміт із тестами: [c99ba7cc](https://github.com/VitaliySysak/axios/commit/c99ba7ccaaac34310e0e9fa6ed9d22252164d195) — лише `tests/unit/helpers/buildURL.characterization.test.js`, 79 рядків
- Звіти (сліпі прогони, покриття, Stryker): [62b0421b · lab4-evidence/step01/](https://github.com/VitaliySysak/axios/tree/62b0421b0f2494bf061801d313536e6a4ed23ff7/lab4-evidence/step01)

## 1. Що було з тестами до мене

- Запускач проєкту: **vitest** — 5.1.0 за lock-файлом (у `package.json` — `^5.0.5`), три проєкти в `vitest.config.js`: `unit`, `browser`, `browser-headless`
- Команда запуску дослівно: `npm run test:vitest:unit` (саме її називає `AGENTS.md` форка й виконує CI). `npm test` запускає ще й браузерні проєкти і без Playwright дає код 1 — див. [context.md](context.md), розділ 2
- Було тестів: **1800 у 77 файлах** · код виходу на нульовій точці: **0**. На саму область — `tests/unit/helpers/buildURL.test.js`, 23 тести (`buildURL` і `encode`)
- Тестову теку останнього разу чіпали: 2026-11-17 (`c0d4c900 fix(http): reject negative timeouts…`); файл тестів `buildURL` — 2026-06-19 (`a446b39b`)
- Що я приніс свого: **нічого в `package.json` і lock-файлі**. Інструменти вимірювання поставлено `npm i --no-save` (лише в `node_modules`, маніфести звірено `cmp` до і після): `@vitest/coverage-v8@5.1.0`, `@stryker-mutator/core@10.0.0`, `@stryker-mutator/vitest-runner@10.0.0` (останній зрештою не використано, розділ 5). Окремого коміту `chore(test):` немає, бо запускач уже був

## 2. Зафіксована поведінка

Усі значення в `expect` отримано циклом «нехай падіння скаже правду»: спершу в кожному `expect` стояло `'?'`, і падіння
назвали фактичні значення ([blind-run-1.txt](https://github.com/VitaliySysak/axios/blob/62b0421b0f2494bf061801d313536e6a4ed23ff7/lab4-evidence/step01/blind-run-1.txt)).
Входи — з наявних тестів проєкту, README та його історії.

| тест | яка поведінка зафіксована | звідки значення | баг? |
|---|---|---|---|
| `порожній обʼєкт params лишає URL разом із #фрагментом` | `{}` не додає `?` і не відрізає `#hash` | прогін 1, `Received: "/foo?foo=bar#hash"` · `buildURL.js#L59` | ні (питання 2 з context.md: чи задумано — не встановлено) |
| `params, де всі значення null/undefined, лишає URL разом із #фрагментом` | значення `null`/`undefined` пропускаються; якщо інших немає — URL не змінюється | прогін 1 | ні |
| `params = null повертає url як є, навіть якщо url не рядок` | без params `url` повертається без перевірки типу: `42` → `42`, `undefined` → `undefined` (не `''`) | прогін 1 (`expected 42`) і прогін 3 (`expected undefined`, [blind-run-3.txt](https://github.com/VitaliySysak/axios/blob/62b0421b0f2494bf061801d313536e6a4ed23ff7/lab4-evidence/step01/blind-run-3.txt)) | ні |
| `серіалізатор, що повернув порожній рядок, лишає URL разом із #фрагментом` | власний серіалізатор, що повернув `''`, нічого не додає і не відрізає `#hash` | прогін 1 | ні |
| `функція в options стає серіалізатором і отримує { serialize } другим аргументом` | функцію-третій аргумент загорнуто в `{ serialize: fn }`, і саме цю обгортку отримує серіалізатор | URL `/foo?x=1` — прогін 1; друге твердження (`{ serialize: serializer }`) прогін 1 не показав, бо тест упав на першому `expect` — значення виведено з `buildURL.js#L37-L41` і **підтверджено** прогоном 2 ([blind-run-2.txt](https://github.com/VitaliySysak/axios/blob/62b0421b0f2494bf061801d313536e6a4ed23ff7/lab4-evidence/step01/blind-run-2.txt)) | ні |
| `URL-обʼєкт замість рядка з непорожніми params кидає TypeError (зафіксований баг)` | `new URL(...)` як `url` падає голим `TypeError: url.indexOf is not a function`, а не `AxiosError` | прогін 1 · вхід з історії: підтримку URL-обʼєкта додали в `847d89b4` (#10866) і відкотили в `34adfd90` (#10874) | **так, фіксую навмисне** |
| `axios.getUri з порожніми params лишає #фрагмент` | публічний `getUri` поводиться як `buildURL`: `{}` лишає `#hash` | прогін 1 · `Axios.js#L322` | ні |
| `axios.getUri з непорожніми params відрізає #фрагмент` | `getUri` з `{ query: 'axios', page: 1 }` (приклад params із README) дає `/foo?query=axios&page=1` | прогін 1 | ні |

Зелено на незміненому коді:

```
git diff --stat 9f0f4ddfe72b4c06afafe1a658e6ee53d35b5760      # лише тести й lab4-evidence; файлів lib/ — 0
npm run test:vitest:unit                                      # код виходу 0, 1808 тестів у 78 файлах
```

Окремо лише цей файл: `npx vitest run --project unit tests/unit/helpers/buildURL.characterization.test.js` → код 0, 8 тестів.

## 3. Що свідомо НЕ покрито

| що | чому не покрито | чим це загрожує на кроці 02 |
|---|---|---|
| шлях `xhr`/`fetch` → `resolveConfig.js#L46` → `buildURL` | це браузерні адаптери; їх тести — у браузерних проєктах Vitest, а Playwright у мене не встановлено | зміна `buildURL` може поводитися інакше в браузері, і мій набір цього не побачить; CI форка (browser headless) — єдина сітка |
| перехоплення в `http.js#L1014-L1028` (виняток із `buildURL` → `AxiosError` `ERR_BAD_REQUEST`) | потрібен живий HTTP-запит через локальний сервер `tests/setup/server.js`; поза областю одного модуля | якщо крок 02 змінить, *які* винятки кидає `buildURL`, ця обгортка змінить коди помилок у Node — без мого тесту |
| `encode` на самотньому сурогаті (`'\uD800'`) | `encodeURIComponent` кидає `URIError`; вхід вигаданий — у фікстурах, README і тестах проєкту такого немає | низько: крок 02 не чіпає `encode` |
| внутрішня серіалізація `AxiosURLSearchParams` / `toFormData` (масиви, вкладені обʼєкти, `Date`) | це інший модуль; його поведінку вже тримають 23 наявні тести `buildURL.test.js` і `toFormData.test.js` | низько: їх не міняю |
| захист від забруднення прототипу в опціях | вже покрито наявним тестом `should ignore inherited serializer options` | — |

## 4. Покриття області

Інструмент: `@vitest/coverage-v8` **5.1.0** (а не 5.0.5 з таблиці курсу: peer прибитий точно до версії Vitest, а в
lock-файлі axios — 5.1.0; спроба з 5.0.5 — `ERESOLVE`, [install-coverage.txt](https://github.com/VitaliySysak/axios/blob/62b0421b0f2494bf061801d313536e6a4ed23ff7/lab4-evidence/step01/install-coverage.txt)).

Команда дослівно (Git Bash; «до» — з `--exclude` мого файлу):

```
npx vitest run --project unit --exclude tests/unit/helpers/buildURL.characterization.test.js --coverage.enabled --coverage.provider=v8 --coverage.include=lib/helpers/buildURL.js --coverage.reporter=text --coverage.reportsDirectory=lab4-evidence/step01/coverage-before
npx vitest run --project unit --coverage.enabled --coverage.provider=v8 --coverage.include=lib/helpers/buildURL.js --coverage.reporter=text --coverage.reportsDirectory=lab4-evidence/step01/coverage-after
```

До моїх тестів: рядки 100 %, гілки **94,44 % (17/18)**, непокрита гілка — L59 ·
після: рядки 100 %, гілки **100 % (18/18)** ([coverage-before.txt](https://github.com/VitaliySysak/axios/blob/62b0421b0f2494bf061801d313536e6a4ed23ff7/lab4-evidence/step01/coverage-before.txt), [coverage-after.txt](https://github.com/VitaliySysak/axios/blob/62b0421b0f2494bf061801d313536e6a4ed23ff7/lab4-evidence/step01/coverage-after.txt)).

Непокриті гілки, які зачіпає крок 02: **L59, хибна гілка `if (serializedParams)`** — порожня серіалізація, за якої `#фрагмент`
лишається. Саме її тепер тримають тести 1, 2, 4 і 7 з розділу 2.

## 5. Мутаційний прогін

Інструмент: `@stryker-mutator/core` 10.0.0 + **вбудований `command`-запускач** (не `@stryker-mutator/vitest-runner`)
· конфігурація: [stryker.config.mjs](https://github.com/VitaliySysak/axios/blob/62b0421b0f2494bf061801d313536e6a4ed23ff7/lab4-evidence/step01/stryker.config.mjs) і [vitest.stryker.config.mjs](https://github.com/VitaliySysak/axios/blob/62b0421b0f2494bf061801d313536e6a4ed23ff7/lab4-evidence/step01/vitest.stryker.config.mjs)
· `mutate: ['lib/helpers/buildURL.js']` · `concurrency: 4` (машина — 16 логічних ядер) · `incremental: true`, `coverageAnalysis: 'off'`

Команда дослівно (PowerShell, з кореня форка; `$env:STRYKER_TESTS = 'existing'` — прогін лише з наявними тестами):

```
npx stryker run lab4-evidence/step01/stryker.config.mjs
npx stryker run lab4-evidence/step01/stryker.config.mjs --force
```

Генератор `npm init stryker@latest` не запускав: він ставить пакети в `package.json` чужого проєкту, а крок 00 вимагав
їх не чіпати. Конфігурацію написав руками, ключі звірив із `npx stryker run --help`.

| прогін | тести | тривалість МОГО прогону | мутантів | убито | вижило | без покриття |
|---|---|---|---|---|---|---|
| лише наявні тести проєкту | `buildURL.test.js`, 23 | 22 с | 43 | 40 | 3 | 0 |
| наявні + мої, перша версія | + 8 характеризаційних | 25 с | 43 | 41 | 2 | 0 |
| наявні + мої, після нового `expect` (`--force`) | ті самі, +1 твердження | 25 с (Stryker: «Done in 23 seconds») | 43 | **43** | **0** | 0 |

Звіти (у ФОРКУ): [mutation-existing/mutation.html](https://github.com/VitaliySysak/axios/blob/62b0421b0f2494bf061801d313536e6a4ed23ff7/lab4-evidence/step01/mutation-existing/mutation.html),
[mutation-all/mutation.html](https://github.com/VitaliySysak/axios/blob/62b0421b0f2494bf061801d313536e6a4ed23ff7/lab4-evidence/step01/mutation-all/mutation.html),
вивід — [stryker-existing.txt](https://github.com/VitaliySysak/axios/blob/62b0421b0f2494bf061801d313536e6a4ed23ff7/lab4-evidence/step01/stryker-existing.txt), [stryker-all-3-force.txt](https://github.com/VitaliySysak/axios/blob/62b0421b0f2494bf061801d313536e6a4ed23ff7/lab4-evidence/step01/stryker-all-3-force.txt).

| вижилий мутант (файл#рядок, що змінено) | що зробив |
|---|---|
| `buildURL.js#L59`, `if (serializedParams)` → `if (true)` (вижив лише з наявними тестами) | убили тести 1, 2, 4, 7 з розділу 2 — ще в першій версії набору |
| `buildURL.js#L32`, `if (!params)` → `if (false)` | додав `expect(buildURL(undefined, null)).toBeUndefined()` у тест 3: без ранньої віддачі `undefined` стає `''` |
| `buildURL.js#L32`, тіло `{ return url; }` → `{}` | той самий новий `expect` — той самий наслідок |

Що пішло не так дорогою (усе — у звітах форка, нічого не стерто):

1. **Перший запуск упав**: `TypeError: ts.parseConfigFileTextToJson is not a function` ([stryker-fail-ts7.txt](https://github.com/VitaliySysak/axios/blob/62b0421b0f2494bf061801d313536e6a4ed23ff7/lab4-evidence/step01/stryker-fail-ts7.txt)). У `node_modules` axios — TypeScript 7.0.2, а препроцесор tsconfig у core 10.0.0 кличе API, якого в TS 7 немає. Проєкт на JS, тож вимкнув препроцесор опцією `tsconfigFile`, що вказує на неіснуючий файл.
2. **З `@stryker-mutator/vitest-runner` 10.0.0 і Vitest 5.1.0 усі 43 мутанти «вижили»** в обох наборах ([stryker-vitest-runner-all-survived.txt](https://github.com/VitaliySysak/axios/blob/62b0421b0f2494bf061801d313536e6a4ed23ff7/lab4-evidence/step01/stryker-vitest-runner-all-survived.txt)) — включно з мутантом L35 (`url || 'Stryker was here!'`), який очевидно ламає наявний тест `should support params with undefined url`. Перевірив вручну в пісочниці Stryker: з `globalThis.__stryker__.activeMutant = '3'` інструментований `buildURL(undefined, {foo:'bar'})` повертає `"Stryker was here!?foo=bar"` — тобто мутанти робочі, а не активує їх запускач. Vitest 5.0.5, з яким курс перевіряв цю пару, через `--no-save` поставити не вдалося (`ERESOLVE`, [install-vitest-5.0.5.txt](https://github.com/VitaliySysak/axios/blob/62b0421b0f2494bf061801d313536e6a4ed23ff7/lab4-evidence/step01/install-vitest-5.0.5.txt)). Перейшов на `command`-запускач. Результат «0 убито» я не прийняв як число для цього файлу: 100 % виживання на коді, де ручна перевірка вбиває мутанта, — збій вимірювання, а не властивість набору.
3. **Інкрементальний режим перевикористав застарілі результати.** Після додавання нового `expect` прогін із `--incremental` повторно взяв усі 43 старі результати («43 of 43 mutant result(s) are reused») і знову показав 2 вижилих ([stryker-all-2-incremental-reused.txt](https://github.com/VitaliySysak/axios/blob/62b0421b0f2494bf061801d313536e6a4ed23ff7/lab4-evidence/step01/stryker-all-2-incremental-reused.txt)). З `coverageAnalysis: 'off'` Stryker бачить увесь набір як один тест і змін у тестах не помічає. Підсумкове число — лише з прогону `--force`.

## 6. Тести, згенеровані агентом

Інструмент і модель: тести написала сесія-помічник Claude Code 2.1.302 (desktop) · Opus 5.5 (`claude-opus-5-5`) у форку,
циклом «`'?'` в expect → прогін → фактичне значення» · режим дозволів: auto (сесія-помічник) ·
заборона на правку реалізації: **правила дозволів на рівні інструменту не було** (`--disallowedTools` застосовується до
`claude -p`, а не до цієї сесії). Захист — механічний: `git diff --name-only 9f0f4ddf -- lib index.js index.d.ts index.d.cts package.json package-lock.json vitest.config.js`
→ 0 файлів перед кожним комітом, і тести закомічено окремим комітом `c99ba7cc`, у якому один файл.

Скільки тестів згенеровано: 8 (`it`) · скільки лишилося після перегляду: 8, плюс 1 твердження, додане після мутаційного прогону.

Що виправив після перегляду за чеклістом курсу:
- походження кожного `expect` — прогін; одне твердження (`seen` у тесті 5) спершу виведено з коду — це записано в таблиці розділу 2 разом із прогоном, який його підтвердив;
- тестів без твердження немає; `expect.any`, `toBeTruthy`, `toBeDefined` — немає;
- входи: `'/foo?foo=bar#hash'`, `{ isUndefined, isNull }` — з наявних тестів; `{ query: 'axios', page: 1 }` — з README; URL-обʼєкт — з історії (#10866/#10874); `42` — вигаданий, і його поведінку (повернення як є) свідомо подано як відсутність перевірки типу, а не як сценарій використання;
- змін поза тестовою текою немає (диф вище); прогін на нульовій точці зелений.
