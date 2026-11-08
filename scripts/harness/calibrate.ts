/**
 * Калібрування судді задач (Лабораторна 3, крок 02). ХОДИТЬ У МЕРЕЖУ (Gemini) — запускає автор:
 *
 *   npx tsx --env-file=.env.local scripts/harness/calibrate.ts --run 1
 *
 * Кожен випадок docs/lab3/calibration/cases.jsonl — окремий запит про один критерій проти одного patch. Розмітку автора
 * (labels.jsonl, закомічена раніше) не змінює: пише results-run<N>.jsonl, який читає scripts/kappa.ts.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseCriteriaFile, verifierModel, verifyPatch } from './verify-task';

const DIR = 'docs/lab3/calibration';
const read = (f: string) => readFileSync(f, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Record<string, unknown>);

async function main(): Promise<void> {
  const at = process.argv.indexOf('--run');
  const run = at > 0 ? process.argv[at + 1] : undefined;
  if (run === undefined) throw new Error('потрібен номер прогону: --run 1');

  const criteria = [...parseCriteriaFile(readFileSync('docs/lab3/criteria.jsonl', 'utf8')).values()].flat();
  const inputs = new Map(read('docs/lab3/tasks.jsonl').map((t) => [t.id as string, t.input as string]));
  const labels = new Map(read(join(DIR, 'labels.jsonl')).map((l) => [l.case as number, l.mine as string]));
  const cases = read(join(DIR, 'cases.jsonl')) as unknown as { case: number; task: string; criterion: string; patch: string }[];
  const { model, modelId } = verifierModel();
  console.log(`Суддя: ${modelId} · temperature 0 · випадків ${cases.length} · прогін ${run}\n`);

  const rows: string[] = [];
  for (const c of cases) {
    const criterion = criteria.find((x) => x.id === c.criterion);
    if (criterion === undefined) throw new Error(`немає критерію ${c.criterion}`);
    const { results } = await verifyPatch({ model, retryAfterMs: 60_000, pauseMs: 0 }, [criterion], inputs.get(c.task) ?? '', readFileSync(c.patch, 'utf8'));
    const r = results[0];
    if (r === undefined) throw new Error(`випадок ${c.case}: немає вердикту`);
    const mine = labels.get(c.case);
    rows.push(JSON.stringify({ case: c.case, criterion: c.criterion, mine, judge: r.verdict, reason: r.reason, evidence: r.evidence }));
    console.log(`${String(c.case).padStart(2)} · ${c.criterion} · я ${mine} · суддя ${r.verdict}${mine === r.verdict ? '' : '  ← розбіжність'}`);
    // 15 запитів на хвилину: один запит на 5 с лишає запас для повторів
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  const out = join(DIR, `results-run${run}.jsonl`);
  writeFileSync(out, `${rows.join('\n')}\n`, 'utf8');
  console.log(`\nЗаписано ${out}. Далі: npx tsx scripts/kappa.ts ${out.replace(/\\/g, '/')}`);
}

if (process.argv[1]?.endsWith('calibrate.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  });
}
