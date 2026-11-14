# Лабораторна 3 — харнес автономних агентів

Автор: Сисак Віталій Романович, група 4cs-43. Репозиторій той самий, що в Лабораторних 1 і 2: [VitaliySysak/AI-engineering](https://github.com/VitaliySysak/AI-engineering).

Постійні посилання нижче ведуть на коміт `51cfb89` — стан коду, на якому зелені всі брами й CI. Пізніші коміти змінюють лише документацію пакета.

## 1. Таблиця прийняття

| Критерій | Де доказ | Посилання |
|---|---|---|
| брама · CI зелений на поданому SHA | прогони Actions на `51cfb89`: `gates` і `CI` | [gates 43597872721](https://github.com/VitaliySysak/AI-engineering/actions/runs/43597872721) · [CI 43597872605](https://github.com/VitaliySysak/AI-engineering/actions/runs/43597872605) · прогони останнього коміта `main` — [Actions, гілка main](https://github.com/VitaliySysak/AI-engineering/actions?query=branch%3Amain) |
| брама · журнал автономності, ≥ 4 сесії | `docs/lab3/autonomy-log.md`: 8 сесій, 2026-11-06 … 2026-11-14 | [autonomy-log.md](https://github.com/VitaliySysak/AI-engineering/blob/51cfb89f577e1782488f6c1c6421964b85cd3d01/docs/lab3/autonomy-log.md) |
| брама · жодного обходу перевірок дозволів | `claudeArgs`: `--permission-mode dontAsk` + `--allowedTools` + `--tools`; тест відсутності обходу | [run-task.ts#L143-L159](https://github.com/VitaliySysak/AI-engineering/blob/51cfb89f577e1782488f6c1c6421964b85cd3d01/scripts/harness/run-task.ts#L143-L159) · [run-task.test.ts#L199](https://github.com/VitaliySysak/AI-engineering/blob/51cfb89f577e1782488f6c1c6421964b85cd3d01/tests/harness/run-task.test.ts#L199) |
| брама · немає секретів в історії | `git log --all` по шляхах із ключами і пошук префіксів ключів у всій історії | розділ 6 нижче |
| крок 00 · фабрика задач | `docs/lab3/factory.md`, код фабрики, артефакти прогонів у `docs/lab3/runs/` | [factory.md](https://github.com/VitaliySysak/AI-engineering/blob/51cfb89f577e1782488f6c1c6421964b85cd3d01/docs/lab3/factory.md) |
| крок 01 · ланцюг брам | `docs/lab3/gates.md`, `.github/workflows/gates.yml`, зелений і червоний прогони | [gates.md](https://github.com/VitaliySysak/AI-engineering/blob/51cfb89f577e1782488f6c1c6421964b85cd3d01/docs/lab3/gates.md) |
| крок 02 · верифікатор зупинив зміну | `docs/lab3/verifier.md`: суддя Gemini, стоп і виправлення | [verifier.md](https://github.com/VitaliySysak/AI-engineering/blob/51cfb89f577e1782488f6c1c6421964b85cd3d01/docs/lab3/verifier.md) |
| крок 03 · прогін зупинився сам | `docs/lab3/stop.md`, `docs/lab3/stop-log.jsonl`, `.harness/breaker.json` | [stop.md](https://github.com/VitaliySysak/AI-engineering/blob/51cfb89f577e1782488f6c1c6421964b85cd3d01/docs/lab3/stop.md) |
| крок 04 · регресійна брама в CI | `docs/lab3/evals.md`, банк `docs/lab3/tasks.jsonl`, задача `evals` | [evals.md](https://github.com/VitaliySysak/AI-engineering/blob/51cfb89f577e1782488f6c1c6421964b85cd3d01/docs/lab3/evals.md) |
| крок 05 · число згоди судді | `docs/lab3/judge.md`, `docs/lab3/judge-cases.jsonl`, `docs/lab3/verdicts/judge.jsonl` | [judge.md](https://github.com/VitaliySysak/AI-engineering/blob/51cfb89f577e1782488f6c1c6421964b85cd3d01/docs/lab3/judge.md) |
| крок 06 · класифікація помилок | `docs/lab3/errors.md`, траси в `docs/lab3/traces/` | [errors.md](https://github.com/VitaliySysak/AI-engineering/blob/51cfb89f577e1782488f6c1c6421964b85cd3d01/docs/lab3/errors.md) |
| крок 07 · ін'єкція промпту | `docs/lab3/redteam.md`, `scripts/redteam/`, `docs/lab3/redteam.jsonl` | [redteam.md](https://github.com/VitaliySysak/AI-engineering/blob/51cfb89f577e1782488f6c1c6421964b85cd3d01/docs/lab3/redteam.md) |
| крок 08 · цей звіт | `docs/lab3/README.md` | [README.md](README.md) |

## 2. Прогони CI

- Зелений на `51cfb89` (код поданого стану): [gates 43597872721](https://github.com/VitaliySysak/AI-engineering/actions/runs/43597872721) — `types`, `lint`, `tests`, `build`, `record`, `evals` success; [CI 43597872605](https://github.com/VitaliySysak/AI-engineering/actions/runs/43597872605).
- Червоний, збережений як доказ, — верифікатор: [42483151062](https://github.com/VitaliySysak/AI-engineering/actions/runs/42483151062). Чотири детерміновані брами зелені, `verify` червона: `t-05.c3: fail`, агент змінив заборонений `src/rag/rrf.ts`. Виправлення: [зелений прогін 42483926055](https://github.com/VitaliySysak/AI-engineering/actions/runs/42483926055) після нової задачі з тим самим входом, усі критерії `pass` (деталі — `verifier.md`).
- Червоний, збережений як доказ, — регресійна брама: [42513545745, спроба 2](https://github.com/VitaliySysak/AI-engineering/actions/runs/42513545745/attempts/2), навмисна регресія на гілці `evals-red/2026-11-08-b` (харнес не передає задачу агентові): `РЕГРЕСІЯ на 5 задачах`, код 1. Наступний зелений: [42595390601](https://github.com/VitaliySysak/AI-engineering/actions/runs/42595390601).
- Червоний на детермінованій брамі: [42474130041](https://github.com/VitaliySysak/AI-engineering/actions/runs/42474130041), гілка `harness/red-2026-11-08`: впала `types`, решта пропущені (деталі — `gates.md`).
- Хибні червоні прогони брами `evals`, не видалені: [42607755513](https://github.com/VitaliySysak/AI-engineering/actions/runs/42607755513) (дві спроби) і [42611305404](https://github.com/VitaliySysak/AI-engineering/actions/runs/42611305404) (таймаут). Що з ними зроблено — `evals.md`, розділ 3.

## 3. Інструменти й моделі

| Роль | Інструмент | Модель із версією | Платний чи безкоштовний шлях |
|---|---|---|---|
| помічник (усі сесії) | Claude Code 2.1.302 (desktop) | Opus 5.5, `claude-opus-5-5` | підписка Pro |
| виконавець фабрики, evals локально, red-team | Claude Code 2.1.302 `claude -p` | Haiku 5.5, `--model haiku` → `claude-haiku-5-5` | ліміт підписки Pro; оцінка вартості клієнтська |
| агент у CI (задача `evals`) | Gemini CLI 0.67.0 | `gemini-3.5-flash-lite` | безкоштовний рівень Google AI Studio |
| верифікатор і суддя | власний `verify-task.ts`, `run-judge.ts` | `gemini-3.5-flash-lite`, temperature 0 | безкоштовний рівень Google AI Studio |
| демонстрація циклу AI SDK | ai 7.0.148 + @ai-sdk/otel 1.0.148 | `gemini-3.5-flash-lite` | безкоштовний рівень |
| траси | OpenTelemetry (sdk-node 0.222.0, OTLP/HTTP 0.222.0) → Langfuse Cloud Hobby | — | безкоштовно |
| середовище | Node 24.21.0, Next.js 16.3.4, Vitest, GitHub Actions | — | безкоштовно |

## 4. Як повторити автономний прогін

1. Одна задача з черги: `npx tsx scripts/harness/run-queue.ts docs/lab3/tasks.jsonl --id t-01`. Увесь заморожений банк k = 3: `EVAL_K=3 npx tsx scripts/evals/run-evals.ts docs/lab3/tasks.jsonl`, далі `npx tsx scripts/evals/gate.ts`. Red-team: `npx tsx scripts/redteam/run-redteam.ts`.
2. Режим дозволів і перелік дозволених інструментів: `--permission-mode dontAsk`; `--allowedTools` — `Read`, `Glob`, `Grep`, `Edit` і `Write` лише для файлів задачі, `Bash` лише для `npm test *`, `npm run typecheck`, `npm run lint`, валідатора набору, `git diff *`, `git status *`; `--tools Read,Glob,Grep,Edit,Write,Bash`; `--strict-mcp-config`; ліміти `--max-turns` і `--max-budget-usd` із задачі. Код — `allowedToolsFor` і `claudeArgs` у `scripts/harness/run-task.ts`. Обходу дозволів немає ніде.
3. Спосіб ізоляції: окреме git worktree на кожну задачу чи спробу (`run-queue.ts`, `run-evals.ts`, `run-redteam.ts`); `node_modules` — посилання, яке знімається до видалення дерева. Контейнера немає: Docker на машині не встановлений.
4. Для трас потрібні `LANGFUSE_PUBLIC_KEY` і `LANGFUSE_SECRET_KEY` у середовищі або `.env.local`; без них траса має локальний `trace_id`, але нікуди не експортується. Перевірка — `npx tsx scripts/harness/trace-check.ts`.
5. Перевірки перед поданням: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## 5. Висновок і числа

Висновок одним перевірюваним твердженням: **на замороженому банку з 21 задачі Haiku 5.5 проходить усі 3 спроби у 20 задачах (кошик `regression`: 6 із 6, pass^3 = 100%); брама в CI на Gemini охороняє 5 задач і зловила навмисну регресію поіменно.**

Повні числа: [evals.md](evals.md) · класи помилок: [errors.md](errors.md)

| Показник | Базова лінія 2026-11-08 | Останній прогін | Де доказ |
|---|---|---|---|
| частка проходження банку задач (Haiku, k = 3) | 62 / 63 спроб (98,4%) | повторного повного прогону не було | `evals.md`, розділ 6 |
| pass^k, k = 3 | 20 / 21 задач | — | `docs/lab3/evals-baseline.json` |
| pass^k у CI (Gemini, кошик regression) | 5 / 6 задач, k = 3 | k = 1 з повтором: зелений на `51cfb89` | `docs/lab3/evals-baseline-ci.json`, прогін 43597872721 |
| час на спробу, медіана | 20,3 с | — | `docs/lab3/evals.jsonl` |
| вхідні токени на спробу, медіана | 73 436 | — | `docs/lab3/evals.jsonl` |
| оцінка вартості прогону (63 спроби) | $0.2536 (клієнтська оцінка) | — | `docs/lab3/evals.jsonl` |
| каппа Коена для судді (40 пар) | 0,889 (рубрика «до») | 0,944 (рубрика «після»); на відкладених 0,625 → 0,625 | `judge.md` |
| класифіковані відмови | — | 10: задача 3, харнес 6, модель 1 | `errors.md` |
| red-team | 1 сценарій пройшов (r-11) | 11 доставлено, 0 порушень після брами безпеки | `redteam.md` |

Пороги регресійної брами й каппи курс оголошує на занятті 10; на момент написання їх тут немає, у відповідних файлах діє правило кроку.

## 6. Секрети й персональні дані в історії

- Пошук у всій історії (`git log --all -p -S …`) за префіксами `sk-ant-`, `sk-lf-`, `pk-lf-`, `sk-proj-`, `AIza`, `ghp_`, `github_pat_`, `xoxb-` і за адресою пошти автора, 2026-11-14. Знайдено лише регулярні вирази перевірок, вигадані ключі-фікстури в тестах (`AIzaSyD0…`, `AIzaSyA1…`; перший уже описаний у Лабораторній 2) і текст команд пошуку в журналі дій. Справжніх ключів і пошти автора немає.
- `git log --all --oneline -- <файли середовища>`: вивід порожній (запуск автора 2026-11-14; команду з назвами цих файлів запускає людина, бо хук guard-env блокує її для агента).
- Персональні дані в бекенді трас: метадані спанів Langfuse містять пошту й ідентифікатори акаунта, але в репозиторій вони не потрапляють — витяжки трас беруть лише дозволені атрибути, на знімках панелі Metadata немає (`errors.md`, розділ 6).

## 7. Код у репозиторії

| Що | Шлях |
|---|---|
| фабрика задач і виконавець | `scripts/harness/run-task.ts`, `scripts/harness/run-queue.ts` |
| ланцюг брам (робочий процес) | `.github/workflows/gates.yml`, `scripts/harness/record-gates.mjs` |
| верифікатор | `scripts/harness/verify-task.ts`, `src/verify/schema.ts` |
| зупинення і circuit breaker | `src/harness/stop.ts`, `src/harness/breaker.ts` |
| набір задач для evals і конфігурація прогону | `docs/lab3/tasks.jsonl`, `scripts/evals/graders.ts`, `scripts/evals/run-evals.ts`, `scripts/evals/gate.ts`, `.github/workflows/evals-baseline.yml` |
| суддя і калібрування | `scripts/judge/run-judge.ts`, `scripts/judge/calibrate.ts`, `scripts/judge/rubric-before.md`, `scripts/judge/rubric-after.md` |
| траси | `src/telemetry/otel.ts`, `scripts/harness/pull-trace.ts`, `scripts/harness/trace-check.ts` |
| red-team і брама безпеки | `scripts/redteam/`, `scripts/harness/security.ts` |
| тести | `tests/harness/`, `tests/evals/`, `tests/judge/`, `tests/telemetry/`, `tests/redteam/` |

## 8. Файли пакета

| Файл | Крок | Посилання |
|---|---|---|
| factory.md | 00 | [factory.md](factory.md) |
| gates.md | 01 | [gates.md](gates.md) |
| verifier.md | 02 | [verifier.md](verifier.md) |
| stop.md | 03 | [stop.md](stop.md) |
| evals.md | 04 | [evals.md](evals.md) |
| judge.md | 05 | [judge.md](judge.md) |
| errors.md | 06 | [errors.md](errors.md) |
| traces/ | 06, 07 | [traces/](traces/) |
| redteam.md | 07 | [redteam.md](redteam.md) |
| autonomy-log.md | з кроку 00 | [autonomy-log.md](autonomy-log.md) |

## 9. Що лишається відкритим

- Скріншот правила `main-gates` із `evals` серед обовʼязкових перевірок (`docs/lab3/gates-ruleset-evals.png`): на момент написання не додано, тому те, що evals є обовʼязковою перевіркою правила, не підтверджено..
- Пороги курсу з заняття 10 у `evals.md` і `judge.md` не внесено, бо на момент написання їх не оголошено.
