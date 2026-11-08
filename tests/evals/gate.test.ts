/** Брама і зведення кроку 04 без мережі: журнали спроб задаються прямо в тесті. */
import { describe, expect, it } from 'vitest';

import { geminiArgs, quotaHit, type Task } from '../../scripts/harness/run-task';
import { comparability, parseLog, regressions, tally, toBaseline, type EvalLine } from '../../scripts/evals/gate';
import { doneAttempts, median, parseBank, summarize } from '../../scripts/evals/run-evals';

const line = (task_id: string, pass: boolean, over: Partial<EvalLine> = {}): EvalLine => ({ task_id, bucket: 'regression', frozen_at: '2026-11-08', agent: 'a', pass, ...over });
const run = (spec: Record<string, readonly boolean[]>, over: Partial<EvalLine> = {}) => tally(Object.entries(spec).flatMap(([id, ps]) => ps.map((p) => line(id, p, over))));

describe('брама', () => {
  const base = toBaseline(run({ a: [true, true, true], b: [true, false, true] }), 3);

  it('pow_k = 1 лише коли всі спроби успішні', () => {
    expect(base.a?.pow_k).toBe(1);
    expect(base.b?.pow_k).toBeCloseTo(2 / 3, 10);
  });

  it('задача з pass^k = 1 впала — регресія, названа поіменно', () => {
    const broke = regressions(run({ a: [true, false, true], b: [true, true, true] }), base, 3);
    expect(broke).toHaveLength(1);
    expect(broke[0]).toMatch(/^a: було pass\^3=1, стало 2\/3/);
  });

  it('задача, що й раніше була нестабільною, регресією не є', () => {
    expect(regressions(run({ a: [true, true, true], b: [false, false, false] }), base, 3)).toEqual([]);
  });

  it('середнє незмінне, але впала інша задача — регресія все одно є', () => {
    const b2 = toBaseline(run({ a: [true], b: [false] }), 1);
    expect(regressions(run({ a: [false], b: [true] }), b2, 1)).toHaveLength(1);
  });

  it('задача зникла з прогону — регресія', () => {
    expect(regressions(run({ b: [true, true, true] }), base, 3)[0]).toMatch(/у прогоні її немає/);
  });

  it('edge і new у брамі не беруть участі', () => {
    const b2 = toBaseline(tally([line('e', true, { bucket: 'edge' }), line('n', true, { bucket: 'new' })]), 1);
    expect(regressions(tally([line('e', false, { bucket: 'edge' }), line('n', false, { bucket: 'new' })]), b2, 1)).toEqual([]);
  });

  it('у CI k = 1 порівнюється з базовим рівнем k = 3', () => {
    expect(regressions(run({ a: [true], b: [true] }), base, 1)).toEqual([]);
    expect(regressions(run({ a: [false], b: [true] }), base, 1)).toHaveLength(1);
  });
});

describe('чи можна порівнювати', () => {
  const base = toBaseline(run({ a: [true] }), 1);

  it('той самий банк, агент і k — можна', () => {
    expect(comparability(run({ a: [true] }), base, 1)).toEqual([]);
  });

  it('порожній журнал не є зеленим', () => {
    expect(comparability(new Map(), base, 1)[0]).toMatch(/немає жодної спроби/);
  });

  it('інший frozen_at або два значення в одному прогоні', () => {
    expect(comparability(run({ a: [true] }, { frozen_at: '2026-12-01' }), base, 1)[0]).toMatch(/не збігається/);
    const mixed = tally([line('a', true), line('b', true, { frozen_at: '2026-12-01' })]);
    expect(comparability(mixed, base, 1).join()).toMatch(/не заморожений/);
  });

  it('базовий рівень іншого агента', () => {
    expect(comparability(run({ a: [true] }, { agent: 'b' }), base, 1)[0]).toMatch(/агент b/);
  });

  it('неповний прогін', () => {
    expect(comparability(run({ a: [true] }), base, 3)[0]).toMatch(/спроб 1, а очікувалось 3/);
  });
});

describe('зведення', () => {
  it('приклад 75% за трьох спроб: pass@k і pass^k різні числа', () => {
    const lines = [...['a', 'b', 'c', 'd'].flatMap((id) => [true, true, true].map((pass) => ({ task_id: id, bucket: 'x', pass }))), ...[true, false, false].map((pass) => ({ task_id: 'e', bucket: 'x', pass }))];
    const [s] = summarize(lines, 3);
    expect(s).toMatchObject({ tasks: 5, pass_at_k: 1, pass_pow_k: 0.8 });
  });

  it('кошики рахуються окремо', () => {
    const lines = [{ task_id: 'a', bucket: 'regression', pass: true }, { task_id: 'b', bucket: 'edge', pass: false }];
    expect(summarize(lines, 1).map((s) => [s.bucket, s.pass_pow_k])).toEqual([['regression', 1], ['edge', 0]]);
  });

  it('неповна задача не зараховується в pass^k', () => {
    expect(summarize([{ task_id: 'a', bucket: 'x', pass: true }], 3)[0]?.pass_pow_k).toBe(0);
  });

  it('час, токени й вартість: відсутні значення пропускаються', () => {
    const lines = [
      { task_id: 'a', bucket: 'x', pass: true, duration_s: 10, input_tokens: 100, output_tokens: 5, cost_usd_estimate: 0.01 },
      { task_id: 'a', bucket: 'x', pass: true, duration_s: 20, input_tokens: null, output_tokens: 7, cost_usd_estimate: 0.02 },
    ];
    expect(summarize(lines, 2)[0]).toMatchObject({ median_s: 15, median_input_tokens: 100, median_output_tokens: 6 });
    expect(summarize(lines, 2)[0]?.cost_usd_estimate_total).toBeCloseTo(0.03, 10);
  });

  it('медіана: парна, непарна, порожня', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2])).toBe(1.5);
    expect(median([])).toBeNull();
  });
});

describe('банк і відновлення', () => {
  const bank = `﻿${JSON.stringify({ id: 'a', bucket: 'regression' })}\r\n\r\n${JSON.stringify({ id: 'b', bucket: 'edge' })}\n`;

  it('фільтрує за кошиком і переліком id; BOM і CRLF не ламають', () => {
    expect(parseBank(bank).map((t) => t.id)).toEqual(['a', 'b']);
    expect(parseBank(bank, 'edge').map((t) => t.id)).toEqual(['b']);
    expect(parseBank(bank, '', ['a']).map((t) => t.id)).toEqual(['a']);
  });

  it('EVAL_RESUME бере лише спроби того самого коміту', () => {
    const log = `${JSON.stringify({ task_id: 'a', attempt: 1, sha: 'x' })}\n${JSON.stringify({ task_id: 'a', attempt: 2, sha: 'y' })}\n`;
    expect([...doneAttempts(log, 'x')]).toEqual(['a#1']);
  });

  it('журнал читається порядково', () => {
    expect(parseLog(`${JSON.stringify(line('a', true))}\r\n\r\n`)).toHaveLength(1);
  });
});

describe('шлях Gemini CLI', () => {
  const task: Task = { id: 't', input: 'зроби', acceptance: [], budget: { max_turns: 1, max_usd: 0.1, timeout_s: 1 } };

  it('лише auto_edit: режиму обходу дозволів немає', () => {
    const args = geminiArgs(task);
    expect(args[args.indexOf('--approval-mode') + 1]).toBe('auto_edit');
    expect(args.join(' ')).not.toMatch(/yolo|--no-sandbox|-y\b/);
    expect(args[args.indexOf('-m') + 1]).toBe('gemini-3.5-flash-lite');
  });

  it('форма помилки квоти Gemini розпізнається', () => {
    expect(quotaHit(JSON.stringify({ error: { type: 'Error', message: 'x', code: 429 } }))).toBe(true);
    expect(quotaHit('RESOURCE_EXHAUSTED')).toBe(true);
    expect(quotaHit(JSON.stringify({ error: { type: 'Error', message: 'x', code: 500 } }))).toBe(false);
  });
});
