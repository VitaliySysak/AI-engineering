# Трасування і аналіз помилок

Автор: Сисак Віталій Романович, група 4cs-43. Лабораторна 3, крок 06.

- Дата: 2026-11-09 · **назви атрибутів узято на цю дату** (конвенції GenAI у статусі Development)
- Прогони фабрики: Claude Code 2.1.302 `claude -p`, вбудоване бета-трасування (`CLAUDE_CODE_ENABLE_TELEMETRY`, `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA`, `TRACEPARENT`). Опція `telemetry` AI SDK на окремий процес не діє, тому його спани мають назви `claude_code.*`; атрибути `gen_ai.operation.name` у них є
- Власний цикл на AI SDK (`stop-demo`): ai 7.0.148 + @ai-sdk/otel 1.0.148, інтеграція `OpenTelemetry` (не Legacy): дерево `invoke_agent` → `step` → `chat` → `execute_tool`-спани
- Експортер: @opentelemetry/exporter-trace-otlp-http **0.222.0** (gRPC Langfuse не підтримує). **Відхилення від курсу:** версії 0.300.0 і api 1.10.0 несумісні з `@langfuse/otel` Лабораторної 1 (`@opentelemetry/core@2.12` вимагає api `<1.10.0`, а `sdk-node@0.300.0` — `>=1.10.0`). `--force` не застосовано, стоїть api 1.9.1 і sdk-node 0.222.0
- Бекенд: Langfuse Cloud Hobby, ендпоїнт `https://cloud.langfuse.com/api/public/otel`, заголовок `x-langfuse-ingestion-version=4`
- functionId: `harness-stop-demo` → `gen_ai.agent.name`; спан задачі фабрики — `gen_ai.agent.name=harness-run-task` · recordInputs/recordOutputs: вимкнені, бо репозиторій публічний; змінних, що вмикають вміст у Claude Code, не задано
- Назви експортів OpenTelemetry, звірені з node_modules: `NodeSDK` (`@opentelemetry/sdk-node`), `OTLPTraceExporter` (`@opentelemetry/exporter-trace-otlp-http`), `OpenTelemetry` (`@ai-sdk/otel`), `registerTelemetry` (`ai`)
- Код: `src/telemetry/otel.ts`, `runTaskTraced` у `scripts/harness/run-task.ts`, витяжка `scripts/harness/pull-trace.ts`

## 1. Звʼязок траси з журналом

- Поле `trace_id` у `run.json` заповнюється з власного спана задачі (`task <id>`). Той самий ідентифікатор передається Claude Code через `TRACEPARENT`, тому спан `claude_code.interaction` лежить усередині спана задачі.
- Те саме значення є в журналі спроб: так, у `docs/lab3/evals-diagnostics.jsonl`. В основному `docs/lab3/evals.jsonl` його **немає**: той прогін зроблено на кроці 04, до трасування, і його не перезапускав.
- Приклад: `t-01` → `48c8c9fcfb652035c5b118eccfcda3e2` → `docs/lab3/traces/2026-11-09-demo-48c8c9fcfb652035c5b118eccfcda3e2.txt`, `run.json` — `docs/lab3/runs/t-01-1794221262956`.
- Дерево AI SDK: `docs/lab3/traces/2026-11-09-demo-40328534de12dcc1678cf7f3188c4f42.*`.

## 2. Класифікація (10 невдалих прогонів)

Прогін: `docs/lab3/tasks-failures.jsonl`, k=3, коміт `740e1f0`, журнал `docs/lab3/evals-diagnostics.jsonl`: 14 відмов із 18 спроб, класифіковано 10. Набір складено з задач, що справді падають, тож ці відмови очікувані, а не випадкова вибірка.

| # | task_id | Спроба | trace_id | Клас | Доказ (спан/атрибут/рядок журналу) | Файли у `traces/` |
|---|---|---|---|---|---|---|
| 1 | `t-03` | 1 | `dada923f40301a547bc7ffc27a139a83` | задача | `acceptance`: червоні: npm test -- tests/validate-golden.test.ts; останній `finish_reasons=["end_turn"]` | `2026-11-09-task-dada923f40301a547bc7ffc27a139a83.txt`, `.png` |
| 2 | `t-03` | 2 | `22cce7a8bd10ad416b3da1e975c40d47` | задача | `acceptance`: червоні: npm test -- tests/validate-golden.test.ts; останній `finish_reasons=["end_turn"]` | `2026-11-09-task-22cce7a8bd10ad416b3da1e975c40d47.txt`, `.png` |
| 3 | `t-03` | 3 | `c83f97299078879d883cd9a07b5cf8c6` | задача | `acceptance`: червоні: npm test -- tests/validate-golden.test.ts; останній `finish_reasons=["end_turn"]` | `2026-11-09-task-c83f97299078879d883cd9a07b5cf8c6.txt`, `.png` |
| 4 | `t-01` | 1 | `f471a4bf8252866a7131820e88e776f7` | харнес | `result_subtype=error_max_turns`, 2 `llm_request`, останній `finish_reasons=["tool_use"]`; оцінювач: has_changes | `2026-11-09-harness-f471a4bf8252866a7131820e88e776f7.txt`, `.png` |
| 5 | `t-02` | 2 | `eafb2539720707ab35907d5a0c196897` | харнес | `result_subtype=error_max_turns`, 2 `llm_request`, останній `finish_reasons=["tool_use"]`; оцінювач: has_changes | `2026-11-09-harness-eafb2539720707ab35907d5a0c196897.txt`, `.png` |
| 6 | `t-02` | 3 | `24883ed70b8b2c30a95dbf0c3f1e713b` | харнес | `result_subtype=error_max_turns`, 2 `llm_request`, останній `finish_reasons=["tool_use"]`; оцінювач: acceptance | `2026-11-09-harness-24883ed70b8b2c30a95dbf0c3f1e713b.txt`, `.png` |
| 7 | `t-04` | 1 | `bb4ac3724d35fe9e1fd0b3d3a8342ff5` | харнес | `result_subtype=error_max_turns`, 2 `llm_request`, останній `finish_reasons=["tool_use"]`; оцінювач: acceptance | `2026-11-09-harness-bb4ac3724d35fe9e1fd0b3d3a8342ff5.txt`, `.png` |
| 8 | `t-06` | 1 | `0cc71c4c31648e1f402172fb054332e8` | харнес | `result_subtype=error_max_turns`, 2 `llm_request`, останній `finish_reasons=["tool_use"]`; оцінювач: acceptance | `2026-11-09-harness-0cc71c4c31648e1f402172fb054332e8.txt`, `.png` |
| 9 | `t-06` | 2 | `fb05025af98dbfccff824ffad062e3ac` | харнес | `result_subtype=error_max_turns`, 2 `llm_request`, останній `finish_reasons=["tool_use"]`; оцінювач: acceptance | `2026-11-09-harness-fb05025af98dbfccff824ffad062e3ac.txt`, `.png` |
| 10 | `t-20` | 3 | `b8dc735bcd2e2fbec528ed61de7361ac` | модель | `no_changes`: diff на 2916 символів; `Edit` у трасі, спроби #1 і #2 — diff порожній | `2026-11-09-model-b8dc735bcd2e2fbec528ed61de7361ac.txt`, `.png` |

Разом: задача 3 · промпт 0 · інструмент 0 · модель 1 · харнес 6.

- **задача:** три спроби падають на тій самій команді `npm test -- tests/validate-golden.test.ts`, при цьому агент завершує роботу сам (`end_turn`). Причина встановлена на кроці 04: нова перевірка ламає наявний тест.
- **харнес:** навмисний ліміт `--max-turns 2`, див. [stop.md](stop.md). У трасі рівно 2 `llm_request`, усі `tool_use`, `end_turn` немає: цикл обірвано ззовні. Це робота кроку 03, а не помилка агента. Траса заодно пояснила, чому журнал показує `num_turns: 3`: запитів до моделі справді 2.
- **модель:** `t-20` #3 змінила код на неоднозначний запит, тоді як спроби #1 і #2 тієї самої задачі лишили diff порожнім. Ця спроба теж досягла ліміту ходів, але відмову спричинила саме зміна коду, бо оцінювач `no_changes` судить артефакт.

## 3. Класи, яких у мене НЕ траплялося

- **промпт:** жодної траси без інструментів і з порожнім patch серед відмов.
- **інструмент:** жодна класифікована відмова не спричинена інструментом. `Bash` із `decision=reject` є в `t-03` і `t-20`, але падіння там мають іншу причину. Як слабке місце це записано нижче.

## 4. Що з цього змінено в харнесі

| Клас | Що саме змінив | Коміт |
|---|---|---|
| задача | `t-03` перенесено в `tasks-rejected.jsonl` з причиною, банк заморожено без неї | `1d6d4fa` |
| харнес | нічого: ліміт спрацював як задумано | — |
| модель | нічого: у звіті це нестабільність, браму вона не зачіпає (`edge`) | — |

Відкрите слабке місце: агент запускає складені команди перевірки, `dontAsk` їх відхиляє (`decision=reject`, спана `execution` немає), і агент не бачить результату своїх перевірок. На кроці 04 відхилення були в 48 спробах із 63. Не виправлено, бо зміна харнеса після заморозки зробила б базовий рівень непорівнянним.

Під час цього кроку знайдено й виправлено власні дефекти трасування: мовчазний прогін без експорту (`2ef67f7`), знятий ендпоїнт читання Langfuse (`77b083d`).

## 5. Числа з тих самих трас

| task_id | Кроків (`llm_request`) | Вх. токени | Вих. токени | Час, с | Оцінка вартості |
|---|---|---|---|---|---|
| `t-03` #1 | 7 | 113301 | 3573 | 26.72 | $0.00549 |
| `t-03` #2 | 6 | 97343 | 3082 | 23.954 | $0.00517 |
| `t-03` #3 | 5 | 80845 | 3633 | 23.256 | $0.00525 |
| `t-01` #1 | 2 | 32786 | 456 | 8.974 | $0.00339 |
| `t-02` #2 | 2 | 25241 | 465 | 9.069 | $0.00189 |
| `t-02` #3 | 2 | 25241 | 1418 | 11.713 | $0.00236 |
| `t-04` #1 | 2 | 23716 | 377 | 5.711 | $0.00154 |
| `t-06` #1 | 2 | 23574 | 557 | 6.041 | $0.00160 |
| `t-06` #2 | 2 | 23585 | 382 | 5.351 | $0.00151 |
| `t-20` #3 | 6 | 147423 | 10857 | 71.851 | $0.01272 |

Кроки — кількість спанів `claude_code.llm_request` у витяжці. Токени, час і оцінка — з `docs/lab3/evals-diagnostics.jsonl`, вхідні разом із кешем. Оцінка вартості — клієнтська, не рахунок.

## 6. Чесні межі

- Конвенції GenAI у статусі Development; назви можуть змінитися після дати вище.
- AI SDK і OTel розходяться: `cache_creation.input_tokens` проти `cache_write.input_tokens`; операції `rerank` і `decide` є лише в AI SDK.
- Трасування Claude Code — бета-функція; назви `claude_code.*` не є конвенцією OTel і можуть змінитися.
- Історія бекенда — 30 днів, тому доказ у репозиторії: `docs/lab3/traces/`, знімок і витяжка на кожен класифікований прогін.
- Вміст промптів і відповідей у трасах вимкнений, тому класи доведено структурою траси й журналом, а не текстом. На довгих трасах (`t-03`, `t-20`) дерево не вміщується у знімок; повне дерево є у витяжці.
- **Персональні дані в бекенді.** Метадані спанів Langfuse містять `user.email`, ідентифікатори акаунта, `host.name` і `process.command_args`. Витяжка бере лише дозволені атрибути, на знімках панелі Metadata немає. У сам Langfuse ці дані все ж потрапляють.
- Заголовок авторизації Langfuse передається в середовище процесу агента, інші секрети — ні. Агент у `dontAsk` не має команди, щоб його прочитати, але це не технічна межа.
- У CI і на Gemini немає дочірніх спанів: там є лише спан задачі, і ключів Langfuse в CI немає, тому експорту теж.
- Вихідна витяжка `demo-40328534…` має зайве поле `input_tokens=0`: тодішній збіг за кінцем назви підхопив інший лічильник. Справжнє значення — `gen_ai.usage.input_tokens=640`. Код виправлено, файл не редагувався.
- Класифіковано 10 із 14 відмов набору, складеного навмисно. Частка класів нічого не каже про типовий розподіл відмов.
