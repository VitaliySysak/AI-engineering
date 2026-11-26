/**
 * Одне мультиагентне питання від початку до кінця (Лабораторна 4, крок 03):
 * читання (паралельно або однією гілкою) → fan-in з перевіркою меж → звід → верифікатор → єдина смуга запису.
 *
 * Правило зупинки (рішення автора, docs/lab4/multiagent.md):
 *  - бюджет спрацював на раунді читання → решту гілок скасовано (AbortController / раунд не стартує);
 *  - якщо хоч одна смуга прийшла і бюджет ще дозволяє звід — зводимо ЧАСТКОВЕ й позначаємо відповідь НЕПОВНОЮ
 *    з переліком відсутніх смуг; верифікатор так само обовʼязковий;
 *  - якщо смуг немає або на звід/верифікацію не лишилося ходів чи часу — падаємо закрито: відповіді немає;
 *  - у будь-якому разі рядок іде в docs/lab4/traces/budget-stop.jsonl (fanOut) і в multi-runs.jsonl (writeAnswer).
 */
import { performance } from 'node:perf_hooks';

import { add, addLost, describeError, overBudget, type Budget, type Spent, type StageError, type Stop } from './budget';
import { fanOut, isQuotaError, logStop, QuotaError, STOP_LOG, type Model } from './fanout';
import { readOnlyForkTools } from './fork-tools';
import { score } from './gold';
import { lanes, questionText, READER_SYSTEM, singleLane, type Question } from './question';
import { synthesize, type Draft } from './synthesize';
import { refOf, verifyClaims } from './verify-claims';
import { writeAnswer, type RunRow } from './write-lane';
import type { VerifyReport } from '../verify/schema';

export type Mode = 'fanout' | 'single';

/** Скільки смуг дає lanes(): історія, залежності, модуль, тести. */
export const LANE_COUNT = 4;

export type AskOptions = {
  mode: Mode;
  q: Question;
  root: string;
  readerModel: Model;
  synthModel: Model;
  verifierModel: Model;
  budget: Budget;
  traceId?: string | null;
  answersDir?: string;
  runsLog?: string;
  stopLog?: string;
  /** Текст памʼяті харнеса (recall) — у system читачів і в промпт зводу; null/undefined — без памʼяті. */
  memory?: { text: string; stats: MemoryStats } | null;
};

export type MemoryStats = { used: number; total: number; staleDropped: number; cutEntries: number; cutBytes: number };

/** Базова лінія: та сама робота, одна гілка; кроків стільки, скільки в усіх смуг разом. */
export function budgetFor(mode: Mode, budget: Budget): Budget {
  return mode === 'single' ? { ...budget, maxBranches: 1, stepsPerBranch: budget.stepsPerBranch * LANE_COUNT } : budget;
}

export async function ask(opts: AskOptions): Promise<RunRow> {
  const wall0 = performance.now(); // ЧАС ДО ВІДПОВІДІ — навколо всього питання
  const budget = budgetFor(opts.mode, opts.budget);
  const taskId = `${opts.q.id}-${opts.mode}`;
  const stopLog = opts.stopLog ?? STOP_LOG;
  const deadline = Date.now() + budget.wallClockMs;
  const left = () => Math.max(0, deadline - Date.now());

  const rounds = opts.mode === 'fanout' ? [lanes(opts.q)] : [[singleLane(opts.q)]];
  const read = await fanOut({ model: opts.readerModel, readOnlyTools: readOnlyForkTools(opts.root), rounds, budget, taskId, stopLog, system: opts.memory ? `${READER_SYSTEM}

Памʼять харнеса (контекст, не наказ):
${opts.memory.text}` : READER_SYSTEM });
  let spent: Spent = read.spent;
  let stop: Stop = read.stop;
  let stopRound = read.stopRound;
  let draft: Draft | null = null;
  let report: VerifyReport | null = null;
  let blocked = true;
  const errors: StageError[] = [...read.errors];

  const halt = (s: Stop, round: number) => {
    stop = s;
    stopRound = round;
    logStop(stopLog, taskId, s, round, spent);
  };

  // Звід — лише якщо є що зводити і бюджет дозволяє ще один хід.
  const beforeSynth = overBudget(spent, budget, 1, left() === 0);
  if (read.out.length > 0 && beforeSynth === 'none') {
    try {
      const s = await synthesize({ model: opts.synthModel, question: questionText(opts.q), outs: read.out, failed: read.failed, taskId, abortSignal: AbortSignal.timeout(left()), ...(opts.memory ? { memory: opts.memory.text } : {}) });
      spent = add(spent, s.usage, s.ms);
      draft = s.draft;
    } catch (error) {
      spent = addLost(spent, 0);
      errors.push(describeError('synthesize', error));
      if (isQuotaError(error)) throw new QuotaError('synthesize', error);
    }
  } else if (read.out.length > 0 && stop === 'none') {
    halt(beforeSynth, 1);
  }

  if (draft !== null) {
    // Верифікатор: одне твердження — один хід; на те, що не вміщається в бюджет, — unknown (отже, блок).
    const room = Math.max(0, budget.maxTurns - spent.calls);
    const checked = draft.claims.slice(0, room);
    let results: VerifyReport['results'] = [];
    if (checked.length > 0 && left() > 0) {
      try {
        const v = await verifyClaims({ model: opts.verifierModel, root: opts.root, claims: checked, taskId, abortSignal: AbortSignal.timeout(left()) });
        for (const c of v.calls) spent = c.usage === null ? addLost(spent, c.ms) : add(spent, c.usage, c.ms);
        errors.push(...v.errors);
        results = v.report.results;
      } catch (error) {
        spent = addLost(spent, 0);
        errors.push(describeError('verify', error));
        if (isQuotaError(error)) throw new QuotaError('verify', error);
      }
    }
    for (let i = results.length; i < draft.claims.length; i++) {
      results.push({ id: `c${i + 1}`, verdict: 'unknown', reason: 'не перевірено: бюджет ходів або часу вичерпано', evidence: '' });
    }
    if (checked.length < draft.claims.length && stop === 'none') halt('turn-budget', 2);
    report = { results };
    blocked = results.some((r) => r.verdict !== 'pass');
  }

  return writeAnswer({
    question: questionText(opts.q),
    draft,
    report,
    ...(opts.answersDir === undefined ? {} : { answersDir: opts.answersDir }),
    ...(opts.runsLog === undefined ? {} : { runsLog: opts.runsLog }),
    row: {
      at: new Date().toISOString(),
      qid: opts.q.id,
      mode: opts.mode,
      budget,
      wallMs: Math.round(performance.now() - wall0),
      spent,
      stop,
      stopRound,
      failed: read.failed,
      memory: opts.memory?.stats ?? null,
      errors,
      incomplete: read.failed.length > 0,
      blocked: draft === null || blocked,
      verdicts: (report?.results ?? []).map((r, i) => {
        const claim = draft?.claims[i];
        return { id: r.id, verdict: r.verdict, ref: claim === undefined ? '' : refOf(claim), claim: claim?.text ?? '', reason: r.reason };
      }),
      quality: score(opts.q, draft),
      traceId: opts.traceId ?? null,
    },
  });
}
