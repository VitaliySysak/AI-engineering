# Пакет доказів · Лабораторна 2

Асистент з адміністрування Linux-сервера з гібридним пошуком, цитуванням і власним MCP-сервером на основі специфікації.

Репозиторій: https://github.com/VitaliySysak/AI-engineering (той самий, що й у Лабораторній 1; `docs/lab1/` не
змінювалась з 2026-09-28).
Подано: стан `main` на момент фіксації SHA викладачем на початку заняття 09. Посилання-permalink нижче зафіксовано
на коміті [`d62e222`](https://github.com/VitaliySysak/AI-engineering/tree/d62e2223a04b7eed736efa9b46f534ec68e0f324),
у якому вже є всі докази кроків 00–09.

## Висновок
На тому самому замороженому наборі з 20 запитів (SHA `d6827ec`), тій самій моделі `gemini-3.5-flash-lite` і тому
самому промпті додавання топ-5 фрагментів гібридного пошуку змінило: правильні відмови **0 → 3 із 3**, стійкість до
injection **0 → 2 із 2**, частка відповідей із цитатою **0 → 100%**, точність **6 → 9 із 17** (35,3% → 52,9%; у
межах похибки при n = 17), вартість на 100 запитів $0.1245 → $0.0619, медіана моделі 6,46 → 0,98 с. Ціль G1
(≥ 80% точності) **не досягнуто**. Перевірити без мережі:
`npx tsx scripts/eval-run.ts --summary docs/lab2/eval-run.json`.
Повні числа й розбір: [eval-report.md, «Підсумок»](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/docs/lab2/eval-report.md#підсумок) ([локально](eval-report.md)).

## Докази
| Крок | Доказ | Посилання |
|---|---|---|
| 00 | Специфікація: обсяг, корпус із походженням і ліцензією, цілі G1–G5, критерії A1–A7 | [spec.md](spec.md) · [permalink](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/docs/lab2/spec.md) · корпус [`corpus/`](https://github.com/VitaliySysak/AI-engineering/tree/d62e2223a04b7eed736efa9b46f534ec68e0f324/corpus) · коміт [`7e822a3`](https://github.com/VitaliySysak/AI-engineering/commit/7e822a3) |
| 01 | Еталонний набір (20 запитів, заморожено) | [eval-set.md](eval-set.md) · [permalink](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/docs/lab2/eval-set.md) · [`queries.jsonl` на SHA заморозки](https://github.com/VitaliySysak/AI-engineering/blob/d6827ec8ea2d8487b37ad465c7d996b25aa55bd1/docs/lab2/golden/queries.jsonl) · коміт [`d6827ec`](https://github.com/VitaliySysak/AI-engineering/commit/d6827ec) |
| 01 | Базова лінія без пошуку (2026-10-24) | [baseline.md](baseline.md) · [permalink](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/docs/lab2/baseline.md) |
| 02, 07 | Субагенти: розподіл, межі контексту, зведення, залежності (граф — у budget.md) | [subagents.md](subagents.md) · [permalink](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/docs/lab2/subagents.md) · конфігурації [`.claude/agents/`](https://github.com/VitaliySysak/AI-engineering/tree/d62e2223a04b7eed736efa9b46f534ec68e0f324/.claude/agents) |
| 03 | Верифікатор на іншій моделі, калібрування, зупинений випадок і виправлення, брами кроків 05–09 | [verifier.md](verifier.md) · [permalink](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/docs/lab2/verifier.md) · стоп [`e6edf98`](https://github.com/VitaliySysak/AI-engineering/commit/e6edf9856de7c9f14e84dcb4d3c8c34f0b697fa2) → виправлення [`10a82d2`](https://github.com/VitaliySysak/AI-engineering/commit/10a82d2458f709cd95dd4fce64d585d4d11bab31) (гілка `lab2/verify-stop`) · калібрування [`calibration/`](https://github.com/VitaliySysak/AI-engineering/tree/d62e2223a04b7eed736efa9b46f534ec68e0f324/docs/lab2/calibration) |
| 04 | Індексація: 10 документів, правило фрагментації v1 (30 фрагментів) і v2 (11), обґрунтування | [indexing.md](indexing.md) · [permalink](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/docs/lab2/indexing.md) · індекс [`data/index.json`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/data/index.json) |
| 05 | Гібридний пошук (вектор + BM25, RRF), цитування, правило відмови, приклад відповіді з джерелами | [retrieval.md](retrieval.md) · [permalink](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/docs/lab2/retrieval.md) |
| 06, 10 | Оцінювання поруч із базовою лінією, 6 розібраних помилок, підсумок «до/після» з датами | [eval-report.md](eval-report.md) · [permalink](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/docs/lab2/eval-report.md) · дані [`eval-run.json`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/docs/lab2/eval-run.json), [`eval-run-after.json`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/docs/lab2/eval-run-after.json) |
| 07 | Граф залежностей, бюджет до запуску, паралельні прогони 1/2/4/8, маршрутизація, висновок | [budget.md](budget.md) · [permalink](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/docs/lab2/budget.md) · дані [`parallel-run.json`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/docs/lab2/parallel-run.json) · бюджет до коду — коміт [`e35bbbf`](https://github.com/VitaliySysak/AI-engineering/commit/e35bbbf) |
| 08 | Специфікація MCP-сервера (до коду), smoke-тест Inspector | [mcp-spec.md](mcp-spec.md) · [permalink](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/docs/lab2/mcp-spec.md) · специфікація [`e02c812`](https://github.com/VitaliySysak/AI-engineering/commit/e02c812) раніше за код [`d64354c`](https://github.com/VitaliySysak/AI-engineering/commit/d64354c) |
| 09 | Підключення до Claude Code і до застосунку, виклики з обох боків | [mcp-integration.md](mcp-integration.md) · [permalink](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/docs/lab2/mcp-integration.md) · журнал сервера [`mcp-calls.jsonl`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/docs/lab2/traces/mcp-calls.jsonl) |
| — | Журнал автономності (8 сесій; остання — про цей README) | [autonomy-log.md](autonomy-log.md) · [permalink](https://github.com/VitaliySysak/AI-engineering/blob/684bb7d/docs/lab2/autonomy-log.md) (коміт із сесією 8) · журнал дій агента [`.agent-log/claude-code.jsonl`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/.agent-log/claude-code.jsonl) |
| — | Траси | [traces/](traces/) · [permalink](https://github.com/VitaliySysak/AI-engineering/tree/d62e2223a04b7eed736efa9b46f534ec68e0f324/docs/lab2/traces) |

Ключові траси (скріншоти з часом, токенами й вартістю):
- крок 06 — [`traces/eval-run.png`](traces/eval-run.png): прогін набору з пошуком
- крок 07 — [`traces/parallel-before.png`](traces/parallel-before.png) (ширина 1, 93 417 мс) і
  [`traces/parallel-after.png`](traces/parallel-after.png) (ширина 8, 4 314 мс); обидва — відтворення з
  `parallel-run.json`, бо живий вивід втрачено (записано в budget.md)
- крок 08 — [`traces/mcp-inspector-2026-10-26.txt`](traces/mcp-inspector-2026-10-26.txt): Inspector, відмова з кодом 5
- крок 09 — [`traces/mcp-claude-code.png`](traces/mcp-claude-code.png),
  [`traces/mcp-claude-code-transcript.txt`](traces/mcp-claude-code-transcript.txt),
  [`traces/mcp-demo-2026-10-26.txt`](traces/mcp-demo-2026-10-26.txt)

## Код
| Що | Шлях у репозиторії |
|---|---|
| Індексація | [`src/rag/chunk.ts`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/src/rag/chunk.ts), [`src/rag/embed.ts`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/src/rag/embed.ts), [`src/rag/store.ts`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/src/rag/store.ts), [`scripts/build-index.ts`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/scripts/build-index.ts) |
| Пошук і цитування | [`src/rag/bm25.ts`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/src/rag/bm25.ts), [`src/rag/rrf.ts`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/src/rag/rrf.ts), [`src/rag/search.ts`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/src/rag/search.ts), [`src/rag/cite.ts`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/src/rag/cite.ts), [`src/rag/refusal.ts`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/src/rag/refusal.ts), [`scripts/search.ts`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/scripts/search.ts) |
| Оцінювання | [`scripts/validate-golden.ts`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/scripts/validate-golden.ts), [`scripts/baseline.ts`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/scripts/baseline.ts), [`scripts/eval-run.ts`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/scripts/eval-run.ts), [`src/metrics.ts`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/src/metrics.ts), [`scripts/parallel-eval.ts`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/scripts/parallel-eval.ts) |
| Верифікатор | [`scripts/verify.ts`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/scripts/verify.ts), [`src/verify/schema.ts`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/src/verify/schema.ts); запуск — `npm run verify` |
| Субагенти | [`.claude/agents/spec-auditor.md`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/.claude/agents/spec-auditor.md), [`.claude/agents/explorer.md`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/.claude/agents/explorer.md) |
| MCP-сервер | [`src/mcp/tools.ts`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/src/mcp/tools.ts), [`src/mcp/server.ts`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/src/mcp/server.ts) |
| Підключення MCP | агент — [`.mcp.json`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/.mcp.json); застосунок — [`scripts/mcp-demo.ts`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/scripts/mcp-demo.ts) |
| Тести (без мережі, у CI) | [`tests/`](https://github.com/VitaliySysak/AI-engineering/tree/d62e2223a04b7eed736efa9b46f534ec68e0f324/tests): `chunk`, `index`, `retrieval`, `metrics`, `eval-run`, `validate-golden`, `verify*`, `parallel-eval`, `mcp` (зокрема тест на відмову у виході за межі — [«ВІДМОВА…» у `tests/mcp.test.ts`](https://github.com/VitaliySysak/AI-engineering/blob/d62e2223a04b7eed736efa9b46f534ec68e0f324/tests/mcp.test.ts)) — 190 тестів |

## Прогони CI
- Зелений на `main` (останній перед поданням, коміт `44c57e2` — злиття кроку 09):
  https://github.com/VitaliySysak/AI-engineering/actions/runs/40338280674. Прогін на коміті з цим README буде
  новішим — усі прогони `main`: https://github.com/VitaliySysak/AI-engineering/actions?query=branch%3Amain
- Зупинений верифікатором випадок: стоп `e6edf98` знайдено брамою по комітах **локально** (`npm run verify`; брама
  — не CI, рішення автора на кроці 03), не через пул-реквест. Зелений CI на виправленні `10a82d2`, гілка
  `lab2/verify-stop`: https://github.com/VitaliySysak/AI-engineering/actions/runs/40189612460. Деталі й звіти —
  [verifier.md, «Верифікатор зупинив зміну»](verifier.md)

## Інструменти й моделі
| Роль | Інструмент / модель | Версія |
|---|---|---|
| Агент кодування | Claude Code (desktop — сесія-помічник; CLI — бік агента на кроці 09), модель Opus 5.5 `claude-opus-5-5` | 2.1.302 |
| Другий агент кодування | **немає** — у Лабораторній 2 працював лише Claude Code | — |
| Субагенти | `spec-auditor`, `explorer` (`.claude/agents/`), `model: inherit` → `claude-opus-5-5` | Claude Code 2.1.302 |
| Верифікатор (суддя) | Gemini `gemini-3.5-flash-lite`, temperature 0, рубрика v2 — інша родина, ніж автор коду | API Gemini, free tier |
| Модель асистента | Gemini `gemini-3.5-flash-lite` (Chat Completions, OpenAI-сумісний ендпоінт) | free tier: 15 запитів/хв, 500/день |
| Ембедер | Google `gemini-embedding-2`, 768 вимірів, `@ai-sdk/google` | 4.0.82 |
| MCP-сервер / клієнт | `@modelcontextprotocol/server` / `@modelcontextprotocol/client` (ревізія протоколу 2026-07-28) | 2.3.1 / 2.3.1 |
| Smoke-тест MCP | `@modelcontextprotocol/inspector` | 2.12.0 |
| Середовище | Node.js · TypeScript · `ai` · Vitest · tsx · Next.js | 24.21.0 · 6.0.3 · 7.0.118 · 5.0.0 · 4.23.13 · 16.3.4 |

## Як відтворити
Перед першим запуском: `npm install`. Ключі (`GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`) — у файлі оточення
поза git за зразком [`.env.example`](../../.env.example); без ключів працюють тести, `--summary` і `fetch_chunk`.
1. Індексація набору (ходить у мережу, ембедер Google): `npm run index` → `data/index.json`
2. Запит до пошуку з цитатами: `npx tsx --env-file=.env.local scripts/search.ts "як встановити nginx" --answer`
   (`--explain` — ранги обох гілок і RRF; `--golden` — ранги на всьому наборі)
3. Запуск MCP-сервера: `npm run mcp` (чекає на stdin). Перевірка без ключа:
   `npx --yes @modelcontextprotocol/inspector@2.12.0 --cli npx tsx src/mcp/server.ts --protocol-era modern --method tools/list --format json`;
   клієнт застосунку: `npx tsx scripts/mcp-demo.ts "як встановити nginx"`; агент — `.mcp.json` у новій сесії Claude Code
4. Тести (без мережі): `npm test`; повна перевірка — `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`
5. Числа звіту без мережі: `npx tsx scripts/eval-run.ts --summary docs/lab2/eval-run.json`

## Чесні застереження
- Усі вісім сесій журналу автономності датовані 2026-10-24 – 2026-10-26, а не розподілені по тижнях занять 05–08;
  це записано в самому журналі
- Ціль G1 (≥ 80%) і критерій A6 не досягнуто — [eval-report.md](eval-report.md), «Звірка з вимірюваними цілями»
- Скріншоти паралельних прогонів (крок 07) — відтворення з файлу результатів, а не живий вивід
