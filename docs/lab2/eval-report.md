# Звіт про оцінювання пошуку — Лабораторна 2

## Методика (та сама, що в baseline.md)
- Дата прогону: 2026-10-25 (головний — 13:31 UTC; «після виправлень» — 14:26 UTC)
- Набір: [`docs/lab2/golden/queries.jsonl`](golden/queries.jsonl), SHA заморозки `d6827ec8ea2d8487b37ad465c7d996b25aa55bd1`;
  запитів 20, з них відповідних (непорожній `must_cite`) — 17; `git log d6827ec..HEAD -- docs/lab2/golden/queries.jsonl` — порожньо
- Модель і провайдер: `google · gemini-3.5-flash-lite`, Chat Completions-форма Gemini API, free tier, типова температура — як у [baseline.md](baseline.md)
- Промпт: той самий системний промпт (`SYSTEM_PROMPT`, тест `tests/eval-run.test.ts` перевіряє збіг символ у символ), у
  повідомлення користувача додано блок `Фрагменти документів:` + топ-k фрагментів із `[id]` + `Питання: <query>`
- k (фрагментів у контексті): **5** — гібридний пошук кроку 05 (BM25 + вектор `gemini-embedding-2@768`, RRF k = 60)
- Правило вердиктів: дослівно з baseline.md (spec.md, розділ 6, + 5 уточнень); вердикти ставив **я**; звірку кожної
  відповіді з `expected` підготував агент, як і на кроці 01
- Нова колонка: «цитата правильна» — `true`, якщо процитовано фрагмент документа з `must_cite`, у якому є наведені
  факти; `false` — немає цитати або відмова на запиті з відповіддю; для unanswerable не ставиться
- Чим цей прогін відрізняється від базової лінії, крім контексту: **нічим** у моделі, промпті, температурі, паузі й
  повторах. Змінилась лише бухгалтерія скрипта (запис hits, recall, RR, полів для вердиктів, режим `--summary`)
- Доказ однакової методики: `git diff --no-index scripts/baseline.ts scripts/eval-run.ts` на коміті головного прогону
  `65ac957` (нижче). Змістова зміна в diff одна — рядок виклику моделі `text: query` → `text: withContext(query, context)`
  і пошук перед ним; рядків `SYSTEM_PROMPT =`, `SPEC =`, `URL =`, `PAUSE_MS =` серед змінених немає
- Сирий результат: [`docs/lab2/eval-run.json`](eval-run.json) (коміт `f105323`); «після виправлень» —
  [`docs/lab2/eval-run-after.json`](eval-run-after.json) (коміт `95ad7a3`)
- Траса прогону (термінальний вивід із токенами, вартістю й затримкою — рішення автора замість Langfuse):
  [`traces/eval-run-terminal.txt`](traces/eval-run-terminal.txt), [`traces/eval-run-after-terminal.txt`](traces/eval-run-after-terminal.txt);
  скріншот — `traces/eval-run.png`

<details>
<summary>git diff --no-index scripts/baseline.ts scripts/eval-run.ts (коміт 65ac957)</summary>

```diff
diff --git a/scripts/baseline.ts b/scripts/eval-run.ts (65ac957)
index 008074c..55ead91 100644
--- a/scripts/baseline.ts
+++ b/scripts/eval-run.ts (65ac957)
@@ -1,23 +1,31 @@
 /**
- * Базова лінія без пошуку (крок 01). ХОДИТЬ У МЕРЕЖУ — лише вручну, з кореня репозиторію:
+ * Прогін еталонного набору з пошуком (крок 06). КОПІЯ scripts/baseline.ts: єдина змістова відмінність —
+ * у повідомлення користувача додано знайдені фрагменти. Доказ — git diff --no-index scripts/baseline.ts
+ * scripts/eval-run.ts. Модель, провайдер, системний промпт, температура (типова), пауза й повтори — ті самі.
  *
- *   npx tsx --env-file=.env.local scripts/baseline.ts docs/lab2/golden/queries.jsonl
- *
- * Модель отримує ТІЛЬКИ текст питання: жодного документа чи фрагмента з corpus/.
- * Сирі відповіді дописуються в docs/lab2/traces/baseline-<дата й час>.jsonl — за ними людина
- * ставить вердикти в docs/lab2/baseline.md. Таблиця й підсумок — у stdout.
- *
- * Методику (модель, системний промпт, форма API, облік токенів) крок 06 повторює слово в слово;
- * змінюється лише те, що в повідомлення користувача додаються знайдені фрагменти.
+ *   npx tsx --env-file=.env.local scripts/eval-run.ts docs/lab2/golden/queries.jsonl
+ *       ХОДИТЬ У МЕРЕЖУ. Проганяє запити, рахує recall@5 і MRR@5, пише docs/lab2/eval-run.json
+ *       з порожніми verdict / baselineVerdict / citationCorrect / injectionResisted — їх ставить людина.
+ *   npx tsx scripts/eval-run.ts --summary docs/lab2/eval-run.json
+ *       БЕЗ МЕРЕЖІ. Читає заповнені вердикти й друкує рядки для docs/lab2/eval-report.md.
  */
-import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
+import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
 
 import { chatCompletionsModel } from '../src/agent/adapters';
 import type { Model } from '../src/agent/agent-loop';
 import { addUsage, priceUsd, ZERO_USAGE, type Usage } from '../src/cost';
+import { mean, proportionCI95, recallAtK, reciprocalRank, transitions, type Hit, type Verdict } from '../src/metrics';
 import { CATALOG } from '../src/models';
+import { citedIds, renderContext } from '../src/rag/cite';
+import { geminiEmbedder } from '../src/rag/embed';
+import { bm25From, hybridSearch } from '../src/rag/search';
+import { loadIndex } from '../src/rag/store';
 import { validateGolden, type Entry } from './validate-golden';
 
+/** Те саме k, що в пошуку кроку 05 (топ-5 у контекст моделі). */
+const K = 5;
+const OUT = 'docs/lab2/eval-run.json';
+
 /**
  * Системний промпт — однаковий для базової лінії і кроку 06. Правило про фрагменти тут
  * свідомо: без фрагментів воно не діє, а з ними вмикається без зміни промпту.
@@ -52,16 +60,34 @@ export function isTransient(message: string): boolean {
   return /HTTP (429|500|502|503|504)\b/.test(message);
 }
 
-export interface BaselineRow {
+export interface EvalRow {
   readonly id: string;
   readonly tags: Entry['tags'];
   readonly query: string;
+  readonly must_cite: readonly string[];
+  /** Топ-K фрагментів у порядку ранжування — те, що побачила модель. */
+  readonly hits: readonly Hit[];
+  readonly recallAtK: number | null;
+  readonly reciprocalRank: number | null;
   readonly answer: string;
+  /** id, які процитувала модель (розбір citedIds з кроку 05). */
+  readonly cited: readonly string[];
   readonly usage: Usage;
+  /** Лише виклик моделі — так само, як у базовій лінії. */
   readonly latencyMs: number;
+  /** Пошук: ембедінг запиту + гібрид; окремо, щоб latencyMs лишалась порівнянною з базовою лінією. */
+  readonly searchMs: number;
   readonly retried: boolean;
   readonly model: string;
   readonly ts: string;
+  /** Заповнює ЛЮДИНА за правилом baseline.md. */
+  verdict: Verdict | null;
+  /** Переписано з таблиці baseline.md — для таблиці переходів. */
+  baselineVerdict: Verdict | null;
+  /** Чи процитовано документ із must_cite і чи підтримує цитата відповідь (людина). */
+  citationCorrect: boolean | null;
+  /** Лише для тегу injection: чи відбито вкладену вказівку (людина). */
+  injectionResisted: boolean | null;
 }
 
 /** Медіана; порожній масив — NaN, щоб відсутність даних не виглядала як нуль. */
@@ -80,9 +106,14 @@ export function cell(text: string, max = 120): string {
 
 const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
 
-async function ask(model: Model, query: string): Promise<{ text: string; usage: Usage; latencyMs: number }> {
+/** ЄДИНА змістова відмінність від базової лінії: перед питанням — знайдені фрагменти (як у search.ts --answer). */
+export function withContext(query: string, context: string): string {
+  return `Фрагменти документів:\n\n${context}\n\nПитання: ${query}`;
+}
+
+async function ask(model: Model, query: string, context: string): Promise<{ text: string; usage: Usage; latencyMs: number }> {
   const started = performance.now();
-  const turn = await model(SYSTEM_PROMPT, [{ role: 'user', text: query }], []);
+  const turn = await model(SYSTEM_PROMPT, [{ role: 'user', text: withContext(query, context) }], []);
   return { text: turn.text, usage: turn.usage, latencyMs: performance.now() - started };
 }
 
@@ -102,28 +133,36 @@ async function main(): Promise<void> {
   const key = process.env.GEMINI_API_KEY;
   if (!key) throw new Error('GEMINI_API_KEY порожній: заповніть .env.local');
   const model = chatCompletionsModel({ url: URL, model: SPEC.id, headers: { authorization: `Bearer ${key}` } });
+  const embedder = geminiEmbedder(768);
+  const index = loadIndex('data/index.json', embedder);
+  const words = bm25From(index);
 
   // Час у назві: перерваний прогін не змішується з повторним — часткове перезняття не приймається.
   const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
-  const out = `docs/lab2/traces/baseline-${stamp}.jsonl`;
+  const out = `docs/lab2/traces/eval-run-${stamp}.jsonl`;
   mkdirSync('docs/lab2/traces', { recursive: true });
 
   console.log(`Модель: ${SPEC.provider} · ${SPEC.id} · Chat Completions`);
-  console.log(`Набір: ${file}, запитів ${entries.length}; документів у контексті: 0`);
+  console.log(`Набір: ${file}, запитів ${entries.length}; у контексті: топ-${K} фрагментів гібридного пошуку (${index.embedder})`);
   console.log(`Сирі відповіді: ${out}\n`);
   console.log('Системний промпт дослівно:');
   console.log(SYSTEM_PROMPT.split('\n').map((l) => `> ${l}`).join('\n'));
-  console.log('\n| id | tags | затримка, мс | вхідні | вихідні | повтор | відповідь (коротко) |');
-  console.log('|---|---|---|---|---|---|---|');
+  console.log(`\n| id | tags | recall@${K} | RR | затримка, мс | вхідні | вихідні | повтор | відповідь (коротко) |`);
+  console.log('|---|---|---|---|---|---|---|---|---|');
 
-  const rows: BaselineRow[] = [];
+  const rows: EvalRow[] = [];
   for (const [i, entry] of entries.entries()) {
     if (i > 0) await sleep(PAUSE_MS);
+    const searchStarted = performance.now();
+    const found = await hybridSearch(index, words, embedder, entry.query, K);
+    const searchMs = Math.round(performance.now() - searchStarted);
+    const hits: Hit[] = found.map((h) => ({ docId: h.chunk.docId, chunkId: h.chunk.id }));
+    const context = renderContext(found.map((h) => h.chunk));
     let retries = 0;
     let result: Awaited<ReturnType<typeof ask>> | undefined;
     while (result === undefined) {
       try {
-        result = await ask(model, entry.query);
+        result = await ask(model, entry.query, context);
       } catch (error) {
         const message = error instanceof Error ? error.message : String(error);
         // не тимчасова помилка або вичерпано повтори — зупиняємо прогін: квоту не палимо
@@ -135,24 +174,37 @@ async function main(): Promise<void> {
       }
     }
     const retried = retries > 0;
-    const row: BaselineRow = {
+    const answerable = entry.must_cite.length > 0;
+    const row: EvalRow = {
       id: entry.id,
       tags: entry.tags,
       query: entry.query,
+      must_cite: entry.must_cite,
+      hits,
+      recallAtK: answerable ? recallAtK(hits, entry.must_cite, K) : null,
+      reciprocalRank: answerable ? reciprocalRank(hits, entry.must_cite, K) : null,
       answer: result.text,
+      cited: citedIds(result.text),
       usage: result.usage,
       latencyMs: Math.round(result.latencyMs),
+      searchMs,
       retried,
       model: SPEC.id,
       ts: new Date().toISOString(),
+      verdict: null,
+      baselineVerdict: null,
+      citationCorrect: null,
+      injectionResisted: null,
     };
     rows.push(row);
     appendFileSync(out, `${JSON.stringify(row)}\n`, 'utf8');
     const u = row.usage;
+    const num = (x: number | null) => (x === null ? '—' : x.toFixed(2));
     console.log(
-      `| ${row.id} | ${row.tags.join(', ')} | ${row.latencyMs} | ${u.inputTokens} | ${u.outputTokens} | ${retried ? 'так' : '—'} | ${cell(row.answer)} |`,
+      `| ${row.id} | ${row.tags.join(', ')} | ${num(row.recallAtK)} | ${num(row.reciprocalRank)} | ${row.latencyMs} | ${u.inputTokens} | ${u.outputTokens} | ${retried ? 'так' : '—'} | ${cell(row.answer)} |`,
     );
   }
+  writeFileSync(OUT, `${JSON.stringify({ runAt: new Date().toISOString(), k: K, setFile: file, model: SPEC.id, embedder: index.embedder, rows }, null, 2)}\n`, 'utf8');
 
   const total = rows.reduce((acc, r) => addUsage(acc, r.usage), ZERO_USAGE);
   const latencies = rows.filter((r) => !r.retried).map((r) => r.latencyMs);
@@ -162,10 +214,57 @@ async function main(): Promise<void> {
   console.log(`- Токени (вхід / вихід, сумарно): ${total.inputTokens} / ${total.outputTokens}`);
   console.log(`- Вартість прогону за прайсом models.ts: ${usd.toFixed(6)} (на 100 запитів: ${((usd / rows.length) * 100).toFixed(4)})`);
   console.log(`- Медіана затримки (без повторів): ${(median(latencies) / 1000).toFixed(2)} с`);
+  console.log(`- Медіана затримки пошуку: ${(median(rows.map((r) => r.searchMs)) / 1000).toFixed(2)} с`);
+  console.log(`\nЗаписано ${OUT}. Далі: verdict, baselineVerdict, citationCorrect, injectionResisted — рукою; потім --summary.`);
+}
+
+/** Підсумок для eval-report.md — БЕЗ МЕРЕЖІ, лише з заповненого eval-run.json. */
+export function summary(data: { k: number; rows: readonly EvalRow[] }): string[] {
+  const lines: string[] = [];
+  const missing = data.rows.filter((r) => r.verdict === null).map((r) => r.id);
+  if (missing.length > 0) throw new Error(`не поставлено verdict: ${missing.join(', ')} — підсумок був би неповним`);
+
+  const answerable = data.rows.filter((r) => r.must_cite.length > 0);
+  const unanswerable = data.rows.filter((r) => r.must_cite.length === 0);
+  const injection = data.rows.filter((r) => r.tags.includes('injection'));
+  const correct = answerable.filter((r) => r.verdict === 'correct').length;
+  const ci = proportionCI95(correct, answerable.length);
+  const notRefused = data.rows.filter((r) => r.verdict !== 'refused');
+  const withCitation = notRefused.filter((r) => r.cited.length > 0).length;
+  const citedRight = answerable.filter((r) => r.citationCorrect === true).length;
+  const total = data.rows.reduce((acc, r) => addUsage(acc, r.usage), ZERO_USAGE);
+  const usd = priceUsd(SPEC, total);
+  const latencies = data.rows.filter((r) => !r.retried).map((r) => r.latencyMs);
+  const pct = (a: number, b: number) => `${b === 0 ? '—' : ((100 * a) / b).toFixed(1)}%`;
+
+  lines.push(`| Точність на відповідних запитах (correct / ${answerable.length}) | ${correct} / ${answerable.length} = ${pct(correct, answerable.length)} |`);
+  lines.push(`| Правильні відмови (unanswerable) | ${unanswerable.filter((r) => r.verdict === 'refused').length} із ${unanswerable.length} |`);
+  lines.push(`| Стійкість до injection | ${injection.filter((r) => r.injectionResisted === true).length} із ${injection.length} |`);
+  lines.push(`| Частка відповідей із цитатою (крім відмов) | ${withCitation} / ${notRefused.length} = ${pct(withCitation, notRefused.length)} |`);
+  lines.push(`| Частка відповідей із правильною цитатою (відповідні запити) | ${citedRight} / ${answerable.length} = ${pct(citedRight, answerable.length)} |`);
+  lines.push(`| Токени (вхід / вихід, сумарно) | ${total.inputTokens} / ${total.outputTokens} |`);
+  lines.push(`| Вартість прогону: факт / за прайсом models.ts | $0 (free tier) / ${usd.toFixed(6)} (на 100 запитів: ${((usd / data.rows.length) * 100).toFixed(4)}) |`);
+  lines.push(`| Медіана затримки моделі (без повторів) | ${(median(latencies) / 1000).toFixed(2)} с |`);
+  lines.push(`| Медіана затримки пошуку | ${(median(data.rows.map((r) => r.searchMs)) / 1000).toFixed(2)} с |`);
+  lines.push(`| recall@${data.k} | ${mean(answerable.map((r) => r.recallAtK ?? 0)).toFixed(2)} |`);
+  lines.push(`| MRR@${data.k} | ${mean(answerable.map((r) => r.reciprocalRank ?? 0)).toFixed(2)} |`);
+  lines.push('');
+  lines.push(`Інтервал точності: ${(100 * ci.p).toFixed(0)}% ± ${(100 * ci.halfWidth).toFixed(0)} п. п. (нормальне наближення, n = ${answerable.length}, обчислено).`);
+  lines.push('');
+  const before = Object.fromEntries(data.rows.filter((r) => r.baselineVerdict !== null).map((r) => [r.id, r.baselineVerdict as Verdict]));
+  const after = Object.fromEntries(data.rows.map((r) => [r.id, r.verdict as Verdict]));
+  lines.push('| було | стало | скільки | запити |');
+  lines.push('|---|---|---|---|');
+  for (const t of transitions(before, after)) lines.push(`| ${t.from} | ${t.to} | ${t.ids.length} | ${t.ids.join(', ')} |`);
+  return lines;
 }
 
-if (process.argv[1]?.endsWith('baseline.ts')) {
-  main().catch((error: unknown) => {
+if (process.argv[1]?.endsWith('eval-run.ts')) {
+  const [first, second] = process.argv.slice(2);
+  const job = first === '--summary'
+    ? Promise.resolve().then(() => console.log(summary(JSON.parse(readFileSync(second ?? OUT, 'utf8'))).join('\n')))
+    : main();
+  job.catch((error: unknown) => {
     console.error(error instanceof Error ? error.message : error);
     process.exit(1);
   });
```

</details>

## Два числа поруч
| Показник | Базова лінія (крок 01) | З пошуком (крок 06) | Після виправлень* |
|---|---|---|---|
| Точність на відповідних запитах (correct / 17) | 6 / 17 = 35,3% | **9 / 17 = 52,9%** | 10 / 17 = 58,8% |
| Правильні відмови (unanswerable) | 0 із 3 | **3 із 3** | 3 із 3 |
| Стійкість до injection | 0 із 2 | **2 із 2** | 2 із 2 |
| Частка відповідей із цитатою (крім відмов) | 0% — цитувати нема що | **15 / 15 = 100%** | 17 / 17 = 100% |
| Частка відповідей із правильною цитатою | — немає цитат | **15 / 17 = 88,2%** | 17 / 17 = 100% |
| Токени (вхід / вихід, сумарно) | 2 990 / 9 605 | 13 987 / 3 271 | 23 862 / 3 528 |
| Вартість: факт / за прайсом models.ts | $0 / $0.024910 ($0.1245 на 100) | $0 / $0.012374 (**$0.0619** на 100) | $0 / $0.015979 ($0.0799 на 100) |
| Медіана затримки моделі (без повторів) | 6,46 с | **0,98 с** | 1,08 с |
| Медіана затримки пошуку | — етапу пошуку немає | 0,39 с | 0,38 с |
| recall@5 | — етапу пошуку немає | **0,95** | 0,93 |
| MRR@5 | — етапу пошуку немає | **0,87** | 0,85 |

Інтервал точності: 53% ± 24 п. п. (нормальне наближення, n = 17, обчислено); після виправлень — 59% ± 23 п. п.
(нормальне наближення, n = 17, обчислено). Інтервали перекриваються з базовою лінією (35% ± 23 п. п., те саме n,
обчислено).

\* Після виправлень, **підібраних на цьому самому наборі** (правило фрагментації версії 2 — [indexing.md](indexing.md),
«Версія 2»): число не незалежне, бо набір бачив правку.

Вартість на 100 запитів упала вдвічі, хоча вхід зріс у 4,7 раза: з документами модель відповідає коротше (вихід 9 605
→ 3 271 токен), а вихід у 8 разів дорожчий за вхід. Медіана моделі впала з 6,46 до 0,98 с з тієї ж причини.

## Що саме змінив пошук
Базова лінія → з пошуком (головний прогін), на тих самих запитах:

| було | стало | скільки | запити |
|---|---|---|---|
| correct | correct | 5 | q-03, q-07, q-08, q-09, q-14 |
| partial | correct | 4 | q-04, q-06, q-10, q-19 |
| partial | partial | 3 | q-05, q-11, q-12 |
| wrong | refused | 3 | q-16, q-17, q-18 |
| partial | refused | 2 | q-01, q-02 |
| refused | partial | 1 | q-13 |
| correct | partial | 1 | q-15 |
| wrong | partial | 1 | q-20 |

Регресії — кожна окремо:
- **q-01** (partial → refused): у топ-5 потрапили `add-user-with-key#0000` (лише назва) і `#0001` (лише опис), а
  `#0002` із командами — ні; модель чесно сказала, що команд у фрагментах немає. Без пошуку модель хоч частково
  відповідала із загальних знань.
- **q-02** (partial → refused): те саме — `#0002` на 6-му місці після RRF.
- **q-15** (correct → partial): `check-open-ports` не потрапив у топ-5 (recall 0,5), тож без `ss -tulpn`; без пошуку
  модель знала команду сама.

Після виправлень (v1 → v2): q-01 refused → correct, q-12 partial → correct, q-02 refused → partial; **регресія**
q-10 correct → partial — фрагмент той самий і в топ-1, але модель цього разу не навела `certbot --nginx`.

## Помилки
Кожен id — permalink на рядок `queries.jsonl` на SHA заморозки. Класифікація — за процедурою курсу: indexing → retrieval → query →
generation, зупинка на першій, що зійшлася. Ранги — з [`traces/eval-explain-2026-10-25.txt`](traces/eval-explain-2026-10-25.txt).

| # | id | клас | що сталося | доказ класифікації | що спробували | результат спроби |
|---|---|---|---|---|---|---|
| 1 | [q-01](https://github.com/VitaliySysak/AI-engineering/blob/d6827ec8ea2d8487b37ad465c7d996b25aa55bd1/docs/lab2/golden/queries.jsonl#L1) | retrieval | refused: команд немає в контексті | відповідь цілком є в одному фрагменті `add-user-with-key#0002` (не indexing); вектор ставить його **1-м**, BM25 — нижче 10-го, після RRF — **6-й**, поза k = 5; місця забрали `#0000` і `#0001` того ж документа | інші межі фрагментів (indexing.md, «Версія 2»): назва й опис приклеєні до команд | фрагмент `add-user-with-key#0000` (836 симв., усі команди) — 1-й; вердикт refused → **correct** |
| 2 | [q-02](https://github.com/VitaliySysak/AI-engineering/blob/d6827ec8ea2d8487b37ad465c7d996b25aa55bd1/docs/lab2/golden/queries.jsonl#L2) | retrieval | refused | `#0002`: вектор 2-й, BM25 9-й, RRF 6-й | те саме | refused → **partial**: фрагмент дійшов, але модель не навела рядок `ALL=(ALL:ALL) ALL` — далі вже generation |
| 3 | [q-15](https://github.com/VitaliySysak/AI-engineering/blob/d6827ec8ea2d8487b37ad465c7d996b25aa55bd1/docs/lab2/golden/queries.jsonl#L15) | retrieval | partial: немає `ss -tulpn` | `check-open-ports#0002`: вектор 9-й, BM25 — немає (у запиті «слухає… IPv4, IPv6», у документі «відкритих портів», «підключень» — жодного спільного слова), RRF 10-й; при k = 10 потрапляє | те саме | recall@5 0,5 → 0,5, вердикт partial → partial: **не допомогло** — запит про два документи, а nginx-фрагменти займають топ |
| 4 | [q-05](https://github.com/VitaliySysak/AI-engineering/blob/d6827ec8ea2d8487b37ad465c7d996b25aa55bd1/docs/lab2/golden/queries.jsonl#L5) | generation | partial: лише `enable-linger`, немає `systemctl --user enable docker` і `DOCKER_HOST` | recall@5 = 1, фрагмент `install-docker#0002` (v1) / `#0000` (v2) — **1-й** в обох прогонах, усі три факти в ньому є | інші межі (v2: увесь документ одним фрагментом) | partial → partial: **не допомогло** — модель відповідає на вузьке питання однією командою |
| 5 | [q-11](https://github.com/VitaliySysak/AI-engineering/blob/d6827ec8ea2d8487b37ad465c7d996b25aa55bd1/docs/lab2/golden/queries.jsonl#L11) | retrieval | partial: немає `apt install nginx` | recall@5 0,67: `install-nginx` поза топ-5 (місця забрали `install-docker`, `local-port-forward`) | v2 | recall@5 0,67 → **0,33** (випав і `install-certbot`), вердикт partial → partial: **гірше** за пошуком |
| 6 | [q-10](https://github.com/VitaliySysak/AI-engineering/blob/d6827ec8ea2d8487b37ad465c7d996b25aa55bd1/docs/lab2/golden/queries.jsonl#L10) | generation | регресія після v2: correct → partial, немає `certbot --nginx` | recall@5 = 1, `install-certbot#0000` — 1-й, команда в ньому є; у прогоні v1 той самий зміст дав correct | — (не виправляли) | нестабільність генерації: без зміни промпту чи моделі не лікується |

Висновок розбору: 4 з 6 помилок — **retrieval**, і три з них (q-01, q-02, q-11) спричинило злиття: RRF піднімає
фрагмент, який знайшли обидві гілки, навіть коли він не містить відповіді, а фрагменти «лише назва» правила v1
додавали таких кандидатів. Правило v2 прибрало їх і виправило q-01, але не q-11 і q-15 (запити на кілька документів
при k = 5). Помилки **generation** (q-05, q-10, частково q-02) не залежать від пошуку: потрібний фрагмент був першим.

## Звірка з вимірюваними цілями spec.md
| Ціль зі spec.md | Поріг | Результат (головний прогін) | Досягнуто? |
|---|---|---|---|
| G1. Точність — частка `correct` на `queries.jsonl` | ≥ 80% | 52,9% (9 / 17); після виправлень 58,8% | **ні** |
| G2. Частка відповідей із цитатою (крім відмов) | 100% | 100% (15 / 15) | так |
| G3. Правильні відмови на `unanswerable` | 100% | 100% (3 / 3) | так |
| G4. Медіана затримки на запит | ≤ 5 с | 0,98 с модель + 0,39 с пошук ≈ 1,4 с | так |
| G5. Вартість на 100 запитів (за прайсом) | ≤ $0.20 | $0.0619 | так |
| A6. G1–G3 досягнуто в підсумку eval-report.md | G1, G2, G3 | G1 — ні | **ні** |
| A7. Жоден `injection` не виконує вкладену інструкцію | 2 / 2 | 2 / 2 (q-20 — моє рішення «відбито», хоча `chmod` модель пропустила в обох прогонах) | так, з застереженням |

## Межі вимірювання
- Запитів 20, з них у метриках пошуку й точності — 17. Один запит = 5,9 п. п. точності; інтервал ± 23–24 п. п.
  (обчислено). Цей розмір **не може** показати різницю між 52,9% і 58,8% (1 запит): зміну «з пошуком → після
  виправлень» вважаю **нерозрізненною**. Різниця 35,3% → 52,9% (3 запити) — теж у межах перекриття інтервалів; надійно
  розрізнені лише відмови (0 → 3 із 3) і injection (0 → 2 із 2) — та й то на 3 і 2 запитах.
- Запити, на які модель відповідала правильно без документів (baseline.md): q-03, q-07, q-08, q-09, q-14, q-15 —
  приросту на них не було й не могло бути; на q-15 пошук навіть зашкодив.
- recall@5 рахується **за документом**, а не за фрагментом: на q-01 / q-02 recall = 1, хоча фрагмент із відповіддю
  не дійшов до моделі. Через це recall@5 0,95 завищує якість пошуку за правила v1.
- Генерація недетермінована (типова температура, як у базовій лінії): q-10 дав correct і partial на тому самому
  фрагменті. Один прогін на запит — один вимір.
- Вердикти ставила одна людина за звіркою, яку підготував агент; другого оцінювача немає.
- Чого набір не покриває: запитів англійською, запитів з опечатками, довгих діалогів, запитів, де відповідь розкидана
  по 3+ документах (є лише q-11), і корпусу більшого за 10 документів.

## Підсумок
На тому самому наборі (SHA `d6827ec`), тій самій моделі `gemini-3.5-flash-lite`, тому самому промпті й правилі
вердиктів додавання топ-5 фрагментів гібридного пошуку змінило: правильні відмови **0 → 3 із 3**, стійкість до
injection **0 → 2 із 2**, частка відповідей із цитатою **0 → 100%**, точність **6 → 9 із 17** (35,3% → 52,9%, у межах
похибки n = 17), вартість на 100 запитів $0.1245 → $0.0619, медіана моделі 6,46 → 0,98 с; регресії — q-01, q-02, q-15,
усі через те, що фрагмент із відповіддю не дійшов до моделі. Ціль G1 (≥ 80%) **не досягнуто**; правка фрагментації,
підібрана на цьому ж наборі, дала 10 із 17 (58,8%) — нерозрізненно на цьому розмірі. Перевірити: `npx tsx scripts/eval-run.ts --summary docs/lab2/eval-run.json`.
