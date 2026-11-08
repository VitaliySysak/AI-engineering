/**
 * Шари зупинення (Лабораторна 3, крок 03) без мережі: стан брейкера у файлі тимчасової теки, stepLimit поверх підробної
 * моделі, класифікація результатів задачі. Час передається параметром — тести не чекають перепочинку.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAgent } from '../../src/agent/agent-aisdk';
import { COOLDOWN_AFTER_PROBE_MIN, COOLDOWN_MIN, loadBreaker, mayRun, recordOutcome } from '../../src/harness/breaker';
import { stepLimit } from '../../src/harness/stop';
import { classifyOutcome, quotaHit } from '../../scripts/harness/run-task';

let dir: string;
let file: string;
const T0 = new Date('2026-11-08T12:00:00Z');
const after = (min: number) => new Date(T0.getTime() + min * 60_000);
const fail = (reason: string, now = T0) => recordOutcome({ ok: false, reason }, now, file);
const ok = (now = T0) => recordOutcome({ ok: true, reason: null }, now, file);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'breaker-'));
  file = join(dir, '.harness', 'breaker.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('circuit breaker', () => {
  it('без файлу — closed, задачі пускає', () => {
    expect(mayRun(T0, file)).toEqual({ allow: true, probe: false, why: 'closed' });
  });

  it('3 однакові відмови підряд відкривають; стан переживає новий процес (лежить у файлі)', () => {
    expect(fail('max_turns').state).toBe('closed');
    expect(fail('max_turns').state).toBe('closed');
    const opened = fail('max_turns');
    expect(opened.state).toBe('open');
    expect(opened.trip).toMatch(/3 однакових відмов підряд: max_turns/);
    expect(existsSync(file)).toBe(true);
    expect(loadBreaker(file).state).toBe('open');
    expect(mayRun(T0, file).allow).toBe(false);
  });

  it('різні відмови не накопичують лічильник однакових', () => {
    fail('max_turns');
    fail('timeout');
    expect(fail('max_turns').state).toBe('closed');
  });

  it('5 задач поспіль без успіху відкривають, навіть якщо причини різні', () => {
    for (const r of ['max_turns', 'timeout', 'agent_failed', 'acceptance_failed']) expect(fail(r).state).toBe('closed');
    const opened = fail('max_turns');
    expect(opened.state).toBe('open');
    expect(opened.trip).toMatch(/5 задач поспіль/);
  });

  it('квота й бюджет відкривають одразу', () => {
    expect(fail('quota').state).toBe('open');
    rmSync(file);
    expect(fail('budget').state).toBe('open');
  });

  it('успіх скидає лічильники', () => {
    fail('max_turns');
    fail('max_turns');
    ok();
    expect(loadBreaker(file)).toMatchObject({ state: 'closed', fails: 0, noProgress: 0 });
    expect(fail('max_turns').state).toBe('closed');
  });

  it('до кінця перепочинку не пускає, після — рівно одна пробна задача', () => {
    fail('quota');
    expect(mayRun(after(COOLDOWN_MIN - 1), file).allow).toBe(false);
    const probe = mayRun(after(COOLDOWN_MIN), file);
    expect(probe).toMatchObject({ allow: true, probe: true });
    expect(loadBreaker(file).state).toBe('half-open');
  });

  it('зелена пробна задача закриває', () => {
    fail('quota');
    mayRun(after(COOLDOWN_MIN), file);
    expect(ok(after(COOLDOWN_MIN)).state).toBe('closed');
    expect(mayRun(after(COOLDOWN_MIN), file).probe).toBe(false);
  });

  it('червона пробна задача знову відкриває, з довшим перепочинком', () => {
    fail('quota');
    mayRun(after(COOLDOWN_MIN), file);
    const reopened = fail('acceptance_failed', after(COOLDOWN_MIN));
    expect(reopened).toMatchObject({ state: 'open', cooldownMin: COOLDOWN_AFTER_PROBE_MIN });
    expect(reopened.trip).toMatch(/пробна задача/);
    expect(mayRun(after(COOLDOWN_MIN + COOLDOWN_AFTER_PROBE_MIN - 1), file).allow).toBe(false);
    expect(mayRun(after(COOLDOWN_MIN + COOLDOWN_AFTER_PROBE_MIN), file).probe).toBe(true);
  });

  it('зіпсований стан не приймається мовчки', () => {
    fail('quota');
    const broken = readFileSync(file, 'utf8').replace('"open"', '"напіввідкритий"');
    writeFileSync(file, broken);
    expect(() => loadBreaker(file)).toThrow();
  });
});

describe('класифікація результату задачі', () => {
  const rec = (over: object) => ({ exit_status: 'ok' as const, acceptance_passed: true, quota_hit: false, result_subtype: 'success', ...over });

  it('успіх — лише код 0 і пройдений acceptance', () => {
    expect(classifyOutcome(rec({}))).toEqual({ ok: true, reason: null });
    expect(classifyOutcome(rec({ acceptance_passed: false }))).toEqual({ ok: false, reason: 'acceptance_failed' });
  });

  it('ліміти розрізняються, квота важливіша за підсумковий код', () => {
    expect(classifyOutcome(rec({ exit_status: 'agent_failed', acceptance_passed: false, result_subtype: 'error_max_turns' })).reason).toBe('max_turns');
    expect(classifyOutcome(rec({ exit_status: 'agent_failed', acceptance_passed: false, result_subtype: 'error_max_budget_usd' })).reason).toBe('budget');
    expect(classifyOutcome(rec({ exit_status: 'timeout', acceptance_passed: false })).reason).toBe('timeout');
    expect(classifyOutcome(rec({ exit_status: 'agent_failed', acceptance_passed: false, quota_hit: true })).reason).toBe('quota');
  });

  it('квота: api_error_status 429 або текст помилки; успішний текст про ліміти — не квота', () => {
    expect(quotaHit(JSON.stringify({ api_error_status: 429 }))).toBe(true);
    expect(quotaHit(JSON.stringify({ is_error: true, result: "You've hit your usage limit" }))).toBe(true);
    expect(quotaHit(JSON.stringify({ is_error: false, api_error_status: null, result: 'додав rate limit у код' }))).toBe(false);
    expect(quotaHit('HTTP 429 Too Many Requests')).toBe(true);
    expect(quotaHit('Error: not logged in')).toBe(false);
  });
});

describe('stepLimit', () => {
  it('зупиняє цикл на межі й лишає рядок у журналі', async () => {
    const log = join(dir, 'stop-log.jsonl');
    let n = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: 'tool-call', toolCallId: `c${n++}`, toolName: 'list_files', input: JSON.stringify({ path: '.' }) }],
        finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
        usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
        warnings: [],
      }),
    });
    const fs = { list: async () => ['a'], read: async () => '', write: async () => undefined };
    await createAgent(model, fs, 99, stepLimit(2, 't-demo', log)).generate({ prompt: 'крутись' }).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(n).toBe(2); // рівно два кроки, а не 99
    const line = JSON.parse(readFileSync(log, 'utf8').trim().split('\n').at(-1) as string) as { taskId: string; limit: string; n: number };
    expect(line).toMatchObject({ taskId: 't-demo', limit: 'isStepCount', n: 2 });
  });
});
