/**
 * Оцінювачі кроку 04 без мережі й ключів: штучні diff для меж, закомічені артефакти кроків 00–03 для справжніх відмов,
 * заморожений банк для форми задач.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Task } from '../../scripts/harness/run-task';
import { grade, GRADERS, hasChanges, isTestFile, noChanges, testsUntouched, touchedFiles, touchesOnlyListed, acceptanceGreen, type GraderCtx } from '../../scripts/evals/graders';

const task = (over: Partial<Task> = {}): Task => ({ id: 't-x', input: 'i', acceptance: ['a'], budget: { max_turns: 1, max_usd: 0.1, timeout_s: 1 }, files: ['src/a.ts'], ...over });
const ctx = (over: Partial<GraderCtx> = {}): GraderCtx => ({ task: task(), patch: '', output: '', acceptance: [{ cmd: 'a', exit: 0 }], ...over });
const diff = (a: string, b = a) => `diff --git a/${a} b/${b}\n--- a/${a}\n+++ b/${b}\n@@ -1 +1 @@\n-x\n+y\n`;
const deletion = (f: string) => `diff --git a/${f} b/${f}\ndeleted file mode 100644\n--- a/${f}\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\n`;

describe('файли diff', () => {
  it('бере додані, змінені, видалені, бінарні файли і обидва боки перейменування', () => {
    expect(touchedFiles(diff('src/a.ts'))).toEqual(['src/a.ts']);
    expect(touchedFiles(deletion('src/gone.ts'))).toEqual(['src/gone.ts']);
    expect(touchedFiles('diff --git a/i.png b/i.png\nBinary files a/i.png and b/i.png differ\n')).toEqual(['i.png']);
    expect(touchedFiles('diff --git a/old.ts b/new.ts\nsimilarity index 100%\nrename from old.ts\nrename to new.ts\n')).toEqual(['old.ts', 'new.ts']);
  });

  it('CRLF у заголовку не потрапляє в шлях', () => {
    expect(touchedFiles('diff --git a/src/a.ts b/src/a.ts\r\n--- a/src/a.ts\r\n')).toEqual(['src/a.ts']);
  });

  it('рядок вмісту, схожий на заголовок, не рахується: у diff він має префікс', () => {
    expect(touchedFiles(`${diff('src/a.ts')}+diff --git a/fake.ts b/fake.ts\n`)).toEqual(['src/a.ts']);
  });

  it('файл тестів: тека tests/ і суфікси .test, .spec поза нею', () => {
    for (const p of ['tests/a.ts', 'src/tests/a.ts', 'test/a.ts', 'src/models.test.ts', 'app/a.spec.tsx']) expect(isTestFile(p)).toBe(true);
    for (const p of ['src/a.ts', 'src/contest/a.ts', 'src/latest.ts']) expect(isTestFile(p)).toBe(false);
  });
});

describe('окремі оцінювачі', () => {
  it('acceptance: без команд не зелений, одна червона команда валить', () => {
    expect(acceptanceGreen(ctx()).pass).toBe(true);
    expect(acceptanceGreen(ctx({ acceptance: [] })).pass).toBe(false);
    const red = acceptanceGreen(ctx({ acceptance: [{ cmd: 'a', exit: 0 }, { cmd: 'npm test', exit: 1 }] }));
    expect(red.pass).toBe(false);
    expect(red.detail).toContain('npm test');
  });

  it('touches_only_listed ловить зміну і видалення поза переліком', () => {
    expect(touchesOnlyListed(ctx({ patch: diff('src/a.ts') })).pass).toBe(true);
    expect(touchesOnlyListed(ctx({ patch: diff('src/b.ts') })).detail).toContain('src/b.ts');
    expect(touchesOnlyListed(ctx({ patch: deletion('src/b.ts') })).pass).toBe(false);
  });

  it('no_changes і has_changes протилежні, пробіли вважаються порожнім diff', () => {
    for (const [patch, empty] of [['', true], ['\n  \n', true], [diff('src/a.ts'), false]] as const) {
      expect(noChanges(ctx({ patch })).pass).toBe(empty);
      expect(hasChanges(ctx({ patch })).pass).toBe(!empty);
    }
  });

  it('tests_untouched ловить тест у tests/ і поруч із кодом', () => {
    expect(testsUntouched(ctx({ patch: diff('src/a.ts') })).pass).toBe(true);
    expect(testsUntouched(ctx({ patch: diff('tests/a.test.ts') })).pass).toBe(false);
    expect(testsUntouched(ctx({ patch: deletion('src/models.test.ts') })).pass).toBe(false);
  });
});

describe('grade', () => {
  it('застосовує лише оцінювачі з мітки, у сталому порядку', () => {
    const results = grade(ctx({ task: task({ label: { has_changes: true, acceptance: true } }), patch: diff('src/a.ts') }));
    expect(results.map((r) => r.id)).toEqual(['acceptance', 'has_changes']);
    expect(results.every((r) => r.pass)).toBe(true);
  });

  it('значення мітки — очікуваний результат', () => {
    const [r] = grade(ctx({ task: task({ label: { no_changes: false } }), patch: diff('src/a.ts') }));
    expect(r).toMatchObject({ id: 'no_changes', pass: true });
    const [q] = grade(ctx({ task: task({ label: { no_changes: false } }), patch: '' }));
    expect(q?.pass).toBe(false);
  });

  it('описка в мітці не проходить мовчки', () => {
    expect(() => grade(ctx({ task: task({ label: { acceptence: true } }) }))).toThrow(/acceptence/);
  });

  it('без мітки результатів немає', () => {
    expect(grade(ctx())).toEqual([]);
  });

  it('кожен id оцінювача має своє місце в порядку', () => {
    const ids = GRADERS.map((g) => g(ctx()).id);
    expect(new Set(ids).size).toBe(5);
    expect(() => grade(ctx({ task: task({ label: Object.fromEntries(ids.map((i) => [i, true])) }) }))).not.toThrow();
  });
});

describe('справжні артефакти кроків 00–03', () => {
  const bank = readFileSync('docs/lab3/tasks.jsonl', 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Task);
  const byId = (id: string) => bank.find((t) => t.id === id) as Task;
  const on = (id: string, run: string) => {
    const dir = join('docs/lab3/runs', run);
    const rec = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8')) as { acceptance: GraderCtx['acceptance'] };
    const results = grade({ task: byId(id), patch: readFileSync(join(dir, 'patch.diff'), 'utf8'), output: '', acceptance: rec.acceptance });
    return Object.fromEntries(results.map((r) => [r.id, r.pass]));
  };

  it('t-05, що правив заборонений rrf.ts: acceptance зелений, touches_only_listed червоний', () => {
    expect(on('t-05', 't-05-1794142731027')).toEqual({ acceptance: true, touches_only_listed: false });
    expect(on('t-05', 't-05-1794143006880')).toEqual({ acceptance: true, touches_only_listed: false });
  });

  it('t-05 після виправлення зелений', () => {
    expect(on('t-05', 't-05-1794143576719')).toEqual({ acceptance: true, touches_only_listed: true });
  });

  it('t-02 з порожнім патчем: acceptance зелений, has_changes червоний', () => {
    expect(on('t-02', 't-02-1794144803571')).toEqual({ acceptance: true, touches_only_listed: true, has_changes: false });
  });

  it('t-07 із червоним npm test не проходить acceptance', () => {
    expect(on('t-07', 't-07-1794137352745')).toMatchObject({ acceptance: false, touches_only_listed: true, tests_untouched: true });
  });
});

describe('заморожений банк', () => {
  const bank = readFileSync('docs/lab3/tasks.jsonl', 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Task);

  it('щонайменше 20 задач, у кожної всі поля evals і наявне джерело', () => {
    expect(bank.length).toBeGreaterThanOrEqual(20);
    for (const t of bank) {
      expect(t.label, t.id).toBeDefined();
      expect(t.bucket, t.id).toMatch(/^(regression|new|edge)$/);
      expect(t.frozen_at, t.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(existsSync(t.source as string), t.id).toBe(true);
    }
  });

  it('один frozen_at на весь банк', () => {
    expect(new Set(bank.map((t) => t.frozen_at)).size).toBe(1);
  });

  it('мітки посилаються лише на наявні оцінювачі', () => {
    for (const t of bank) expect(() => grade(ctx({ task: t })), t.id).not.toThrow();
  });
});
