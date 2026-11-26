/**
 * Мультиагентне питання про чужий проєкт (Лабораторна 4, крок 03). ХОДИТЬ У МЕРЕЖУ — запускає автор:
 *
 *   npx tsx --env-file=.env.local scripts/multi/run-multi.ts --mode both
 *   npx tsx --env-file=.env.local scripts/multi/run-multi.ts --mode fanout --only q1 --token-ceiling 5000   # зупинка бюджетом
 *   npx tsx --env-file=.env.local scripts/multi/run-multi.ts --check   # по одному короткому виклику кожної моделі
 *
 * Читачі й звідник — Gemini (CATALOG['gemini-3.5-flash-lite'], ключ GEMINI_API_KEY);
 * верифікатор — інша родина: OpenRouter, модель з OPENROUTER_MODEL (ключ OPENROUTER_API_KEY).
 * Корінь читання — форк axios (--fork, типово ../axios). Писати скрипт може лише в docs/lab4/.
 * Відмова за квотою відкриває circuit breaker (.harness/breaker-multi.json) і зупиняє чергу кодом 2.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { trace } from '@opentelemetry/api';
import { generateText } from 'ai';

import { mayRun, recordOutcome } from '../../src/harness/breaker';
import { CATALOG } from '../../src/models';
import { ask, type Mode } from '../../src/multi/ask';
import { DEFAULT_BUDGET, describeError, type Budget } from '../../src/multi/budget';
import { QuotaError } from '../../src/multi/fanout';
import { parseQuestions } from '../../src/multi/question';
import { startTelemetry } from '../../src/telemetry/otel';

export const BREAKER_MULTI = '.harness/breaker-multi.json';
export const QUESTIONS = 'docs/lab4/multi-questions.jsonl';

const flag = (name: string): string | undefined => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : undefined;
};
const num = (name: string, fallback: number) => {
  const v = flag(name);
  return v === undefined ? fallback : Number(v);
};

/**
 * Безкоштовний рівень Gemini обмежує запити на хвилину. Усі гілки ділять один ліміт:
 * старти запитів розводяться не частіше ніж раз на 60000 / RPM мс. Паралельні гілки
 * тому впираються в ліміт — це частина виміру, а не похибка (docs/lab4/multiagent.md).
 */
export function rateLimitedFetch(rpm: number, base: typeof fetch = fetch): typeof fetch {
  const gap = Math.ceil(60_000 / rpm);
  let next = 0;
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const now = Date.now();
    const at = Math.max(now, next);
    next = at + gap;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
    return base(input, init);
  }) as typeof fetch;
}

/**
 * Перемикач розгалуження (вердикт кроку 03 — «не окупилося», docs/lab4/multiagent.md): без --mode питання йде
 * одним агентом; розгалуження вмикає лише MULTI_FANOUT=1. --mode both — режим виміру для таблиці.
 */
export function selectModes(mode: string | undefined, fanoutFlag: string | undefined): Mode[] {
  if (mode === 'both') return ['single', 'fanout'];
  if (mode === 'single' || mode === 'fanout') return [mode];
  if (mode !== undefined) throw new Error(`--mode: single | fanout | both, а не ${mode}`);
  return [fanoutFlag === '1' ? 'fanout' : 'single'];
}

/** Скільки разів повторювати 503 і з якими паузами, мс. */
export const RETRY_503_DELAYS = [5_000, 15_000];

/**
 * 503 «high demand» — тимчасове перевантаження моделі, а не квота: такий запит повторюємо до двох разів.
 * 429 НЕ повторюємо — квоту лікує не повтор, а circuit breaker. Кожен повтор іде через той самий ліміт RPM.
 */
export function retry503Fetch(base: typeof fetch, delays: readonly number[] = RETRY_503_DELAYS, onRetry: (attempt: number) => void = () => {}): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    for (let attempt = 0; ; attempt++) {
      const res = await base(input, init);
      if (res.status !== 503 || attempt >= delays.length) return res;
      onRetry(attempt + 1);
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }) as typeof fetch;
}

/** Верифікатор мусить бути іншої родини, ніж читачі (Gemini). */
export function assertNotGemini(modelId: string): void {
  if (/gemini|gemma|google\//i.test(modelId)) throw new Error(`верифікатор ${modelId} — тієї самої родини, що й читачі (Google)`);
}

async function main(): Promise<void> {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const orKey = process.env.OPENROUTER_API_KEY;
  const orModel = process.env.OPENROUTER_MODEL?.trim();
  if (!geminiKey) throw new Error('GEMINI_API_KEY порожній');
  if (!orKey || !orModel) throw new Error('OPENROUTER_API_KEY або OPENROUTER_MODEL порожні');
  assertNotGemini(orModel);

  const root = resolve(flag('fork') ?? '../axios');
  if (!existsSync(resolve(root, 'lib/helpers/buildURL.js'))) throw new Error(`${root} — не форк axios`);
  const modes = selectModes(flag('mode'), process.env.MULTI_FANOUT);
  const only = flag('only')?.split(',');
  const questions = parseQuestions(readFileSync(QUESTIONS, 'utf8')).filter((q) => only === undefined || only.includes(q.id));
  const budget: Budget = {
    maxBranches: num('max-branches', DEFAULT_BUDGET.maxBranches),
    maxTurns: num('max-turns', DEFAULT_BUDGET.maxTurns),
    stepsPerBranch: num('steps', DEFAULT_BUDGET.stepsPerBranch),
    tokenCeiling: num('token-ceiling', DEFAULT_BUDGET.tokenCeiling),
    wallClockMs: num('wall-ms', DEFAULT_BUDGET.wallClockMs),
  };
  const rpm = num('rpm', 14);

  let retries503 = 0;
  const google = createGoogleGenerativeAI({ apiKey: geminiKey, fetch: retry503Fetch(rateLimitedFetch(rpm), RETRY_503_DELAYS, () => { retries503++; }) });
  const gemini = google(CATALOG['gemini-3.5-flash-lite'].id);
  const verifier = createOpenRouter({ apiKey: orKey })(orModel);

  if (process.argv.includes('--check')) {
    // Доступність моделей: по одному короткому виклику кожна — без питань і без запису в журнал.
    for (const [name, m] of [['читач/звід', gemini], ['верифікатор', verifier]] as const) {
      try {
        const r = await generateText({ model: m, prompt: 'Відповідай одним словом: ok', maxRetries: 0 });
        console.log(`${name}: ok · ${JSON.stringify(r.text.trim().slice(0, 40))} · in ${r.totalUsage.inputTokens ?? 'не повідомлено'} out ${r.totalUsage.outputTokens ?? 'не повідомлено'}`);
      } catch (error) {
        console.log(`${name}: ПОМИЛКА ${JSON.stringify(describeError(name, error))}`);
      }
    }
    return;
  }

  const telemetry = startTelemetry();
  const tracer = trace.getTracer('lab4-multi');
  console.log(`Читачі/звід: ${CATALOG['gemini-3.5-flash-lite'].id} (≤${rpm} RPM) · верифікатор: ${orModel} · форк: ${root}`);
  console.log(`Бюджет: ${JSON.stringify(budget)} · режими: ${modes.join(', ')} · питань: ${questions.length}\n`);

  let code = 0;
  try {
    for (const q of questions) {
      for (const mode of modes) {
        const gate = mayRun(new Date(), BREAKER_MULTI);
        if (!gate.allow) {
          console.log(`брейкер відкритий: ${gate.why} — зупиняю чергу`);
          code = 2;
          return;
        }
        try {
          const row = await tracer.startActiveSpan(`lab4-multi ${q.id}/${mode}`, async (span) => {
            try {
              return await ask({ mode, q, root, readerModel: gemini, synthModel: gemini, verifierModel: verifier, budget, traceId: span.spanContext().traceId });
            } finally {
              span.end();
            }
          });
          recordOutcome({ ok: true, reason: null }, new Date(), BREAKER_MULTI);
          const v = row.verdicts.map((x) => x.verdict).join(',') || '—';
          console.log(`${q.id} ${mode.padEnd(6)} ${String(row.wallMs).padStart(6)} мс · ходів ${row.spent.calls} · in ${row.spent.input} out ${row.spent.output} · не повідомлено ${row.spent.unreported} · stop ${row.stop}${row.stopRound === null ? '' : `@${row.stopRound}`} · вердикти ${v} · ${row.blocked ? 'ЗАБЛОКОВАНО' : 'записано'} · імпортерів ${row.quality.importers}/${row.quality.importersTotal} · trace ${row.traceId}`);
          for (const e of row.errors) console.log(`   помилка ${e.stage}: ${e.name}${e.status === null ? '' : ` ${e.status}`} — ${e.message}`);
          if (row.blocked) code = Math.max(code, 1);
        } catch (error) {
          if (error instanceof QuotaError) {
            recordOutcome({ ok: false, reason: 'quota' }, new Date(), BREAKER_MULTI);
            console.log(`${q.id} ${mode}: ${error.message} — брейкер відкрито, черга зупинена`);
            code = 2;
            return;
          }
          throw error;
        }
      }
    }
  } finally {
    console.log(`\nПовторів після 503 від Gemini за прогін: ${retries503}`);
    await telemetry.shutdown();
    process.exitCode = code;
  }
}

if (process.argv[1]?.endsWith('run-multi.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
