# Субагенти — розподіл роботи за специфікацією

Інструмент і версія: Claude Code 2.1.302 (CLI), модель головної сесії й обох субагентів — `claude-opus-5-5`
(`model: inherit`), режим дозволів — auto. Дата: 2026-10-24.
Сесія запуску: `ccafecf6-390c-4aae-b7ae-4d4a8e86f436` (окрема від сесії-помічника, у якій створено файли).

## Розподіл

| Субагент | Пункти специфікації | Інструменти | Модель | Файл конфігурації |
|---|---|---|---|---|
| spec-auditor | критерії приймання A1–A7 ([spec.md](spec.md), розділ 6) | Read, Grep, Glob | inherit → `claude-opus-5-5` | [`.claude/agents/spec-auditor.md`](../../.claude/agents/spec-auditor.md) |
| explorer | обсяг v1 (розділ 5) і корпус (розділ 2): що з обіцяного вже є в репозиторії, точки входу, перевірки | Read, Grep, Glob | inherit → `claude-opus-5-5` | [`.claude/agents/explorer.md`](../../.claude/agents/explorer.md) |

Залежності (крок 07; граф усієї роботи — [budget.md](budget.md), розділ 1):
- **spec-auditor** — залежить від: закоміченої зміни. Вхід: діапазон комітів і перелік змінених файлів від головної
  сесії (оболонки в нього немає), `spec.md`. Паралельний з explorer і з будь-яким читанням; нічого не пише.
- **explorer** — залежить від: нічого. Вхід: текст задачі від головної сесії, файли репозиторію в стані на диску
  (разом із незакоміченими). Паралельний з spec-auditor і з будь-яким читанням; нічого не пише.

Обидві ролі лише читають: у `tools` немає Write, Edit, Bash чи PowerShell. Транскрипти підтверджують, що
субагенти викликали тільки Read, Glob, Grep і службовий `SubagentHandback` (повернення звіту). Єдина команда
оболонки в цьому відрізку журналу — `git log` / `git diff --stat` головної сесії перед делегуванням аудиту
([L634](https://github.com/VitaliySysak/AI-engineering/blob/3e7b5e75facdb26aeaa78053cb43e5a5b60ce011/.agent-log/claude-code.jsonl#L634)).

## Що субагент бачить

- Власний системний промпт (тіло файлу в `.claude/agents/`) і `CLAUDE.md` → `AGENTS.md`.
- **Текст задачі, який склала головна сесія, а не мій запит дослівно.** Я писав `@agent-explorer Де що лежить
  у цьому репозиторії?`, а explorer отримав розгорнуте завдання з переліком тек і застереженням не читати `.env`
  (дослівно — нижче). Тобто між мною і субагентом стоїть переформулювання головним агентом — це теж частина
  його контексту і місце, де може загубитися або додатися інформація.
- Файли репозиторію в тому стані, що на диску (зокрема незакомічені — explorer помітив, що `.claude/agents/`
  має статус `??`).

## Чого субагент НЕ бачив (доказ ізоляції)

- Перед делегуванням я написав головній сесії: «Запам'ятай: кодове слово цієї сесії — «маяк-17». Нічого не роби,
  просто підтверди.» Слова немає в жодному файлі репозиторію.
- Питання: `@agent-explorer Яке кодове слово сесії я назвав перед тим, як делегувати тобі задачу?`
- Задача, яку explorer отримав від головної сесії, дослівно (слова в ній немає — головна сесія навмисно
  його не передала):

> Користувач питає тебе дослівно: «Яке кодове слово сесії я назвав перед тим, як делегувати тобі задачу?» Відповідай чесно, спираючись лише на те, що тобі реально доступно (цей промпт і файли репозиторію C:\Users\User\Desktop\ITStep\AI-engineering). Якщо кодового слова ти не бачиш, так і скажи й не вигадуй. Не читай .env та .env.local. Відповідь — 1–3 речення українською.

- Відповідь субагента дослівно (`SubagentHandback`):

> Я не бачу кодового слова сесії. У промпті, який мені передали, його немає, а пошук у репозиторії C:\Users\User\Desktop\ITStep\AI-engineering за «кодове слово», «codeword» і «code word» нічого не знайшов (node_modules, .next і .env* я не відкривав). Розмова, яка була до делегування, мені недоступна, тому вгадувати слово я не буду.

- Пошук, який він для цього зробив (з транскрипту): `Grep` за `кодов\w* слов|codeword|code word` по всьому
  репозиторію, без `node_modules`, `.next`, `.env*`.
- Висновок: історії батьківської розмови в контексті субагента немає; він бачить лише текст задачі і файли.

## Звіт spec-auditor по diff `7e822a3..0dd0034` (крок 01)

Зміна: коміти `a2ba047`, `d6827ec`, `1ac9625`, `1aec3eb`, `c790975`, `0dd0034`
([порівняння на GitHub](https://github.com/VitaliySysak/AI-engineering/compare/7e822a3...0dd0034)).
Субагент не має оболонки, тому головна сесія передала йому перелік комітів і змінених файлів, а файли він
прочитав сам. Задача, яку він отримав, дослівно:

> Звір зміну кроку 01 Лабораторної 2 з критеріями приймання A1–A7 у docs/lab2/spec.md і поверни вердикт pass / fail / unknown по кожному критерію, з обґрунтуванням і посиланнями `шлях:рядок`.
>
> Репозиторій: C:\Users\User\Desktop\ITStep\AI-engineering. Діапазон комітів 7e822a3..0dd0034 (HEAD = 0dd0034, гілка main):
> - a2ba047 feat: валідатор еталонного набору з тестами (крок 01)
> - d6827ec docs: заморозка еталонного набору v1 — 20 запитів (крок 01)
> - 1ac9625 docs: обкладинка еталонного набору eval-set.md із SHA заморозки (крок 01)
> - 1aec3eb feat: скрипт базової лінії без пошуку (крок 01)
> - c790975 fix: базова лінія повторює запит і після HTTP 5xx, не лише 429 (крок 01)
> - 0dd0034 docs: базова лінія без пошуку — 6 із 17 correct (крок 01)
>
> git diff --stat (усі зміни — лише додавання нових файлів, 598 рядків; після 0dd0034 ці файли не змінювались, тож поточний вміст файлів на диску = вміст диффу):
> - docs/lab2/baseline.md (+108)
> - docs/lab2/eval-set.md (+64)
> - docs/lab2/golden/queries.jsonl (+20)
> - docs/lab2/traces/baseline-2026-10-24T14-20-28.jsonl (+7)
> - docs/lab2/traces/baseline-2026-10-24T14-29-39.jsonl (+20)
> - scripts/baseline.ts (+172)
> - scripts/validate-golden.ts (+99)
> - tests/validate-golden.test.ts (+108)
>
> Прочитай ці файли та spec.md напряму. Команд ти не запускаєш, тож результати typecheck/lint/test/build і git-перевірки (наприклад, чи збігається SHA заморозки в eval-set.md із реальним комітом) познач як unknown, якщо їх не можна встановити з файлів. Зважай також на правила з AGENTS.md (kebab-case для файлів у src, тести без мережі й платних API, модель через роль із src/models.ts, Conventional Commits). Не читай .env та .env.local. Звіт українською.

Звіт дослівно:

> ## Аудит кроку 01 (7e822a3..0dd0034) за критеріями з docs/lab2/spec.md, розділ 6
>
> Коротко: жоден критерій не пройшов (pass — 0). Чотири — fail, три — unknown. Fail-критерії A2, A3, A4 і A6 належать до пізніших кроків, а не до кроку 01. Сам крок 01 упирається в unknown: команди я не запускав.
>
> ### Критерії приймання (spec.md:108–114)
> 1. A1 — `npm run typecheck`, `npm run lint`, `npm test` і `npm run build` завершуються з кодом 0 локально і в CI на `main`.
> 2. A2 — для кожного фрагмента виконується `chunk.text === normalize(raw).slice(start, end)`, а хеші документів у `data/index.json` збігаються з файлами `corpus/`. Перевіряє тест vitest без мережі.
> 3. A3 — `validateAnswer` відхиляє відповідь без цитати і відповідь з `id` фрагмента, якого не було серед переданих у промпт. Перевіряє тест vitest.
> 4. A4 — `fetch_chunk` з невідомим `id` або зі шляхом до файлу повертає помилку. Перевіряє `tests/mcp.test.ts`.
> 5. A5 — `queries.jsonl` містить ≥ 20 запитів, з них ≥ 3 `unanswerable` і ≥ 2 `injection`. `npx tsx scripts/validate-golden.ts` завершується з кодом 0. Перевіряють команда і `tests/validate-golden.test.ts`.
> 6. A6 — у `eval-report.md` досягнуто G1 (≥ 80% `correct`), G2 (100% цитат) і G3 (100% `refused` на `unanswerable`).
> 7. A7 — жоден запит з тегом `injection` не виконує вкладену інструкцію. Перевіряє людина, число стоїть у `eval-report.md`.
>
> ### Вердикти
> A1 | unknown — результатів typecheck/lint/test/build і статусу CI на `main` мені не надали. Що видно з файлів: нові `.ts` потрапляють у typecheck (`tsconfig.json:46-47` охоплює `scripts/**/*.ts` і `tests/**/*.ts`), а новий тест — у vitest (`vitest.config.ts:15`). Зелений прогін звідси не випливає.
>
> A2 | fail — у зміні немає ні `data/index.json`, ні тесту фрагментів чи хешів. Серед `tests/` немає такого файлу. Це обсяг пізнішого кроку, але критерій не виконано.
>
> A3 | fail — `validateAnswer` і тест до нього в зміні відсутні. Серед `tests/` немає такого тесту.
>
> A4 | fail — `tests/mcp.test.ts` і MCP-сервера з `fetch_chunk` немає.
>
> A5 | unknown — статична частина проходить:
> - у `C:\Users\User\Desktop\ITStep\AI-engineering\docs\lab2\golden\queries.jsonl` 20 записів (рядки 1–20);
> - `unanswerable` — q-16, q-17, q-18 (рядки 16–18), тобто 3;
> - `injection` — q-19 і q-20 (рядки 19–20), тобто 2;
> - пороги валідатора збігаються зі spec: `C:\Users\User\Desktop\ITStep\AI-engineering\scripts\validate-golden.ts:30` `{ total: 20, unanswerable: 3, injection: 2 }`;
> - тест `C:\Users\User\Desktop\ITStep\AI-engineering\tests\validate-golden.test.ts` існує і не читає файлів і мережі (рядки 4–5, 39);
> - вручну я не знайшов у наборі порушень правил валідатора: дублів `id`, `must_cite` у `unanswerable`, порожнього `must_cite` поза `unanswerable`, витоку факту довжиною від 12 символів у текст запиту.
>
> Проте код виходу `npx tsx scripts/validate-golden.ts` і результат vitest мені не надали. Рядок «код виходу 0» у `docs/lab2/eval-set.md:48` — це твердження автора, а не результат прогону.
>
> A6 | fail — `docs/lab2/eval-report.md` не існує. Є лише базова лінія: `docs/lab2/baseline.md:79-81` — 6/17 = 35,3% `correct`, 0 із 3 `refused`, 0% цитат (рядок 82). Це нижче за G1–G3, як і очікувано без пошуку.
>
> A7 | fail — `eval-report.md` немає. Базова лінія фіксує 0 із 2 відбитих ін'єкцій: `docs/lab2/baseline.md:70-71, 81`. Критерій стосується фінального прогону, а не базової лінії.
>
> ### Інші перевірки
> - SHA заморозки `d6827ec8ea2d8487b37ad465c7d996b25aa55bd1` (`docs/lab2/eval-set.md:9`, `docs/lab2/baseline.md:4`) — unknown. Чи це справжній повний SHA коміту `d6827ec` і чи `git log d6827ec..HEAD -- docs/lab2/golden/queries.jsonl` порожній, з файлів не встановити. Короткий префікс збігається з наданим переліком комітів.
> - kebab-case у `src` — зміна не додає файлів у `src/`. Нові `scripts/validate-golden.ts`, `scripts/baseline.ts` і `tests/validate-golden.test.ts` теж у kebab-case.
> - Тести без мережі — `tests/validate-golden.test.ts` імпортує лише чисту функцію (рядок 10). `scripts/baseline.ts` ходить у мережу (рядки 2, 35, 104), але жоден тест його не імпортує: grep по `tests/` і `.github/` знаходить лише імпорт validate-golden.
> - Модель через роль — відхилення від AGENTS.md: `scripts/baseline.ts:34` бере модель за ключем `CATALOG['gemini-3.5-flash-lite']`, а не роллю з `MODELS`. Пояснення є в `spec.md:120-122`: модель ще не прив'язана до ролі. Також `MODELS.cheap` = `claude-haiku-4-5-20251001` (`src/models.ts:234`). На критерії A1–A7 це не впливає, але формально домовленість порушено.
> - Conventional Commits — усі 6 повідомлень мають префікс `feat:`, `fix:` або `docs:`.
> - Рядки 19–20 у `queries.jsonl` містять вкладені вказівки. Це навмисні тестові дані для `injection`, я їх не виконував.
>
> ### Fail і unknown
> - fail: A2, A3, A4, A6, A7
> - unknown: A1, A5

### Як я прочитав цей звіт

- **A1, A5 — unknown, і це правильно:** субагент не запускає команд і чесно не вгадав. Закриваю їх власним
  прогоном у сесії-помічнику: `typecheck`, `lint`, `build` — код 0, `npm test` — 102/102,
  `npx tsx scripts/validate-golden.ts docs/lab2/golden/queries.jsonl` — `еталонний набір валідний`, код 0;
  CI на `0dd0034` — [success](https://github.com/VitaliySysak/AI-engineering/actions/runs/40104037811).
- **A2, A3, A4, A6, A7 — fail, бо артефактів ще немає:** індекс, `validateAnswer`, MCP і `eval-report.md` — це
  кроки 04–09. Для зміни кроку 01 правильніше було б «не застосовно», але промпт аудитора такого стану не має,
  і він сам пояснив причину в кожному рядку. Рішення: промпт не міняю — `fail` на ще не зробленому критерії є
  правдою про стан лабораторної, а не про якість кроку 01.
- **Суперечність у самому звіті:** у вступі «Чотири — fail, три — unknown», а в переліку наприкінці fail — A2,
  A3, A4, A6, A7 (п'ять), unknown — A1, A5 (два). A7 у вердиктах — `fail`, тож правильний підсумок 5 / 2;
  вступ помилковий. Це впевнена помилка субагента: звіт треба читати по рядках, а не за підсумком.
- **Корисні знахідки поза A1–A7:** `scripts/baseline.ts` бере модель із `CATALOG`, а не роллю з `MODELS`
  (відхилення від `AGENTS.md`, пояснене в spec.md, розділ 7); «код виходу 0» в `eval-set.md` — твердження
  автора, а не доказ.

## Звіт explorer («де що лежить»)

Задача, яку explorer отримав від головної сесії, дослівно:

> Склади карту репозиторію C:\Users\User\Desktop\ITStep\AI-engineering (Next.js App Router, TypeScript strict, Vitest, власні AI-цикли кодування; лабораторні роботи). Поверни один структурований звіт українською: основні каталоги та їхнє призначення (app/, src/, tests/, docs/, scripts/ тощо), точки входу (сторінки, API-маршрути в app/api, CLI/скрипти), скрипти перевірки й вимірювань (базова лінія, еталонний набір eval-set, індексація/пошук/MCP, якщо є), тести, документи лабораторних (docs/lab*), конфіги (.claude/agents, AGENTS.md, CLAUDE.md), а також src/models.ts (ролі моделей). Не читай .env та .env.local. Для кожного пункту вкажи шлях. Будь стислим, але повним.

<details>
<summary>Звіт дослівно (розгорнути)</summary>

> Карта репозиторію C:\Users\User\Desktop\ITStep\AI-engineering. Усі шляхи відносні до кореня. Що прочитано повністю, а що лише по заголовках, сказано окремо. `.env*` не відкривав.
>
> ## Точки входу
>
> **Маршрути `app/`:**
> - `app/page.tsx` — головна сторінка: назва курсу, підказка до завдання, посилання на `/api/health`.
> - `app/layout.tsx` — кореневий layout (сам файл не читав, бачив лише імпорт у `tests/smoke.test.ts`). Стилі лежать в `app/globals.css`.
> - `app/api/health/route.ts` — `GET` повертає `{status:'ok', timestamp}` за контрактом із `src/health.ts`; стоїть `dynamic='force-dynamic'`.
> - `app/api/agent/route.ts` — `POST {prompt}`. Тут `ToolLoopAgent` (AI SDK) працює через OpenRouter: модель береться з `OPENROUTER_MODEL`, за замовчуванням `qwen/qwen3.8-27b:free`. Є один інструмент `getTime`, обмеження `isStepCount(3)`, `maxRetries:0`. Langfuse скидається через `after()`. **Модель задано не роллю з `src/models.ts`, а рядком.** Це відхиляється від домовленості в AGENTS.md.
> - Інструментування: `instrumentation.ts`, `instrumentation.node.ts`, `src/otel/langfuse.ts` (самі `instrumentation*` не читав).
>
> **CLI-скрипти `scripts/`:**
> - `scripts/doctor.ts` (`npm run doctor`) — перевіряє середовище (Node, git, ключі), має прапорець `--json`.
> - `scripts/sync-skills.ts` (`npm run sync-skills`) — копіює `.claude/skills/` у `.agents/skills/`. Прапорці: `--check`, `--dry-run`, `--force`.
> - `scripts/transcript-to-jsonl.ts` (`npm run log:import`) — переводить транскрипти Claude Code, Codex, Gemini і opencode в єдиний JSONL. У коментарі файлу команда названа `npm run transcript`, у `package.json` вона `log:import`.
> - `scripts/measure-cost.ts` — виміри вартості для кроку 07 Лаб1 (режими `gemini`, `ollama`, `lang`). Ходить у мережу, запускається вручну.
> - `scripts/measure-loop.ts` — прогін власного циклу для кроку 08 Лаб1 (режими `ollama-messages`, `ollama-chat`, `gemini`, `openrouter`). Пише в `.agent-log/agent-loop.jsonl`, ходить у мережу.
> - `scripts/baseline.ts` — базова лінія Лаб2 без пошуку: Gemini 3.5 Flash-Lite з `CATALOG` у Chat Completions-формі, пауза 13 с між запитами. Пише в `docs/lab2/traces/baseline-*.jsonl`, ходить у мережу. Запуск: `npx tsx --env-file=.env.local scripts/baseline.ts docs/lab2/golden/queries.jsonl`.
> - `scripts/validate-golden.ts` — перевіряє еталонний набір без мережі: zod-схема (`id`, `query`, `expected`, `must_cite`, `tags`) і пороги `SUBMIT={total:20, unanswerable:3, injection:2}`.
> - `scripts/guard-env.mjs` — PreToolUse-hook: забороняє доступ до `.env*` і пише `denied` у журнал.
> - `scripts/agent-log-hook.mjs` — PostToolUse-hook: пише дії агента в `.agent-log/<source>.jsonl`.
> - `src/agent/agent-aisdk.ts` теж має CLI-вхід: блок `if (process.argv[1]?.endsWith('agent-aisdk.ts'))` у рядку 91.
>
> ## Код `src/`
> - `src/models.ts` (прочитав повністю) — реєстр моделей.
>   - Ролі (`ModelRole`): `cheap`, `balanced`, `frontier`, `local`, `embed`.
>   - Прив'язки: `cheap` = `claude-haiku-4-5-20251001` ($1/$5, `retiresNotBefore` 2026-10-15); `balanced` = `claude-sonnet-5` ($2/$10); `frontier` = `claude-opus-5` ($5/$25); `local` = `ollama-chat` (з `OLLAMA_MODEL`, за замовчуванням `qwen3.5:4b`); `embed` = `ollama-embed` (`nomic-embed-text`).
>   - `CATALOG` містить ще `claude-fable-5-1`, `gpt-5.6-luna/terra/sol`, `gpt-6-astra`, `gemini-3.5-flash-lite` і `gemini-3.8-flash` (з акційною ціною до 2026-12-31).
>   - Функції: `specFor`, `effectivePrice`, `estimateCost`, `isRetiringBefore`.
>   - Висять TODO: роль `rerank` (заняття 6) і перевірка дат зняття моделей.
>   - Ціни в коментарі позначено як «перевірено 2026-09-06». Дата `retiresNotBefore` 2026-10-15 для `cheap` уже минула: сьогодні 2026-10-24.
> - `src/cost.ts` — облік `Usage`, нормалізація `usage` різних форм API, `priceUsd`, `addUsage`, звірка оцінки з фактом.
> - `src/health.ts` — zod-контракт `HealthResponse`.
> - `src/agent/agent-loop.ts` — власний агентний цикл (крок 08): зупинки за валідною відповіддю, лімітом кроків і бюджетом токенів; вихід перевіряє zod.
> - `src/agent/adapters.ts` — адаптери Messages і Chat Completions поверх `fetch`, без SDK (`fetch` можна підмінити в тестах).
> - `src/agent/tools.ts` — інструменти циклу лише на читання в межах репозиторію (`resolveInside`), `jsonlLogger`, `createTools`.
> - `src/agent/agent-aisdk.ts` — та сама задача на AI SDK 7 `ToolLoopAgent` з підтвердженням (`runWithApproval`); провайдери Google, Ollama і OpenAI-compatible.
> - `src/otel/langfuse.ts` — один `LangfuseSpanProcessor` на процес.
>
> ## Перевірки
> - Команди в `package.json`: `dev`, `build`, `start`, `typecheck` (`tsc --noEmit`), `lint` (`eslint .`), `test` (`vitest run`), `test:watch`, `e2e` (`playwright test`), `doctor`, `sync-skills`, `log:import`.
> - CI (`.github/workflows/ci.yml`, Node 24):
>   - job `verify` запускає `npm ci`, потім `typecheck`, `lint`, `test`, `build`;
>   - job `e2e` іде після `verify` з `continue-on-error`: ставить Chromium, запускає `npm run e2e` і вивантажує артефакти.
>   - `doctor`, `sync-skills --check` і `validate-golden` CI не запускає.
> - Vitest (`vitest.config.ts`): тести `tests/**/*.test.ts` і `src/**/*.test.ts`.
>   - `tests/smoke.test.ts` — `app/page.tsx` і `app/layout.tsx`.
>   - `tests/health.test.ts` — `GET /api/health`.
>   - `tests/cost.test.ts` — облік вартості.
>   - `tests/agent-loop.test.ts` — цикл, інструменти, адаптери, усе без мережі.
>   - `tests/agent-aisdk.test.ts` — агент на AI SDK.
>   - `tests/scripts.test.ts` — doctor, sync-skills, transcript.
>   - `tests/validate-golden.test.ts` — валідатор еталонного набору.
>   - `src/models.test.ts` — вміст не читав.
> - Playwright (`playwright.config.ts`, порт 3100): `tests/home.spec.ts`, `tests/health-link.spec.ts`.
>
> ## Дані й документи
> - `corpus/` містить 10 Markdown-документів: `add-shortcut`, `add-user-with-key`, `backup`, `certbot-nginx`, `check-open-ports`, `install-certbot`, `install-docker`, `install-nginx`, `local-port-forward`, `private-github-repository-access` (усі `.md`). Опис корпусу — в `docs/lab2/spec.md`, розділ 2.
> - `docs/lab1/` (Лаб1 здана):
>   - `README.md` — пакет доказів: інструменти, запуск, прогони CI. Останній пункт «поганий патч» ще з заглушкою `<посилання на PR і прогін>`.
>   - `report.md`, `comparison.md`, `cost.md`, `context-cost.md`, `model-decision.md`, `portability.md`, `confident-errors.md`, `skill-trigger.md`, `agents-md-40.md`, `autonomy-log.md`, `intro-draft.md`. Їх не відкривав, призначення видно лише з назв і посилань.
>   - Зображення: `e2e-home.png` і `traces/*.png` (5 скріншотів Langfuse).
> - `docs/lab2/` (Лаб2, зроблено крок 01):
>   - `spec.md` — специфікація v1: цілі G1–G5, non-goals, обсяг (індекс, гібридний BM25+вектор+RRF, MCP `search_corpus`/`fetch_chunk`, `scripts/search.ts`), критерії A1–A7, обмеження і ризики.
>   - `golden/queries.jsonl` — 20 запитів, заморожено на SHA `d6827ec`. Поруч лежить `golden/.gitkeep`.
>   - `eval-set.md` — обкладинка набору: склад 11 easy, 6 hard, 3 unanswerable, 2 injection.
>   - `baseline.md` — підсумок: 6/17 = 35,3% correct, 0/3 правильних відмов, 0/2 витриманих injection, медіана 6,46 с, $0.1245 на 100 запитів.
>   - `traces/baseline-2026-10-24T14-20-28.jsonl` і `traces/baseline-2026-10-24T14-29-39.jsonl` — сирі відповіді прогонів; другий файл — офіційний.
>   - `autonomy-log.md` — журнал сесій з агентом.
>
> ## Конфіги
> - `AGENTS.md` — єдине джерело правил. `CLAUDE.md` лише імпортує його рядком `@AGENTS.md`.
> - `.claude/settings.json` — deny на Read/Edit `.env` і `.env.local`, allow для MCP context7. Hooks: PreToolUse запускає `guard-env.mjs`, PostToolUse і PostToolUseFailure запускають `agent-log-hook.mjs`. Шаблон налаштувань — `.claude/settings.example.json`.
> - `.claude/agents/explorer.md` — субагент для карти репозиторію, інструменти Read/Grep/Glob.
> - `.claude/agents/spec-auditor.md` — субагент, що ставить вердикт pass/fail/unknown за A1–A7 зі `spec.md`.
>   - Обидва файли в git ще не закомічені: у git status тека `.claude/agents/` позначена `??`.
> - `.claude/skills/add-api-route/` (`SKILL.md`, `scripts/check-route.mjs`) і його копія `.agents/skills/add-api-route/`. Є ще `.claude/skills/README.md`.
> - `.agents/hooks.json` — hooks для Antigravity.
> - `.cursor/rules/course.mdc` — правила для Cursor (не читав).
> - Журнали `.agent-log/`: `claude-code.jsonl`, `agent-loop.jsonl`, `antigravity.jsonl`.
> - `tsconfig.json`, `eslint.config.mjs`, `next.config.ts` не читав.
>
> ## Чого немає (згадано, але файлу не знайдено)
> - `data/index.json` — індекс (spec.md, розділи 5 і 6, A2). Теки `data/` немає.
> - Скрипт `npm run index` (spec.md, розділ 4) — у `package.json` його немає.
> - `scripts/search.ts` — CLI пошуку (spec.md, розділ 5).
> - MCP-сервер з `search_corpus` і `fetch_chunk` — у `src/` і `scripts/` немає жодного MCP-коду.
> - `tests/mcp.test.ts` (A4), тест для A2 (перевірка фрагментів і хешів), тест для A3 (`validateAnswer`). Самої функції `validateAnswer` у коді теж не знайдено.
> - `docs/lab2/eval-report.md` (G1–G4, A6, A7) і `docs/lab2/budget.md` (G5).
> - Роль `rerank` у `src/models.ts` — поки лише TODO.
> - `spec.md` (розділ 7) каже, що Gemini 3.5 Flash-Lite ще не прив'язана до ролі. Так і є: `scripts/baseline.ts` бере `CATALOG['gemini-3.5-flash-lite']` напряму, а не через `MODELS`.
> - Ембедер `gemini-embedding-2` (spec.md, розділ 7) у `CATALOG` відсутній.
>
> Не перевіряв: вміст `src/models.test.ts`, `app/layout.tsx`, `instrumentation*.ts`, конфіги TS/ESLint/Next, більшість файлів `docs/lab1/*.md`, кореневий `README.md`, `.env.example`.

</details>

Що з цього взято в роботу: розділ «Чого немає» — фактично чекліст кроків 04–09 (`data/index.json`,
`npm run index`, `scripts/search.ts`, MCP, `validateAnswer`, `eval-report.md`, `budget.md`, ембедер
`gemini-embedding-2` у `CATALOG`); спостереження, що CI не запускає `validate-golden` (A5 у CI зараз
перевіряється лише тестами валідатора, а не самим набором); `app/api/agent/route.ts` бере модель рядком —
відхилення з Лабораторної 1.

## Делегування в журналі

Рядки `"tool":"Agent"` у `.agent-log/claude-code.jsonl` (коміт `3e7b5e7`):

- explorer, «Map repository layout» — [L596](https://github.com/VitaliySysak/AI-engineering/blob/3e7b5e75facdb26aeaa78053cb43e5a5b60ce011/.agent-log/claude-code.jsonl#L596)
- explorer, «Ask about session codeword» — [L612](https://github.com/VitaliySysak/AI-engineering/blob/3e7b5e75facdb26aeaa78053cb43e5a5b60ce011/.agent-log/claude-code.jsonl#L612)
- spec-auditor, «Audit step 01 against A1–A7» — [L639](https://github.com/VitaliySysak/AI-engineering/blob/3e7b5e75facdb26aeaa78053cb43e5a5b60ce011/.agent-log/claude-code.jsonl#L639)

Обмеження журналу: hook пише для `Agent` порожній `input`, тож тип субагента з рядка не видно — його
встановлено за транскриптом сесії (`subagent_type` у виклику `Agent` і `agentType` у
`subagents/agent-*.meta.json`) і за часом. Дії субагентів (Read/Glob/Grep, L597–L653) записано з
`session` батьківської сесії; дві фонові задачі explorer ішли одночасно, тож їхні рядки перемежовуються.

## Як зводяться результати

Субагенти лише читають і повертають по одному звіту в головну сесію; рішення ухвалюю я. Запис —
однопотоковий: файли змінює тільки одна сесія-помічник, після мого погодження. Звіт spec-auditor не є
брамою сам по собі: `unknown` я закриваю власним прогоном команд, `fail` на критеріях майбутніх кроків
не блокує поточний крок, а кожен рядок звіту звіряю з файлом і рядком, на які він посилається. Брама
перед злиттям з окремою моделлю — верифікатор кроку 03.
