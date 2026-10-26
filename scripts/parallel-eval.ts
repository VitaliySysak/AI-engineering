/**
 * Вимір паралельності (крок 07). Пул і бюджет — код курсу; гілка — та сама робота, що в scripts/eval-run.ts
 * (гібридний пошук топ-5 + один виклик моделі з тим самим SYSTEM_PROMPT і withContext), але без 13-секундної
 * паузи й без повторів: пауза зробила б ширину пулу безглуздою, а повтор — це вже інша робота з іншими токенами.
 * Помилка гілки (429 / 5xx) не зупиняє прогін — вона записується в failed.
 *
 *   npx tsx --env-file=.env.local scripts/parallel-eval.ts 1    «до»: послідовно
 *   npx tsx --env-file=.env.local scripts/parallel-eval.ts 4    «після»: чотири гілки
 *       ХОДИТЬ У МЕРЕЖУ: 20 ембедінгів запиту + 20 викликів моделі на прогін.
 *
 * Паралелиться ЧИТАННЯ (запити набору). Запис однопотоковий: гілки повертають результат у пам'ять,
 * у docs/lab2/parallel-run.json пише головний потік один раз після пулу (дописує прогін у масив runs).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { chatCompletionsModel } from '../src/agent/adapters';
import { addUsage, priceUsd, ZERO_USAGE, type Usage } from '../src/cost';
import { CATALOG } from '../src/models';
import { renderContext } from '../src/rag/cite';
import { geminiEmbedder } from '../src/rag/embed';
import { bm25From, hybridSearch } from '../src/rag/search';
import { loadIndex } from '../src/rag/store';
import { SYSTEM_PROMPT, withContext } from './eval-run';
import type { Entry } from './validate-golden';

/** БЮДЖЕТ. Записано ДО запуску і дослівно перенесено в docs/lab2/budget.md, розділ 2. */
export interface Budget {
  /** Максимум гілок, що виконуються одночасно. */
  readonly maxBranches: number;
  /** Стеля токенів на весь прогін: нова гілка не стартує, коли її перетнуто. */
  readonly maxTokens: number;
  /** Стеля часу стіни на весь прогін, мс. */
  readonly maxWallMs: number;
}

/** maxBranches — найширший прогін (8); ширину кожного прогону задає аргумент, але не більше за цю межу. */
export const BUDGET: Budget = { maxBranches: 8, maxTokens: 60_000, maxWallMs: 5 * 60_000 };

export interface BranchResult {
  readonly id: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Уся гілка: пошук + модель. */
  readonly ms: number;
  /** З них пошук (ембедінг запиту + гібрид). */
  readonly searchMs: number;
}

/**
 * Пул фіксованої ширини, без зовнішніх залежностей (код курсу).
 * Чому не чистий Promise.all над усіма задачами: по-перше, ширина не обмежена;
 * по-друге, Promise.all відкидається на ПЕРШІЙ помилці (скажімо, 429), і токени
 * гілок, які вже відпрацювали, зникають разом із результатом. Тут кожна гілка
 * ловить свою помилку сама, тож облік зберігається повністю.
 */
export async function runPool<T>(
  tasks: readonly (() => Promise<T>)[],
  budget: Budget,
  spentTokens: () => number,
): Promise<{ results: (T | Error)[]; stoppedEarly: boolean }> {
  const results: (T | Error)[] = new Array(tasks.length);
  const startedAt = performance.now();
  let next = 0;
  let stoppedEarly = false;

  const worker = async (): Promise<void> => {
    while (next < tasks.length) {
      // ПРАВИЛО ЗУПИНКИ: перевіряється перед стартом нової гілки, а не всередині неї.
      if (spentTokens() >= budget.maxTokens || performance.now() - startedAt >= budget.maxWallMs) {
        stoppedEarly = true;
        return;
      }
      const i = next++;
      try {
        results[i] = await tasks[i]!();
      } catch (error) {
        results[i] = error instanceof Error ? error : new Error(String(error));
      }
    }
  };

  const width = Math.max(1, Math.min(budget.maxBranches, tasks.length));
  await Promise.all(Array.from({ length: width }, worker));
  return { results, stoppedEarly };
}

/** Ширина з аргументу: ціле від 1 до BUDGET.maxBranches, інакше — помилка, а не тихе «1». */
export function parseWidth(arg: string | undefined, max = BUDGET.maxBranches): number {
  const width = Number(arg ?? 1);
  if (!Number.isInteger(width) || width < 1 || width > max) {
    throw new Error(`ширина пулу має бути цілим від 1 до ${max}, отримано «${arg}»`);
  }
  return width;
}

/**
 * Коротка причина падіння гілки для звіту. Для 429 від Gemini важлива не перша фраза («You exceeded your
 * current quota…» — однакова для всіх лімітів), а рядок «Quota exceeded for metric: …, limit: …» і «retry in …»:
 * лише з них видно, денний це ліміт чи хвилинний.
 */
export function failureReason(message: string): string {
  const status = /HTTP \d{3}/.exec(message)?.[0];
  const metric = /Quota exceeded for metric: [^\\"\n]+/.exec(message)?.[0];
  const retry = /retry in [\d.]+s/i.exec(message)?.[0];
  if (metric) return [status, metric.trim(), retry].filter(Boolean).join(' · ');
  return message.replace(/\s+/g, ' ').slice(0, 300);
}

const K = 5;
const OUT = 'docs/lab2/parallel-run.json';
const SPEC = CATALOG['gemini-3.5-flash-lite'];
const URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

async function main(): Promise<void> {
  const budget: Budget = { ...BUDGET, maxBranches: parseWidth(process.argv[2]) };

  const entries: Entry[] = readFileSync('docs/lab2/golden/queries.jsonl', 'utf8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Entry);

  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY порожній: заповніть .env.local');
  const model = chatCompletionsModel({ url: URL, model: SPEC.id, headers: { authorization: `Bearer ${key}` } });
  const embedder = geminiEmbedder(768);
  // Індекс читається ОДИН раз до пулу: усі гілки залежать від готового індексу і лише читають його.
  const index = loadIndex('data/index.json', embedder);
  const words = bm25From(index);

  let spent = 0;

  const tasks = entries.map((entry) => async (): Promise<BranchResult> => {
    const started = performance.now();
    const found = await hybridSearch(index, words, embedder, entry.query, K);
    const searchMs = Math.round(performance.now() - started);
    const context = renderContext(found.map((h) => h.chunk));
    const turn = await model(SYSTEM_PROMPT, [{ role: 'user', text: withContext(entry.query, context) }], []);
    // Облік — Usage нашого адаптера (fromChatUsage над полем usage відповіді Chat Completions), а не totalUsage
    // AI SDK: модель тут викликається без SDK. Один виклик на гілку, тож це і є підсумок гілки.
    const { inputTokens, outputTokens } = turn.usage;
    spent += inputTokens + outputTokens;
    return { id: entry.id, inputTokens, outputTokens, ms: Math.round(performance.now() - started), searchMs };
  });

  console.log(`Модель: ${SPEC.provider} · ${SPEC.id} · ширина пулу ${budget.maxBranches} · запитів ${entries.length}`);
  console.log(`Бюджет: maxTokens ${budget.maxTokens}, maxWallMs ${budget.maxWallMs}\n`);

  // ЧАС СТІНИ міряється саме тут — навколо пулу. Облік токенів часу не дає.
  const wallStart = performance.now();
  const { results, stoppedEarly } = await runPool(tasks, budget, () => spent);
  const wallMs = Math.round(performance.now() - wallStart);

  const ok = results.filter((r): r is BranchResult => r !== undefined && !(r instanceof Error));
  const failed = results.flatMap((r, i) => (r instanceof Error ? [`${entries[i]?.id}: ${failureReason(r.message)}`] : []));
  // гілки, які правило зупинки не пустило на старт: у results на їхньому місці дірка
  const notStarted = tasks.length - ok.length - failed.length;
  const sumBranchMs = ok.reduce((n, r) => n + r.ms, 0);
  const total: Usage = ok.reduce((acc, r) => addUsage(acc, { inputTokens: r.inputTokens, cachedTokens: 0, outputTokens: r.outputTokens }), ZERO_USAGE);
  const usd = priceUsd(SPEC, total);

  const run = {
    runAt: new Date().toISOString(),
    model: SPEC.id,
    embedder: index.embedder,
    budget,
    wallMs,
    sumBranchMs,
    inputTokens: total.inputTokens,
    outputTokens: total.outputTokens,
    priceUsd: Number(usd.toFixed(6)),
    done: ok.length,
    failed,
    notStarted,
    stoppedEarly,
    branches: ok,
  };

  // Єдиний запис — тут, після пулу, з головного потоку. Попередні прогони (інші ширини) зберігаються.
  const previous: { runs: unknown[] } = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { runs: [] };
  writeFileSync(OUT, `${JSON.stringify({ runs: [...previous.runs, run] }, null, 2)}\n`, 'utf8');

  console.log('| id | гілка, мс | з них пошук, мс | вхідні | вихідні |');
  console.log('|---|---|---|---|---|');
  for (const b of ok) console.log(`| ${b.id} | ${b.ms} | ${b.searchMs} | ${b.inputTokens} | ${b.outputTokens} |`);
  for (const f of failed) console.log(`ПОМИЛКА ${f}`);
  console.log('');
  console.log(`ширина ${budget.maxBranches} · час стіни ${wallMs} мс · сума гілок ${sumBranchMs} мс · прискорення ${(sumBranchMs / wallMs).toFixed(2)}×`);
  console.log(`токени ${total.inputTokens} / ${total.outputTokens} · за прайсом $${usd.toFixed(6)} · завершено ${ok.length}, впало ${failed.length}, не стартувало ${notStarted} · зупинено за бюджетом: ${stoppedEarly ? 'так' : 'ні'}`);
  console.log(`Дописано в ${OUT}`);
}

if (process.argv[1]?.endsWith('parallel-eval.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
