# Відновлений контекст: axios

- Дата: 2026-11-22
- Оригінал: https://github.com/axios/axios · мій форк: https://github.com/VitaliySysak/axios
- Ліцензія: MIT, файл: [LICENSE у форку](https://github.com/VitaliySysak/axios/blob/9f0f4ddfe72b4c06afafe1a658e6ee53d35b5760/LICENSE) (`"license": "MIT"` також у `package.json:97`)
- Нульова точка (SHA базового коміту форка): `9f0f4ddfe72b4c06afafe1a658e6ee53d35b5760` (гілка `v1.x`, 2026-11-18)
- Node у мене: 24.21.0 (npm 11.19.0) · Node, якого просить проєкт (engines): **не оголошено**. CI ганяє Node 26.x, smoke-тести — від 12 до 26
- Режим читання агента: Claude Code 2.1.302 `claude -p --permission-mode plan --tools "Read,Grep,Glob" --strict-mcp-config`.
  Питання й сирі відповіді: [lab4-evidence/agent/](https://github.com/VitaliySysak/axios/tree/f6ba3d5038c72093a330266440727d629660cc6a/lab4-evidence/agent). Запис — у [autonomy-log.md](autonomy-log.md), сесія 1
- Звіти інструментів лежать у форку, гілка `lab4/step-00`, коміт `f6ba3d50`: [lab4-evidence/](https://github.com/VitaliySysak/axios/tree/f6ba3d5038c72093a330266440727d629660cc6a/lab4-evidence). Код проєкту в цьому коміті не змінено (`git diff --stat 9f0f4ddf f6ba3d50 -- lib tests` порожній)

Вибір погоджено з викладачем. До вибору через «фільтр за пів години» пройшли ще дев'ять кандидатів (yargs-parser,
p-queue, commander.js, path-to-regexp, cookie, node-semver, validator.js, nanoid, shadcn/ui). axios узято як
найбільший із тих, що чисто проходять фільтр на npm.

## 1. Що проєкт робить

axios — HTTP-клієнт на промісах для браузера й Node.js. Користувач викликає `axios(config)` або `axios.get(url)`,
бібліотека зливає конфіг із типовими значеннями, проганяє інтерсептори, обирає адаптер (XHR або fetch у браузері,
`http`/`https` у Node) і повертає проміс з об'єктом відповіді або з `AxiosError`. Пакет публікується в npm у
кількох збірках (ESM, CJS для Node, CJS для браузера) і має власні типи `index.d.ts` / `index.d.cts`.

## 2. Як його запустити й протестувати

Усе в PowerShell 5.1 на Windows 11, команди дослівно; `$LASTEXITCODE` читав одразу після кожної команди.

| крок | команда дослівно | код виходу | що побачив |
|---|---|---|---|
| клонування | `git clone -c core.autocrlf=false https://github.com/VitaliySysak/axios.git axios` | 0 | `-c core.autocrlf=false` обов'язковий на моїй машині: глобально стоїть `core.autocrlf=true`, і на двох інших кандидатах prettier падав на CRLF |
| нульова точка | `git rev-parse HEAD` | 0 | `9f0f4ddfe72b4c06afafe1a658e6ee53d35b5760` |
| версії | `node --version` · `npm --version` | 0 · 0 | `v24.21.0` · `11.19.0` |
| engines | `Get-Content package.json \| Select-String -Pattern '"engines"' -Context 0,3` | — | 0 збігів: поля `engines` немає |
| встановлення | `npm ci` | 0 | 10 с, `added 631 packages`, попереджень про peer-залежності немає, `3 moderate severity vulnerabilities`. Репозиторний `.npmrc` має `ignore-scripts=true`, тож скрипти залежностей не запускались |
| тести (як просить README) | `npm test` | **1** | 70 с. Unit-проєкт проходить, але Vitest запускає й браузерні проєкти, а браузерів Playwright немає: `browserType.launch: Executable doesn't exist at …\ms-playwright\chromium_headless_shell-…` |
| unit-тести | `npm run test:vitest:unit` | 0 | 69 с, **1800 тестів, 77 файлів**, усі зелені |
| лінтер | `npm run lint` | 0 | — |
| збирання | `npm run build` | 0 | 6 с; `git status --short` після збирання порожній (`dist/` у `.gitignore`) |
| що перевіряє CI | `.github/workflows/run-ci.yml`: `npm ci --ignore-scripts` → `npm run lint` → `npm run build` → `npx playwright install --with-deps` → `npm run test:vitest:unit` → `npm run test:vitest:browser:headless` → `npm pack` → smoke CJS (Node 12–18) і ESM (Node 20–26) з упакованого тарбола | — | ще 7 workflow: `bundle-size`, `lockfile-lint`, `moderator`, `publish`, `release-branch`, `verify-build-reproducibility`, `zizmor` |

Точки входу (з `package.json`): `main` → `./dist/node/axios.cjs`, `module` → `./index.js`, `types` →
`index.d.ts`, `type: module`; `exports["."]` розгалужує умови `types`/`bun`/`react-native`/`browser`/`default`;
поле `browser` підміняє `lib/adapters/http.js` і Node-платформу на `lib/helpers/null.js` і браузерну платформу.
Окремо експортуються `./unsafe/*` → `./lib/*`, тобто внутрішні хелпери (зокрема `buildURL.js`) доступні
ззовні. `bin` немає.

Браузерні тести я свідомо не вмикав: `npx playwright install` тягне три браузери, а для кроків 00–02 мені
вистачає unit-проєкту. Повну відповідність CI це не дає — див. розділ 6.

## 3. Пʼять файлів, що мають значення

| файл (permalink) | чому саме він | звідки знаю |
|---|---|---|
| [lib/helpers/buildURL.js](https://github.com/VitaliySysak/axios/blob/9f0f4ddfe72b4c06afafe1a658e6ee53d35b5760/lib/helpers/buildURL.js) | модуль майбутньої зміни кроку 02: 69 рядків, читається за раз; збирає рядок запиту з `params` | граф залежностей · `git log --follow` (36 комітів) · прочитав повністю |
| [lib/adapters/http.js](https://github.com/VitaliySysak/axios/blob/9f0f4ddfe72b4c06afafe1a658e6ee53d35b5760/lib/adapters/http.js) | найчастіше змінюваний файл коду (218 комітів з усієї історії) і найскладніший у Node; викликає `buildURL` у `try/catch` | ранжування за частотою змін · complexity · прочитав L1012–L1028 |
| [lib/core/Axios.js](https://github.com/VitaliySysak/axios/blob/9f0f4ddfe72b4c06afafe1a658e6ee53d35b5760/lib/core/Axios.js) | серце запиту: `_request` (ланцюг інтерсепторів) і `getUri`, який кличе `buildURL` напряму | граф залежностей · complexity 27 · прочитав L220–L250 і L316–L323 |
| [lib/helpers/resolveConfig.js](https://github.com/VitaliySysak/axios/blob/9f0f4ddfe72b4c06afafe1a658e6ee53d35b5760/lib/helpers/resolveConfig.js) | єдиний шлях до `buildURL` для адаптерів `xhr` і `fetch`; читає конфіг через `own()` | граф залежностей · прочитав L40–L50 |
| [AGENTS.md](https://github.com/VitaliySysak/axios/blob/9f0f4ddfe72b4c06afafe1a658e6ee53d35b5760/AGENTS.md) | власний гайд проєкту для людей і агентів: команди, межі архітектури, правила безпеки; одне твердження з парного `.github/copilot-instructions.md` суперечить коду (розділ 5, твердження 3) | прочитав повністю обидва файли; звірив з кодом |

Ранжування за частотою змін (вся історія): `README.md` 390, `package.json` 324, `package-lock.json` 223,
`lib/adapters/http.js` 218, `index.d.ts` 179, `CHANGELOG.md` 161, `dist/axios.js` 140, `lib/adapters/xhr.js` 139.
Лише `lib/`: `http.js` 215, `xhr.js` 137, `utils.js` 92, `env/data.js` 91, `axios.js` 79, `core/Axios.js` 65.

## 4. Карта залежностей модуля зміни

Модуль: `lib/helpers/buildURL.js`

Команди дослівно (Git Bash, у корені форка):

```
npx --yes dependency-cruiser@18.7.0 --no-config --focus "^lib/helpers/buildURL\.js$" --output-type text lib index.js
npx --yes dependency-cruiser@18.7.0 --no-config --reaches "^lib/helpers/buildURL\.js$" --output-type text lib index.js
npx --yes madge@8.0.0 --circular lib
npx --yes madge@8.0.0 --depends helpers/buildURL.js lib
```

Усі чотири — код 0. Звіти (у форку):
[depcruise-buildURL-focus.txt](https://github.com/VitaliySysak/axios/blob/f6ba3d5038c72093a330266440727d629660cc6a/lab4-evidence/depcruise-buildURL-focus.txt),
[depcruise-buildURL-reaches.txt](https://github.com/VitaliySysak/axios/blob/f6ba3d5038c72093a330266440727d629660cc6a/lab4-evidence/depcruise-buildURL-reaches.txt),
[madge-circular.txt](https://github.com/VitaliySysak/axios/blob/f6ba3d5038c72093a330266440727d629660cc6a/lab4-evidence/madge-circular.txt),
[madge-depends-buildURL.txt](https://github.com/VitaliySysak/axios/blob/f6ba3d5038c72093a330266440727d629660cc6a/lab4-evidence/madge-depends-buildURL.txt).

- імпортує: `lib/utils.js`, `lib/helpers/AxiosURLSearchParams.js`
- імпортується з: `lib/core/Axios.js` (`getUri`), `lib/helpers/resolveConfig.js` (адаптери `xhr`, `fetch`), `lib/adapters/http.js`; madge дає той самий перелік. Плюс зовнішній експорт `./unsafe/helpers/buildURL.js` у `package.json`
- хто досягає модуля транзитивно (`--reaches`): `index.js` → `lib/axios.js` → `lib/core/Axios.js` і `lib/adapters/adapters.js` → `fetch.js` / `http.js` / `xhr.js`, а також `dispatchRequest.js` і `assertValidRequestUrl.js`
- цикли: немає (`madge --circular lib`: «No circular dependency found!», 73 файли)

## 5. Як воно працює — три перевірені твердження

1. **`buildURL` відрізає фрагмент `#…` лише тоді, коли серіалізовані параметри непорожні, і додає їх через `?` або `&` залежно від того, чи є `?` в URL.** —
   [buildURL.js#L59-L66](https://github.com/VitaliySysak/axios/blob/9f0f4ddfe72b4c06afafe1a658e6ee53d35b5760/lib/helpers/buildURL.js#L59-L66), рання віддача без змін —
   [#L32-L34](https://github.com/VitaliySysak/axios/blob/9f0f4ddfe72b4c06afafe1a658e6ee53d35b5760/lib/helpers/buildURL.js#L32-L34) —
   перевірив: прочитав функцію і викликав її з форка (`node --input-type=module`, без змін коду): `buildURL('/a#h',{x:1})` → `/a?x=1`, `buildURL('/a#h',{})` → `/a#h`, `buildURL('/a#h',null)` → `/a#h`, `buildURL('/a?y=2',{x:'a b:c'})` → `/a?y=2&x=a+b:c`. Наявний тест `should correct discard url hash mark` покриває лише випадок із непорожніми параметрами.
2. **Помилку з `buildURL` у Node-адаптері перехоплено й перетворено на `AxiosError` з кодом `ERR_BAD_REQUEST`; у `getUri` такого перехоплення немає, і конфіг там читається напряму, не через own-property.** —
   [http.js#L1014-L1028](https://github.com/VitaliySysak/axios/blob/9f0f4ddfe72b4c06afafe1a658e6ee53d35b5760/lib/adapters/http.js#L1014-L1028),
   [Axios.js#L316-L323](https://github.com/VitaliySysak/axios/blob/9f0f4ddfe72b4c06afafe1a658e6ee53d35b5760/lib/core/Axios.js#L316-L323) —
   перевірив: прочитав обидва місця; у `http.js` параметри беруться через `own('params')`, у `getUri` — `config.params`. Нечисловий URL падає голим `TypeError`: `buildURL(123,{x:1})` → `TypeError url.indexOf is not a function`. Гіпотезу дав агент (питання 2), підтвердив сам.
3. **`runWhen` і `synchronous` діють лише для інтерсепторів запиту; цикл інтерсепторів відповіді їх не читає. `AGENTS.md` каже це правильно, а `.github/copilot-instructions.md` («Both support `synchronous: true` and `runWhen(config)`») — ні.** —
   [Axios.js#L223-L246](https://github.com/VitaliySysak/axios/blob/9f0f4ddfe72b4c06afafe1a658e6ee53d35b5760/lib/core/Axios.js#L223-L246) —
   перевірив: у циклі `request.forEach` (L225–L241) є перевірка `runWhen` і змінна `synchronousRequestInterceptors`, у `response.forEach` (L244–L246) — лише `push(fulfilled, rejected)`. Також з L235–L240: при `legacyInterceptorReqResOrdering` інтерсептор запиту йде на початок ланцюга (`unshift`, LIFO), інакше — в кінець (`push`).

Відкинуто як непідтверджене: нічого — усі три місця, які агент назвав у питанні 3 (`speedometer.js`, `throttle.js`,
`readBlob.js`), я відкрив і перевірив (розділ 6).

## 6. Зони ризику

Складність — ядро ESLint 10.13.0, окрема конфігурація у форку
([eslint.complexity.config.mjs](https://github.com/VitaliySysak/axios/blob/f6ba3d5038c72093a330266440727d629660cc6a/lab4-evidence/eslint.complexity.config.mjs)),
команда `npx --yes eslint@10.13.0 --no-config-lookup -c lab4-evidence/eslint.complexity.config.mjs lib` (код 0,
65 попереджень: 8 `complexity` > 20, 30 `max-lines-per-function` > 50, решта 27 — «Unused eslint-disable directive»,
бо моя конфігурація не вмикає правил, які вимикають коментарі проєкту),
[звіт](https://github.com/VitaliySysak/axios/blob/f6ba3d5038c72093a330266440727d629660cc6a/lab4-evidence/eslint-complexity.txt).
Дублювання — `npx --yes jscpd@5.4.2 --reporters console,json,markdown --output lab4-evidence/jscpd lib` (код 0):
56 JS-файлів, 9615 рядків, **1 клон, 6 рядків (0,06 %)** — у `estimateDataURLDecodedBytes.js`
([звіт](https://github.com/VitaliySysak/axios/blob/f6ba3d5038c72093a330266440727d629660cc6a/lab4-evidence/jscpd/jscpd-report.md)).
typescript-eslint не використовував: проєкт на JavaScript, а складність — правило ядра.

| зона | чим підтверджено | чому це ризик для зміни кроку 02 |
|---|---|---|
| `lib/adapters/fetch.js`, анонімна async-функція з L261 | complexity **134** | найскладніше місце проєкту; викликає `resolveConfig` → `buildURL`, тож зміна поведінки `buildURL` проходить крізь неї без власних перевірок |
| `lib/adapters/http.js`: `dispatchHttpRequest` (L674), `setProxy` (L357), `handleResponse` (L1280) | complexity **109**, **58**, 23 · 218 комітів | найчастіше змінюваний файл коду; зміна `buildURL` мусить зберегти перехоплення на L1014–L1028 |
| `lib/core/Axios.js`: `_request` (L128) | complexity 27 · 65 комітів | `getUri` поруч кличе `buildURL` без `try/catch` і без own-property читання (розділ 5, твердження 2) — будь-який новий виняток із `buildURL` вилетить звідси голим |
| `lib/helpers/resolveConfig.js` (L27) | complexity 23 | єдиний шлях `xhr`/`fetch` до `buildURL`; браузерні тести його покривають, а вони в мене не запускаються |
| `lib/helpers/speedometer.js` L10–L12 | `speedometer(-1)` → `RangeError: Invalid array length` (перевірив запуском); у `tests/` слова `speedometer` немає (`grep -rl speedometer tests` — 0 файлів) | не стосується `buildURL`, але показує, що хелпери без тестів тут існують — для кроку 01 не можна вважати «є 1800 тестів» доказом покриття конкретного модуля |
| середовище: Windows | CRLF ламає prettier; браузерні тести вимагають Playwright; `engines` не оголошено; `Select-Object -First N` у PowerShell обриває конвеєр і дає `$LASTEXITCODE = -1` при успішному `git blame` | зелене «у мене» ≠ зелене в CI: CI запускає браузерний проєкт і ще 8 версій Node |

Історія: масове переформатування `ef3711d1 feat: implement prettier and fix all issues (#7385)` (2026-02-14,
181 файл, 48 з них у `lib/`). У форку створено
[.git-blame-ignore-revs](https://github.com/VitaliySysak/axios/blob/f6ba3d5038c72093a330266440727d629660cc6a/.git-blame-ignore-revs)
з його повним SHA. Команда `git blame -w -C "-L40,69" --ignore-revs-file .git-blame-ignore-revs --date=short -- lib\helpers\buildURL.js`
(PowerShell, код 0). На `buildURL.js` це прибирає з авторства 14 з 69 рядків, які без файлу належали prettier-коміту.
Без `--follow` історія `buildURL.js` — 25 комітів, з `--follow` — 36: файл перейменовували з `lib/buildUrl.js`
на `lib/helpers/buildUrl.js` (`1b803fb2 Moving stuff to helpers/`), а потім на `buildURL.js`.

## 7. Три питання, на які я відповіді не знайшов

1. **Чи навмисно `getUri` читає `config.params` і `config.paramsSerializer` напряму, всупереч правилу own-property з `AGENTS.md`?** — де шукав: `AGENTS.md` (розділ Security-Sensitive Code), `git log --follow -- lib/core/Axios.js`, тести `tests/unit/core/` — що блокує: немає коментаря чи тесту, який фіксує цю поведінку як задуману; спитати нікого.
2. **Чи задумано, що фрагмент `#…` зберігається, коли параметри порожні (`{}`), і зникає, коли непорожні?** — де шукав: `tests/unit/helpers/buildURL.test.js` (лише випадок з непорожніми параметрами), коміт `81eaa3db Fixing building url with hash mark` з `git log --follow` — що блокує: коміт додав відрізання, але не каже, що робити з порожніми параметрами; для кроку 01 зафіксую поточну поведінку як є.
3. **Чи читає `toFormData` (його кличе `AxiosURLSearchParams`, куди `buildURL` передає весь `_options`) опції так само безпечно від забруднення прототипу, як сам `buildURL` через `utils.getSafeProp`?** — де шукав: `lib/helpers/buildURL.js` L43–L47, `lib/helpers/AxiosURLSearchParams.js` L38 — що блокує: `toFormData.js` (279 рядків) я ще не прочитав; агент теж прямо написав, що його не читав.

## 8. Перевірка одногрупником

Хто: — · дата: —
На чому спіткнувся: —
Що я після цього дописав: —

(Ще не виконано: одногрупник клонує форк і запускає проєкт лише за цим файлом.)
