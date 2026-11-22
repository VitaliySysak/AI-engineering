/**
 * Зведення двох колонок «один агент проти розгалуження» (Лабораторна 4, крок 03). Без мережі:
 *
 *   npx tsx scripts/multi/summarize-runs.ts [--since 2026-11-22T00:00:00Z]
 *
 * Бере з docs/lab4/traces/multi-runs.jsonl останній прогін кожної пари (питання, режим) з ТИПОВИМ бюджетом
 * (прогони з навмисно зниженою стелею — це докази зупинки, а не базова лінія) і друкує таблицю для multiagent.md.
 */
import { readFileSync } from 'node:fs';

import { budgetFor, type Mode } from '../../src/multi/ask';
import { DEFAULT_BUDGET } from '../../src/multi/budget';
import { RUNS_LOG, type RunRow } from '../../src/multi/write-lane';

export function median(xs: number[]): number {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const sameBudget = (row: RunRow, mode: Mode) => JSON.stringify(row.budget) === JSON.stringify(budgetFor(mode, DEFAULT_BUDGET));

export function pick(rows: RunRow[], mode: Mode, since = ''): RunRow[] {
  const last = new Map<string, RunRow>();
  for (const r of rows) if (r.mode === mode && r.at >= since && sameBudget(r, mode)) last.set(r.qid, r);
  return [...last.values()].sort((a, b) => a.qid.localeCompare(b.qid));
}

export function column(rows: RunRow[]) {
  const sum = (f: (r: RunRow) => number) => rows.reduce((n, r) => n + f(r), 0);
  return {
    n: rows.length,
    wallMedianMs: median(rows.map((r) => r.wallMs)),
    computeMs: Math.round(sum((r) => r.spent.ms)),
    input: sum((r) => r.spent.input),
    output: sum((r) => r.spent.output),
    calls: sum((r) => r.spent.calls),
    unreported: sum((r) => r.spent.unreported),
    importers: `${sum((r) => r.quality.importers)}/${sum((r) => r.quality.importersTotal)}`,
    tests: `${sum((r) => r.quality.tests)}/${sum((r) => r.quality.testsTotal)}`,
    passed: rows.filter((r) => !r.blocked).length,
    claimsPass: `${sum((r) => r.verdicts.filter((v) => v.verdict === 'pass').length)}/${sum((r) => r.verdicts.length)}`,
  };
}

function main(): void {
  const at = process.argv.indexOf('--since');
  const since = at > 0 ? process.argv[at + 1] ?? '' : '';
  const rows = readFileSync(RUNS_LOG, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as RunRow);
  const s = pick(rows, 'single', since);
  const f = pick(rows, 'fanout', since);
  const a = column(s);
  const b = column(f);
  const line = (name: string, x: string | number, y: string | number) => console.log(`| ${name} | ${x} | ${y} |`);
  console.log(`Питань: один агент ${a.n}, розгалуження ${b.n} (${s.map((r) => r.qid).join(',')})\n`);
  console.log('| Вимір | Один агент | Розгалуження |\n|---|---|---|');
  line('час ДО ВІДПОВІДІ, медіана, с', (a.wallMedianMs / 1000).toFixed(1), (b.wallMedianMs / 1000).toFixed(1));
  line('сумарний час обчислення, с', (a.computeMs / 1000).toFixed(1), (b.computeMs / 1000).toFixed(1));
  line('вхідні токени', a.input, b.input);
  line('вихідні токени', a.output, b.output);
  line('ходів (викликів generateText), разом з упалими', a.calls, b.calls);
  line('токенів не повідомлено (ходів)', a.unreported, b.unreported);
  line('якість: еталонних імпортерів названо', a.importers, b.importers);
  line('якість: еталонних тестів названо', a.tests, b.tests);
  line('тверджень pass у верифікатора', a.claimsPass, b.claimsPass);
  line('питань пройшло браму (відповідь записано)', `${a.passed}/${a.n}`, `${b.passed}/${b.n}`);
  line('вартість у грошах', 'нуль (безкоштовні рівні)', 'нуль (безкоштовні рівні)');
}

if (process.argv[1]?.endsWith('summarize-runs.ts')) main();
