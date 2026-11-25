/**
 * Зведення двох колонок «один агент проти розгалуження» (Лабораторна 4, крок 03). Без мережі:
 *
 *   npx tsx scripts/multi/summarize-runs.ts --since 2026-11-25T00:00:00Z
 *
 * Бере з docs/lab4/traces/multi-runs.jsonl УСІ прогони з типовим бюджетом від --since (прогони з навмисно
 * зниженою стелею — докази зупинки, а не базова лінія). Пара, зірвана інфраструктурою провайдера
 * (HTTP 503 / 404, перерваний запит), рахується окремим рядком і в якість та час не йде: це шум провайдера,
 * а не властивість архітектури. Ходи й токени рахуються по ВСІХ прогонах — квоту вони з'їли однаково.
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

/** Збій інфраструктури: провайдер недоступний (503/404) або запит перервано. Вердикт верифікатора сюди не входить. */
export function infraFailed(row: RunRow): boolean {
  return (row.errors ?? []).some((e) => e.status === 503 || e.status === 404 || e.name === 'AbortError');
}

export function pick(rows: RunRow[], mode: Mode, since = ''): RunRow[] {
  return rows.filter((r) => r.mode === mode && r.at >= since && sameBudget(r, mode));
}

export function column(all: RunRow[]) {
  const clean = all.filter((r) => !infraFailed(r));
  const sum = (rows: RunRow[], f: (r: RunRow) => number) => rows.reduce((n, r) => n + f(r), 0);
  return {
    runs: all.length,
    clean: clean.length,
    wallMedianMs: median(clean.map((r) => r.wallMs)),
    computeMedianMs: median(clean.map((r) => r.spent.ms)),
    input: sum(all, (r) => r.spent.input),
    output: sum(all, (r) => r.spent.output),
    calls: sum(all, (r) => r.spent.calls),
    unreported: sum(all, (r) => r.spent.unreported),
    importers: `${sum(clean, (r) => r.quality.importers)}/${sum(clean, (r) => r.quality.importersTotal)}`,
    tests: `${sum(clean, (r) => r.quality.tests)}/${sum(clean, (r) => r.quality.testsTotal)}`,
    claimsPass: `${sum(clean, (r) => r.verdicts.filter((v) => v.verdict === 'pass').length)}/${sum(clean, (r) => r.verdicts.length)}`,
    passed: clean.filter((r) => !r.blocked).length,
  };
}

function main(): void {
  const at = process.argv.indexOf('--since');
  const since = at > 0 ? process.argv[at + 1] ?? '' : '';
  const rows = readFileSync(RUNS_LOG, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as RunRow);
  const a = column(pick(rows, 'single', since));
  const b = column(pick(rows, 'fanout', since));
  const line = (name: string, x: string | number, y: string | number) => console.log(`| ${name} | ${x} | ${y} |`);
  const s = (ms: number) => (Number.isNaN(ms) ? '—' : (ms / 1000).toFixed(1));
  console.log(`Прогонів від ${since || 'початку'}: один агент ${a.runs} (чистих ${a.clean}), розгалуження ${b.runs} (чистих ${b.clean})\n`);
  console.log('| Вимір | Один агент | Розгалуження |\n|---|---|---|');
  line('пар, зірваних провайдером (503 / 404 / перервано)', a.runs - a.clean, b.runs - b.clean);
  line('час ДО ВІДПОВІДІ, медіана по чистих, с', s(a.wallMedianMs), s(b.wallMedianMs));
  line('час обчислення (сума по викликах), медіана по чистих, с', s(a.computeMedianMs), s(b.computeMedianMs));
  line('вхідні токени, усі прогони', a.input, b.input);
  line('вихідні токени, усі прогони', a.output, b.output);
  line('ходів (викликів generateText), усі прогони, разом з упалими', a.calls, b.calls);
  line('токенів не повідомлено (ходів)', a.unreported, b.unreported);
  line('якість: еталонних імпортерів названо (чисті)', a.importers, b.importers);
  line('якість: еталонних тестів названо (чисті)', a.tests, b.tests);
  line('тверджень pass у верифікатора (чисті)', a.claimsPass, b.claimsPass);
  line('питань пройшло браму, відповідь записано (чисті)', `${a.passed}/${a.clean}`, `${b.passed}/${b.clean}`);
  line('вартість у грошах', 'нуль (безкоштовні рівні)', 'нуль (безкоштовні рівні)');
}

if (process.argv[1]?.endsWith('summarize-runs.ts')) main();
