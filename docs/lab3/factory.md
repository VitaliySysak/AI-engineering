# Фабрика задач

- Дата: 2026-11-06 · репозиторій: https://github.com/VitaliySysak/AI-engineering
- Шлях агента: **Claude Code**, версія 2.1.302 (`claude.exe` з WinGet), модель `haiku` → `claude-haiku-5-5`
  (поле `modelUsage` у виводі прогону)
- Чому саме цей: підписка Claude Pro у мене вже є, Ollama й Gemini CLI на машині не встановлені. Лише Claude Code має
  задокументовані бюджетні прапорці (`--max-turns`, `--max-budget-usd`) і режим `dontAsk`. **Це не шлях за $0**: прогони
  витрачають ліміти підписки, грошей не списано; `total_cost_usd` — клієнтська оцінка. Haiku — бо задачі дрібні й
  однакової форми, а фабрика ганятиме їх багато разів. Верифікатор кроку 02 — Gemini, тобто інша родина
- Режим дозволів: `--permission-mode dontAsk` + явний `--allowedTools` (рішення автора 2026-11-06):
  `Read,Glob,Grep,Edit(<файл задачі>),Write(<файл задачі>)…,Bash(npm test *),Bash(npm run typecheck),Bash(npm run lint),Bash(npx tsx scripts/validate-golden.ts *),Bash(git diff *),Bash(git status *)`;
  набір доступних інструментів обмежено `--tools Read,Glob,Grep,Edit,Write,Bash`. Обходу дозволів немає (тест
  `tests/harness/run-task.test.ts` перевіряє, що `--dangerously-skip-permissions` і `bypassPermissions` не передаються)
- Ізоляція: **git worktree** на кожну задачу, команда дослівно:
  `git worktree add -B harness/<id> ../harness-runs/<id> main`; `node_modules` — junction на основний checkout
  (без копіювання й мережі), знімається **перед** `git worktree remove ../harness-runs/<id> --force`

## 1. Форма задачі
| Поле | Тип | Що означає |
|---|---|---|
| `id` | рядок | `t-01` … — ім'я теки прогону, гілки `harness/<id>` і рядка журналу; не змінюється |
| `input` | рядок | завдання агентові дослівно, одним абзацом: що змінити, в яких файлах, коли готово |
| `acceptance` | масив команд | мають завершитися кодом 0 у дереві прогону після роботи агента; виконує **виконавець**, а не агент |
| `budget` | об'єкт | `max_turns` 12, `max_usd` 0.3, `timeout_s` 600 — однаково для всіх задач, заморожено 2026-11-06 |
| `files` | масив | файли задачі — з них складаються дозволи `Edit(<файл>)` і `Write(<файл>)` |

Черга: [`tasks.jsonl`](tasks.jsonl), задач **7** (`t-01` `Refusal.name`; `t-02` `citedIds` без дублікатів; `t-03`
валідатор — повторений `query`; `t-04` тест `tokenize`; `t-05` тест `rrf`; `t-06` тест `proportionCI95`; `t-07` винести
`sleep` у `src/sleep.ts`). Задачі `scripts/baseline.ts` / `eval-run.ts` свідомо не чіпають: вони мають лишатися
побайтовими копіями (методика Лабораторної 2).

## 2. Виклик агента
Дослівно, як його запускає `claudeRunner` у [`scripts/harness/run-task.ts`](../../scripts/harness/run-task.ts) (без
оболонки — `claude.exe` нативний, і оболонка розбила б `input` з пробілами на окремі аргументи):

```
claude -p "<input задачі>" --output-format json --model haiku
  --tools Read,Glob,Grep,Edit,Write,Bash
  --allowedTools "Read,Glob,Grep,Edit(<файл>),Write(<файл>),…,Bash(npm test *),Bash(npm run typecheck),Bash(npm run lint),Bash(npx tsx scripts/validate-golden.ts *),Bash(git diff *),Bash(git status *)"
  --permission-mode dontAsk --strict-mcp-config --max-turns 12 --max-budget-usd 0.3
```

Прапорці звірено з `claude --help` 2.1.302 і https://code.claude.com/docs/en/cli-reference (2026-11-06); `--max-turns`
у `--help` не виводиться, але задокументований. `--strict-mcp-config` — бо в корені лежить `.mcp.json` Лабораторної 2,
і в режимі `-p` Claude Code підняв би наш MCP-сервер `lab2-corpus` без запиту. Таймаут задачі тримає сам процес
(`spawnSync … timeout`, `killSignal: 'SIGINT'`).

## 3. Де лежать артефакти
`runs/<id>-<мітка часу мс>/` (поза git, `/runs/` у `.gitignore`) — `patch.diff`, `output.txt`, `agent.log`, `run.json`
і `agent-actions.jsonl`. Що йде в репозиторій: [`docs/lab3/runs/`](runs/) — **копія кожного прогону** через
`run-queue.ts`; `run.json` копії вказує на саму копію (`artifact_dir`), сирий шлях — у `raw_artifact_dir`.

- `patch.diff` — `git add -A` (без `.agent-log/`) + `git diff --cached`, тож нові файли теж видно
- `output.txt` — stdout агента (JSON результату Claude Code), `agent.log` — stderr
- `agent-actions.jsonl` — рядки, які наш hook журналу (Лабораторна 1) дописав у `.agent-log/` дерева прогону: кожен
  виклик інструмента агента; з `patch.diff` їх виключено, бо це не зміна задачі

| Прогін | Задача | Статус | acceptance | Час | Ходів | Вхід / вихід, токенів | Відхилено dontAsk | Оцінка, $ |
|---|---|---|---|---|---|---|---|---|
| [`t-01-1793976698248`](runs/t-01-1793976698248/run.json) | `Refusal.name` | ok · success | pass | 22,4 с | 9 | 10* / 2 670 | —* (в `output.txt`: 1) | 0.0056 |
| [`t-04-1793976720874`](runs/t-04-1793976720874/run.json) | тест `tokenize` | ok · success | pass | 23,7 с | 10 | 14* / 2 943 | —* (в `output.txt`: 1) | 0.0047 |
| [`t-02-1793976881384`](runs/t-02-1793976881384/run.json) | `citedIds` | ok · success | pass | 25,5 с | 11 | 110 484 / 3 541 | 1 | 0.0051 |
| [`t-05-1793976891405`](runs/t-05-1793976891405/run.json) | тест `rrf` | ok · success | pass | 35,7 с | 10 | 124 974 / 4 351 | 1 | 0.0051 |

\* Перші два прогони — на першій версії виконавця (`2dec706`): там `input_tokens` = лише `usage.input_tokens`
(некешований хвіст), лічильника відхилень не було, а `artifact_dir` копії вказував на сиру `runs/`. Виправлено в
`00dd8d3`; ці два журнали **не редагувались**, нові числа — у прогонах `t-02`, `t-05`. Повний вхід `t-01`, порахований
з його ж `output.txt`: 10 + 56 063 (з кешу) + 18 357 (запис у кеш) = 74 430. `t-02` і `t-05` автор запустив
паралельно у двох терміналах (часи перекриваються) — окремі дерева це дозволяють.

## 4. Журнал прогону
| поле | звідки значення |
|---|---|
| `task_id` | з черги |
| `agent_path`, `model` | виконавець (`claude-code -p`, `haiku`) |
| `artifact_dir` | шлях цієї ж теки від кореня репозиторію — зв'язок журналу з артефактом; `raw_artifact_dir` — сира тека |
| `started_at` / `ended_at` / `duration_s` | виконавець, навколо виклику агента й acceptance |
| `exit_status`, `exit_code` | `timeout`, якщо процес убив таймаут; інакше `ok` при коді 0, `agent_failed` — при ненульовому |
| `result_subtype` | поле `subtype` JSON (`success`; вичерпаний бюджет розпізнаватимемо за ним на кроці 03) |
| `num_turns` | поле `num_turns` |
| `session_id` | поле `session_id` — за ним прогін знаходиться в логах і продовжується `--resume` |
| `input_tokens` | `usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens` (повний вхід) |
| `cache_read_tokens` | `usage.cache_read_input_tokens` |
| `output_tokens` | `usage.output_tokens` |
| `permission_denials` | довжина масиву `permission_denials` |
| `cost_usd_estimate` | `total_cost_usd` — **клієнтська оцінка Claude Code, не рахунок** (за підпискою грошей не списано) |
| `acceptance`, `acceptance_passed` | виконавець запускає кожну команду в дереві; «пройдено» — лише якщо всі коди 0 і перелік непорожній |
| `trace_id` | `null` до кроку 06 |
| `gates` | `{}` до кроку 01 |

## 5. Як перезапустити одну задачу
```
npx tsx scripts/harness/run-queue.ts docs/lab3/tasks.jsonl --id t-01
```
Новий прогін дає нову теку `<id>-<мітка часу>` і не перезаписує попередню. Гілка `harness/<id>` починається заново від
`main` (`-B`); відправити її в origin — лише з `--push` (рішення автора). Після кожної задачі черга друкує, чи лишився
основний checkout чистим (без очікуваних `docs/lab3/runs/` і `.agent-log/`) — у всіх чотирьох прогонах: «основний
checkout чистий».

## 6. Що перевірено без мережі
[`tests/harness/run-task.test.ts`](../../tests/harness/run-task.test.ts) — 15 тестів, тимчасовий git-репозиторій і
підставний агент, без ключів і мережі:
- журнал (`patch.diff`, `output.txt`, `agent.log`, `run.json`) пишеться **завжди**: успіх, агент упав, нуль ходів,
  вичерпаний бюджет (`error_max_budget_usd`), таймаут, виняток у самому запуску агента
- новий файл потрапляє в `patch.diff`, а журнал дій агента (`.agent-log`) — ні
- `acceptance` виконується справжніми командами; одна невдала — прогін не пройдено; порожній перелік — ніколи не «пройдено»
- повторний прогін не перезаписує попередній артефакт
- `readMeta`: не-JSON → `null`; повний вхід на числах справжнього прогону `t-01` (74 430)
- `relocate`: журнал копії вказує на саму копію
- дозволи: змінювати лише файли задачі, з оболонки лише перевірки; виклик з `dontAsk`, бюджетом і `--strict-mcp-config`

## Що з'ясувалося на перших прогонах
- **dontAsk справді обмежує.** У кожному з чотирьох прогонів рівно одна відмова (`permission_denials` у
  `output.txt`): агент хотів перевірити себе командою, якої немає в дозволах — `t-01` —
  `npm run typecheck 2>&1 | tail …; echo …`, `t-04` — `npm run typecheck; echo …; npx eslint …`, `t-02` —
  `cd C:/…/harness-runs/t-02 && npm run typecheck …`, `t-05` — `npm run build`. У `t-01` і `t-02` агент після цього
  чесно написав, що перевірити не зміг; що зміна правильна, довела незалежна перевірка `acceptance` виконавця.
- **Межа dontAsk — не лише наш перелік.** Складену команду лише для читання `git status --short && git log --oneline -1
  && cat package.json` агент виконав без явного дозволу (рядок `ok` у `agent-actions.jsonl` `t-01`, `t-04`): Claude
  Code пропускає команди, які вважає безпечними для читання. Записати змінні чи файли так не можна — `Edit`/`Write`
  поза файлами задачі не дозволені.
- **Агент виправляв себе.** У `t-04` перший запуск тесту впав (`error`), агент змінив файл, другий запуск пройшов.
