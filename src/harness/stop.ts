/**
 * Шар прогону зупинення (Лабораторна 3, крок 03): stopWhen власного циклу на AI SDK, який лишає рядок у журналі.
 * Журнал зупинок — docs/lab3/stop-log.jsonl: сюди ж пише черга фабрики (ліміт задачі, брейкер).
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { isStepCount } from 'ai';

export const STOP_LOG = 'docs/lab3/stop-log.jsonl';

export type StepStop = ReturnType<typeof isStepCount>;

/** Один рядок журналу зупинок: який ліміт спрацював, на чому і що це за задача. */
export function logStop(entry: Record<string, unknown>, file: string = STOP_LOG): void {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, 'utf8');
}

/** Робить те саме, що isStepCount(n), але при спрацюванні лишає рядок у журналі. */
export function stepLimit(n: number, taskId: string, file: string = STOP_LOG): StepStop {
  const inner = isStepCount(n);
  const wrapped: StepStop = (...args) => {
    const r = inner(...args);
    void Promise.resolve(r).then((hit) => {
      if (hit) logStop({ taskId, limit: 'isStepCount', n }, file);
    });
    return r;
  };
  return wrapped;
}
