/**
 * Розгалуження читання (Лабораторна 4, крок 03): гілки раунду йдуть паралельно (Promise.allSettled),
 * час обмежує AbortController, стелі ходів і токенів перевіряються перед раундом і на fan-in.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';

import { generateText, isStepCount, type ToolSet } from 'ai';

import { add, addLost, empty, overBudget, type Budget, type Spent, type Stop } from './budget';

// Тип моделі беремо з самого generateText — власного підпису не вигадуємо.
export type Model = Parameters<typeof generateText>[0]['model'];

export type Branch = { lane: string; prompt: string };
export type BranchOut = { lane: string; text: string };

export const STOP_LOG = 'docs/lab4/traces/budget-stop.jsonl';

export type FanOutResult = { out: BranchOut[]; spent: Spent; wallMs: number; stop: Stop; stopRound: number | null; failed: string[] };

export async function fanOut(opts: {
  model: Model;
  /** ЛИШЕ читальні інструменти — перелік із src/multi/roles.ts. */
  readOnlyTools: ToolSet;
  /** Розкладка гілок по раундах. */
  rounds: Branch[][];
  budget: Budget;
  taskId: string;
  /** Уже витрачене до розгалуження (для зводу в одному обліку). */
  spent?: Spent;
  stopLog?: string;
  system?: string;
}): Promise<FanOutResult> {
  const { budget } = opts;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), budget.wallClockMs);
  const wall0 = performance.now(); // ЧАС ДО ВІДПОВІДІ — лише звідси
  let spent = opts.spent ?? empty();
  const out: BranchOut[] = [];
  const failed: string[] = [];
  let stop: Stop = 'none';
  let stopRound: number | null = null;
  const halt = (i: number, s: Stop) => {
    stop = s;
    stopRound = i;
    logStop(opts.stopLog ?? STOP_LOG, opts.taskId, s, i, spent);
  };

  try {
    for (const [i, round] of opts.rounds.entries()) {
      if (round.length > budget.maxBranches) {
        throw new Error(`раунд ${i}: гілок ${round.length}, межа ${budget.maxBranches}`);
      }
      const before = overBudget(spent, budget, round.length, ac.signal.aborted);
      if (before !== 'none') {
        // Раунд не стартує: жодна гілка не запускається, частковий результат — те, що вже прийшло.
        failed.push(...round.map((b) => b.lane));
        halt(i, before);
        break;
      }
      const settled = await Promise.allSettled(
        round.map(async (b) => {
          const t0 = performance.now();
          try {
            const r = await generateText({
              model: opts.model,
              ...(opts.system === undefined ? {} : { system: opts.system }),
              prompt: b.prompt,
              tools: opts.readOnlyTools,
              // Спрацювання isStepCount тут МОВЧАЗНЕ: гілка просто закінчує з тим, що встигла.
              stopWhen: [isStepCount(budget.stepsPerBranch)],
              abortSignal: ac.signal,
              maxRetries: 0, // 429 не перепробовуємо: квота — справа брейкера, а не циклу повторів
              telemetry: {
                isEnabled: true,
                functionId: `${opts.taskId}/${b.lane}`, // → gen_ai.agent.name
                recordInputs: false, // вмісту в трасі немає
                recordOutputs: false,
              },
            });
            return { ok: true as const, lane: b.lane, text: r.text, usage: r.totalUsage, ms: performance.now() - t0 };
          } catch (error) {
            // скасована або впала гілка теж списала хід із квоти
            return { ok: false as const, lane: b.lane, ms: performance.now() - t0, error };
          }
        }),
      );
      for (const [j, s] of settled.entries()) {
        if (s.status !== 'fulfilled') {
          failed.push(round[j]!.lane);
          spent = addLost(spent, 0);
          continue;
        }
        if (s.value.ok) {
          spent = add(spent, s.value.usage, s.value.ms);
          out.push({ lane: s.value.lane, text: s.value.text });
        } else {
          failed.push(s.value.lane); // звід мусить побачити, чого немає
          spent = addLost(spent, s.value.ms);
          if (isQuotaError(s.value.error)) throw new QuotaError(s.value.lane, s.value.error);
        }
      }
      // ДРУГА перевірка: fan-in бачить межі ще до того, як почнеться звід.
      const after = overBudget(spent, budget, 0, ac.signal.aborted);
      if (after !== 'none') {
        halt(i, after);
        break;
      }
    }
  } finally {
    clearTimeout(timer);
  }
  return { out, spent, wallMs: performance.now() - wall0, stop, stopRound, failed };
}

/** Відмова за квотою — умова спрацювання circuit breaker (Лабораторна 3, крок 03), а не несподіванка. */
export class QuotaError extends Error {
  constructor(
    readonly lane: string,
    override readonly cause: unknown,
  ) {
    super(`квота: гілка ${lane} отримала відмову провайдера (429 / RESOURCE_EXHAUSTED)`);
  }
}

export function isQuotaError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  const e = error as { statusCode?: unknown; message?: unknown; lastError?: unknown };
  if (e.statusCode === 429) return true;
  if (typeof e.message === 'string' && /\b429\b|RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(e.message)) return true;
  return e.lastError !== undefined && isQuotaError(e.lastError);
}

export function logStop(file: string, taskId: string, limit: Stop, round: number, spent: Spent): void {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), taskId, limit, round, spent })}\n`);
}
