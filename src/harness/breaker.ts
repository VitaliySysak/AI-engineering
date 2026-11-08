/**
 * Circuit breaker фабрики (Лабораторна 3, крок 03): шар харнеса над окремими задачами. Стани за Фаулером — closed, open,
 * half-open; застосування до агентної черги — наше рішення за аналогією (docs/lab3/stop.md).
 * Стан живе у файлі .harness/breaker.json: брейкер у змінній процесу починав би кожен прогін із closed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { z } from 'zod';

export const BREAKER_FILE = '.harness/breaker.json';

// Умови спрацювання — рішення автора 2026-11-08 (docs/lab3/stop.md).
export const SAME_FAILS = 3; // однакових відмов підряд
export const NO_PROGRESS = 5; // задач поспіль без пройденого acceptance
export const COOLDOWN_MIN = 30;
export const COOLDOWN_AFTER_PROBE_MIN = 60;

/** Причини, що відкривають брейкер одразу: вичерпану квоту чи бюджет наступна задача не вилікує. */
const IMMEDIATE = new Set(['quota', 'budget']);

export const breakerState = z
  .object({
    state: z.enum(['closed', 'open', 'half-open']),
    /** Скільки однакових відмов підряд. */
    fails: z.number().int().min(0),
    lastReason: z.string().nullable(),
    /** Скільки задач поспіль без успіху, незалежно від причини. */
    noProgress: z.number().int().min(0),
    openedAt: z.string().nullable(),
    cooldownMin: z.number().int().min(0),
    /** Чому відкрито. */
    trip: z.string().nullable(),
  })
  .strict();

export type BreakerState = z.infer<typeof breakerState>;

const CLOSED: BreakerState = { state: 'closed', fails: 0, lastReason: null, noProgress: 0, openedAt: null, cooldownMin: 0, trip: null };

export function loadBreaker(file: string = BREAKER_FILE): BreakerState {
  if (!existsSync(file)) return CLOSED;
  return breakerState.parse(JSON.parse(readFileSync(file, 'utf8')));
}

function save(state: BreakerState, file: string): BreakerState {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return state;
}

/** Чи можна взяти наступну задачу. Після перепочинку — half-open: рівно одна пробна задача. */
export function mayRun(now: Date = new Date(), file: string = BREAKER_FILE): { allow: boolean; probe: boolean; why: string } {
  const b = loadBreaker(file);
  if (b.state === 'closed') return { allow: true, probe: false, why: 'closed' };
  if (b.state === 'open') {
    const waited = (now.getTime() - Date.parse(b.openedAt as string)) / 60_000;
    if (waited < b.cooldownMin) {
      return { allow: false, probe: false, why: `open: ${b.trip}; перепочинок ще ${Math.ceil(b.cooldownMin - waited)} хв` };
    }
    save({ ...b, state: 'half-open' }, file);
  }
  return { allow: true, probe: true, why: 'half-open: пробна задача' };
}

/** Результат задачі: успіх закриває брейкер, відмова рахується й може його відкрити. */
export function recordOutcome(outcome: { ok: boolean; reason: string | null }, now: Date = new Date(), file: string = BREAKER_FILE): BreakerState {
  if (outcome.ok) return save(CLOSED, file);

  const b = loadBreaker(file);
  const reason = outcome.reason ?? 'unknown';
  const fails = b.lastReason === reason ? b.fails + 1 : 1;
  const noProgress = b.noProgress + 1;

  let trip: string | null = null;
  let cooldownMin = COOLDOWN_MIN;
  if (b.state === 'half-open') {
    trip = `пробна задача не пройшла: ${reason}`;
    cooldownMin = COOLDOWN_AFTER_PROBE_MIN;
  } else if (IMMEDIATE.has(reason)) trip = `одразу: ${reason}`;
  else if (fails >= SAME_FAILS) trip = `${fails} однакових відмов підряд: ${reason}`;
  else if (noProgress >= NO_PROGRESS) trip = `${noProgress} задач поспіль без успіху`;

  return save(
    {
      state: trip === null ? 'closed' : 'open',
      fails,
      lastReason: reason,
      noProgress,
      openedAt: trip === null ? null : now.toISOString(),
      cooldownMin: trip === null ? 0 : cooldownMin,
      trip,
    },
    file,
  );
}
