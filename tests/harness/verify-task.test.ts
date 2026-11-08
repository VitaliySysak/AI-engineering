/**
 * Верифікатор задачі (Лабораторна 3, крок 02) без мережі: підставна модель замість Gemini. Перевіряємо обв'язку:
 * блокування на всьому, що не pass; рівно один повторний запит; окремий запит на кожен критерій; інша родина моделі.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { Model } from '../../src/agent/agent-loop';
import { isBlocked, isTaskBlocked, type VerifyReport } from '../../src/verify/schema';
import { assertOtherFamily, latestRunDir, parseCriteriaFile, taskFromBranch, verifyPatch, type VerifyDeps } from '../../scripts/harness/verify-task';

const PATCH = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n';
const CRITERIA = [{ id: 'c1', text: 'перший' }, { id: 'c2', text: 'другий' }];
const reply = (id: string, verdict: string, evidence = 'src/a.ts:1') => JSON.stringify({ id, verdict, reason: 'бо так', evidence });

/** Підставна модель: віддає відповіді по черзі й запам'ятовує запити. */
function fakeModel(replies: readonly (string | Error)[]) {
  const calls: string[] = [];
  const model: Model = async (_system, messages) => {
    const m = messages[0];
    calls.push(m !== undefined && m.role === 'user' ? m.text : '');
    const next = replies[calls.length - 1];
    if (next === undefined) throw new Error('забагато викликів моделі');
    if (next instanceof Error) throw next;
    return { text: next, calls: [], usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0 } };
  };
  return { model, calls };
}

const deps = (model: Model): VerifyDeps => ({ model, retryAfterMs: 0, pauseMs: 0 });
const report = (...verdicts: VerifyReport['results'][number]['verdict'][]): VerifyReport => ({
  results: verdicts.map((verdict, i) => ({ id: `c${i}`, verdict, reason: 'r', evidence: verdict === 'unknown' ? '' : 'e' })),
});

describe('isTaskBlocked — блокує все, що не pass', () => {
  it('усі pass — зелено', () => expect(isTaskBlocked(report('pass', 'pass'))).toBe(false));
  it('fail — червоно', () => expect(isTaskBlocked(report('pass', 'fail'))).toBe(true));
  it('unknown теж червоно: в автономному прогоні нема кому його розібрати', () => expect(isTaskBlocked(report('pass', 'unknown'))).toBe(true));
  it('брама Лабораторної 2 не змінилась: unknown у isBlocked не блокує', () => expect(isBlocked(report('pass', 'unknown'))).toBe(false));
});

describe('verifyPatch', () => {
  it('один запит на один критерій; у запиті критерій, завдання і patch', async () => {
    const { model, calls } = fakeModel([reply('c1', 'pass'), reply('c2', 'pass')]);
    const r = await verifyPatch(deps(model), CRITERIA, 'зроби X', PATCH);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('Критерій c1: перший');
    expect(calls[0]).toContain('зроби X');
    expect(calls[0]).toContain('+new');
    expect(calls[1]).toContain('Критерій c2: другий');
    expect(r.results.map((x) => x.verdict)).toEqual(['pass', 'pass']);
  });

  it('невалідну відповідь перепитує рівно один раз і приймає другу', async () => {
    const { model, calls } = fakeModel(['не JSON', reply('c1', 'fail'), reply('c2', 'pass')]);
    const r = await verifyPatch(deps(model), CRITERIA, 'x', PATCH);
    expect(calls).toHaveLength(3);
    expect(calls[1]).toContain('не пройшла перевірку');
    expect(r.results[0]?.verdict).toBe('fail');
  });

  it('удруге невалідна — виняток (код 2), а не «майже вердикт»', async () => {
    const { model, calls } = fakeModel(['не JSON', 'знову не JSON']);
    await expect(verifyPatch(deps(model), CRITERIA, 'x', PATCH)).rejects.toThrow(/двічі повернув невалідну/);
    expect(calls).toHaveLength(2);
  });

  it('evidence поза зміною двічі — вердикт знято до unknown, і брама червона', async () => {
    const { model } = fakeModel([reply('c1', 'pass', 'src/інший.ts:9'), reply('c1', 'pass', 'src/інший.ts:9'), reply('c2', 'pass')]);
    const r = await verifyPatch(deps(model), CRITERIA, 'x', PATCH);
    expect(r.results[0]?.verdict).toBe('unknown');
    expect(isTaskBlocked(r)).toBe(true);
  });

  it('порожній patch не йде до моделі: усі критерії unknown', async () => {
    const { model, calls } = fakeModel([]);
    const r = await verifyPatch(deps(model), CRITERIA, 'x', '  \n');
    expect(calls).toHaveLength(0);
    expect(r.results.map((x) => x.verdict)).toEqual(['unknown', 'unknown']);
  });

  it('тимчасова відмова провайдера повторюється, вердикт не страждає', async () => {
    const { model, calls } = fakeModel([new Error('https://x → HTTP 503: busy'), reply('c1', 'pass'), reply('c2', 'pass')]);
    const r = await verifyPatch(deps(model), CRITERIA, 'x', PATCH);
    expect(calls).toHaveLength(3);
    expect(r.results[0]?.verdict).toBe('pass');
  });

  it('секрет у patch маскується до запиту моделі', async () => {
    const leaky = `${PATCH}+const k = "AIzaSyA1234567890abcdefghijklmnopqrstuvw";\n`;
    const { model, calls } = fakeModel([reply('c1', 'pass'), reply('c2', 'pass')]);
    await verifyPatch(deps(model), CRITERIA, 'x', leaky);
    expect(calls[0]).not.toContain('AIzaSyA1234567890');
  });
});

describe('вибір задачі, прогону і моделі', () => {
  let root = '';
  afterEach(() => {
    if (root !== '') rmSync(root, { recursive: true, force: true });
    root = '';
  });

  it('id задачі лише з гілок harness/t-*', () => {
    expect(taskFromBranch('harness/t-06')).toBe('t-06');
    expect(taskFromBranch('harness/red-2026-11-08')).toBeNull();
    expect(taskFromBranch('main')).toBeNull();
  });

  it('найновіший прогін — за міткою в імені; t-01 не збігається з t-010', () => {
    root = mkdtempSync(join(tmpdir(), 'verdict-'));
    for (const n of ['t-01-100', 't-01-200', 't-010-999']) mkdirSync(join(root, n));
    expect(latestRunDir(root, 't-01')).toBe(join(root, 't-01-200'));
    expect(latestRunDir(root, 't-99')).toBeNull();
    expect(latestRunDir(join(root, 'немає'), 't-01')).toBeNull();
  });

  it('модель тієї самої родини, що й виконавець, не приймається', () => {
    expect(() => assertOtherFamily('claude-haiku-5-5')).toThrow(/тієї самої родини/);
    expect(() => assertOtherFamily('gemini-3.5-flash-lite')).not.toThrow();
  });

  it('criteria.jsonl: кожна задача черги має 1–3 критерії, а зайве поле відхиляється', () => {
    const map = parseCriteriaFile(readFileSync('docs/lab3/criteria.jsonl', 'utf8'));
    const queue = readFileSync('docs/lab3/tasks.jsonl', 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '').map((l) => (JSON.parse(l) as { id: string }).id);
    expect([...map.keys()]).toEqual(queue);
    root = mkdtempSync(join(tmpdir(), 'crit-'));
    writeFileSync(join(root, 'c.jsonl'), '{"task":"t-1","criteria":[{"id":"a","text":"b","зайве":1}]}\n');
    expect(() => parseCriteriaFile(readFileSync(join(root, 'c.jsonl'), 'utf8'))).toThrow();
  });
});
