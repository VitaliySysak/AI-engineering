/** Суддя кроку 05 без мережі: підставна модель, вердикти задаються прямо в тесті, форма справжніх файлів розмітки. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Model } from '../../src/agent/agent-loop';
import { formatReport, missingVerdicts, reportSet, selectSets } from '../../scripts/judge/calibrate';
import { CASES_FILE, judgeOne, judgePrompt, jsonl, rubricFor, taskForArtifact, type JudgeCase, type JudgeVerdict } from '../../scripts/judge/run-judge';
import type { Label } from '../../scripts/kappa';

const RUBRIC = '## common\n\nспільне\n\n## task_done\n\nпро задачу\n\n## test_meaningful\n\nпро тест\n';
const PATCH = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-x\n+y\n';
const task = { id: 't-x', input: 'зроби', files: ['src/a.ts'] };
const stub = (...replies: string[]) => {
  const calls: { system: string; text: string }[] = [];
  let i = 0;
  const model = (async (system: string, messages: readonly { text?: string }[]) => {
    calls.push({ system, text: messages[0]?.text ?? '' });
    return { text: replies[Math.min(i++, replies.length - 1)] };
  }) as unknown as Model;
  return { model, calls };
};
const reply = (verdict: string, evidence = 'src/a.ts:1', id = 'c.task_done') => JSON.stringify({ id, reason: 'бо так', evidence, verdict });
const deps = (model: Model) => ({ model, retryAfterMs: 0 });

describe('рубрика', () => {
  it('суддя бачить спільні правила і лише свій вимір', () => {
    const r = rubricFor(RUBRIC, 'task_done');
    expect(r).toContain('спільне');
    expect(r).toContain('про задачу');
    expect(r).not.toContain('про тест');
  });

  it('CRLF не ламає розділи, а невідомий вимір є помилкою', () => {
    expect(rubricFor(RUBRIC.replace(/\n/g, '\r\n'), 'test_meaningful')).toContain('про тест');
    expect(() => rubricFor(RUBRIC, 'scope')).toThrow(/scope/);
  });

  it('у рубриці «до» є pass, fail, unknown на кожен вимір', () => {
    const md = readFileSync('scripts/judge/rubric-before.md', 'utf8');
    for (const d of ['task_done', 'test_meaningful']) for (const v of ['pass', 'fail', 'unknown']) expect(rubricFor(md, d)).toMatch(new RegExp(`^- ${v} — .*Приклад:`, 'm'));
  });
});

describe('один вимір одного випадку', () => {
  it('приймає вердикт і передає лише рубрику виміру', async () => {
    const { model, calls } = stub(reply('pass'));
    const r = await judgeOne(deps(model), 'sys', 'c.task_done', task, PATCH);
    expect(r.verdict).toBe('pass');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.system).toBe('sys');
    expect(calls[0]?.text).toContain('Файли в цій зміні: src/a.ts');
  });

  it('порожній diff теж іде до судді, evidence без файла дозволено', async () => {
    const { model, calls } = stub(reply('pass', 'diff порожній'));
    expect((await judgeOne(deps(model), 'sys', 'c.task_done', task, '')).verdict).toBe('pass');
    expect(calls).toHaveLength(1);
    expect(judgePrompt('c', task, '')).toContain('Файли в цій зміні: немає');
  });

  it('невалідну відповідь перепитує один раз', async () => {
    const { model, calls } = stub('не json', reply('fail'));
    expect((await judgeOne(deps(model), 'sys', 'c.task_done', task, PATCH)).verdict).toBe('fail');
    expect(calls).toHaveLength(2);
  });

  it('двічі невалідна відповідь — виняток, а не вигаданий вердикт', async () => {
    await expect(judgeOne(deps(stub('ні', 'знову ні').model), 'sys', 'c.task_done', task, PATCH)).rejects.toThrow(/невалідну/);
  });

  it('evidence поза зміною двічі знімає вердикт до unknown', async () => {
    const r = await judgeOne(deps(stub(reply('pass', 'src/other.ts:1')).model), 'sys', 'c.task_done', task, PATCH);
    expect(r.verdict).toBe('unknown');
  });

  it('вибір задачі: t-05 зі стопу, решта з банку, невідома — помилка', () => {
    const bank = new Map([['t-05', { id: 't-05', input: 'банк' }], ['t-09', { id: 't-09', input: 'дев' }]]);
    const stop = new Map([['t-05', { id: 't-05', input: 'стоп' }]]);
    expect(taskForArtifact('docs/lab3/runs/t-05-1794142731027', bank, stop).input).toBe('стоп');
    expect(taskForArtifact('docs/lab3/judge-artifacts/t-09-1794158111810', bank, stop).input).toBe('дев');
    expect(() => taskForArtifact('x/t-99-1', bank, stop)).toThrow(/t-99/);
  });
});

const c = (case_id: string, mine: Label, holdout = false, dimension = 'task_done'): JudgeCase => ({ case_id, artifact: 'x', dimension, mine, reason: 'r', holdout });
const v = (case_id: string, verdict: Label, rubric = 'before', dimension = 'task_done'): JudgeVerdict => ({ case_id, dimension, verdict, reason: 'r', evidence: '', model: 'm', rubric, rubric_sha: 's', order: 'n/a', at: 't' });

describe('калібрування', () => {
  it('матриця, «пропускає погане» і «марна робота» — різні числа', () => {
    const cases = [c('a', 'fail'), c('b', 'fail'), c('d', 'pass'), c('e', 'unknown')];
    const r = reportSet('x', cases, [v('a', 'pass'), v('b', 'fail'), v('d', 'fail'), v('e', 'unknown')], 'before');
    expect(r.passesBad).toBe(1);
    expect(r.wastedWork).toBe(1);
    expect(r.raw).toBeCloseTo(0.5, 10);
    expect(r.matrix.fail.pass).toBe(1);
  });

  it('береться лише вказана рубрика', () => {
    const r = reportSet('x', [c('a', 'pass'), c('b', 'fail')], [v('a', 'pass', 'before'), v('b', 'pass', 'before'), v('a', 'pass', 'after'), v('b', 'fail', 'after')], 'after');
    expect(r.raw).toBe(1);
  });

  it('пропущений вердикт виявляється', () => {
    expect(missingVerdicts([c('a', 'pass'), c('b', 'pass')], [v('a', 'pass')], 'before')).toEqual(['b|task_done']);
    expect(missingVerdicts([c('a', 'pass')], [v('a', 'pass', 'after')], 'before')).toEqual(['a|task_done']);
  });

  it('без --final відкладених немає ні окремо, ні в «усіх»', () => {
    const cases = [c('a', 'pass'), c('h', 'fail', true)];
    const sets = selectSets(cases, false);
    expect(sets.every((s) => s.subset.every((x) => !x.holdout))).toBe(true);
    expect(sets.some((s) => /ВІДКЛАДЕНІ|усі/.test(s.label))).toBe(false);
  });

  it('із --final є робочі, відкладені й усі', () => {
    const labels = selectSets([c('a', 'pass'), c('h', 'fail', true)], true).map((s) => s.label);
    expect(labels).toEqual(expect.arrayContaining(['task_done · робочі', 'task_done · ВІДКЛАДЕНІ', 'task_done · усі', 'обидва виміри · усі']));
  });

  it('однорідні мітки: каппа не визначена, і звіт це каже', () => {
    const r = reportSet('x', [c('a', 'pass')], [v('a', 'pass')], 'before');
    expect(formatReport(r)).toContain('не визначена');
  });
});

describe('справжня розмітка', () => {
  const cases = jsonl<JudgeCase>(readFileSync(CASES_FILE, 'utf8'));

  it('20 випадків: 14 робочих і 6 відкладених, по рядку на вимір', () => {
    const ids = [...new Set(cases.map((x) => x.case_id))];
    expect(ids).toHaveLength(20);
    expect(new Set(cases.filter((x) => x.holdout).map((x) => x.case_id)).size).toBe(6);
    expect(cases).toHaveLength(40);
    for (const id of ids) expect(cases.filter((x) => x.case_id === id).map((x) => x.dimension).sort()).toEqual(['task_done', 'test_meaningful']);
  });

  it('усі мітки й причини заповнені, артефакти на місці', () => {
    for (const x of cases) {
      expect(['pass', 'fail', 'unknown'], `${x.case_id}/${x.dimension}`).toContain(x.mine);
      expect(x.reason.trim(), `${x.case_id}/${x.dimension}`).not.toBe('');
      expect(existsSync(join(x.artifact, 'patch.diff')), x.artifact).toBe(true);
    }
  });

  it('на кожен вимір мітки різні, інакше каппа не визначена', () => {
    for (const d of ['task_done', 'test_meaningful']) expect(new Set(cases.filter((x) => x.dimension === d).map((x) => x.mine)).size, d).toBeGreaterThan(1);
  });
});
