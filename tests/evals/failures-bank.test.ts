/** Діагностичний набір кроку 06: окремо від замороженого банку, поля evals на місці, мітки відомі оцінювачам. */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { Task } from '../../scripts/harness/run-task';
import { grade } from '../../scripts/evals/graders';
import { parseBank } from '../../scripts/evals/run-evals';

describe('tasks-failures.jsonl', () => {
  const rows = parseBank(readFileSync('docs/lab3/tasks-failures.jsonl', 'utf8'));
  const frozen = parseBank(readFileSync('docs/lab3/tasks.jsonl', 'utf8'));

  it('кошик diagnostic, тож у браму кроку 04 не входить', () => {
    expect(rows.length).toBeGreaterThan(0);
    for (const t of rows) expect(t.bucket, t.id).toBe('diagnostic');
    expect(frozen.some((t) => (t.bucket as string) === 'diagnostic')).toBe(false);
  });

  it('мітки посилаються на наявні оцінювачі', () => {
    for (const t of rows) expect(() => grade({ task: t as Task, patch: '', output: '', acceptance: [] }), t.id).not.toThrow();
  });

  it('ліміти задано лише задачам харнеса', () => {
    expect(rows.filter((t) => t.budget.max_turns === 2).map((t) => t.id)).toEqual(['t-01', 't-02', 't-04', 't-06']);
  });
});
