/**
 * Згода судді з людською розміткою (Лабораторна 3, крок 02). Без мережі.
 *
 *   npx tsx scripts/kappa.ts docs/lab3/calibration/labels.jsonl
 *
 * Рядок файлу: {"case": "...", "criterion": "...", "mine": "pass|fail|unknown", "judge": "pass|fail|unknown"}.
 * Сира згода не коригує на випадковість, тому друкуються ОБИДВА числа окремо, разом із матрицею невідповідностей.
 */
import { readFileSync } from 'node:fs';

export type Label = 'pass' | 'fail' | 'unknown';
export const LABELS: readonly Label[] = ['pass', 'fail', 'unknown'];

/** mine[i] — мій ручний вердикт, judge[i] — вердикт верифікатора. */
export function agreement(mine: readonly Label[], judge: readonly Label[]) {
  const n = mine.length;
  if (n === 0 || n !== judge.length) throw new Error('різна довжина розмітки');

  // сира згода: просто частка збігів
  const po = mine.filter((m, i) => m === judge[i]).length / n;

  // очікувана випадкова згода: сума добутків маргінальних часток
  const pe = LABELS.reduce((acc, l) => {
    const pm = mine.filter((x) => x === l).length / n;
    const pj = judge.filter((x) => x === l).length / n;
    return acc + pm * pj;
  }, 0);

  // каппа Коена; pe === 1 означає, що всі мітки однакові — каппа не визначена
  const kappa = pe === 1 ? Number.NaN : (po - pe) / (1 - pe);
  return { n, raw: po, expected: pe, kappa };
}

/** Матриця невідповідностей: рядки — моя мітка, стовпці — мітка судді. */
export function confusion(mine: readonly Label[], judge: readonly Label[]): Record<Label, Record<Label, number>> {
  const empty = (): Record<Label, number> => ({ pass: 0, fail: 0, unknown: 0 });
  const matrix: Record<Label, Record<Label, number>> = { pass: empty(), fail: empty(), unknown: empty() };
  mine.forEach((m, i) => {
    matrix[m][judge[i] as Label] += 1;
  });
  return matrix;
}

if (process.argv[1]?.endsWith('kappa.ts')) {
  const rows = readFileSync(process.argv[2] ?? 'docs/lab3/calibration/labels.jsonl', 'utf8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as { case: string; criterion: string; mine: Label; judge: Label });
  const mine = rows.map((r) => r.mine);
  const judge = rows.map((r) => r.judge);
  const a = agreement(mine, judge);
  const m = confusion(mine, judge);
  console.log(`Випадків: ${a.n}`);
  console.log(`Сира згода: ${a.raw.toFixed(3)}`);
  console.log(`Очікувана випадкова згода: ${a.expected.toFixed(3)}`);
  console.log(`Каппа Коена: ${Number.isNaN(a.kappa) ? 'не визначена (усі мітки однакові)' : a.kappa.toFixed(3)}`);
  console.log('\n| моя \\ суддя | pass | fail | unknown |\n|---|---|---|---|');
  for (const l of LABELS) console.log(`| ${l} | ${m[l].pass} | ${m[l].fail} | ${m[l].unknown} |`);
  const diff = rows.filter((r) => r.mine !== r.judge);
  if (diff.length > 0) console.log(`\nРозбіжності:\n${diff.map((r) => `- ${r.case} · ${r.criterion}: я ${r.mine}, суддя ${r.judge}`).join('\n')}`);
}
