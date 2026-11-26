/**
 * Перевірка цитат дослідження (Лабораторна 4, крок 04). Без мережі, лише git у форку:
 *
 *   npx tsx scripts/cite-check.ts [docs/lab4/research-cites.json] [--fork ../axios]
 *
 * Код виходу 1, якщо хоч одна цитата не існує. Число «цитат усього / не підтверджено» друкується завжди, навіть коли нуль.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

import { checkCite, citeSchema } from '../src/research/cite-check';

const args = process.argv.slice(2);
const at = args.indexOf('--fork');
const fork = resolve(at >= 0 ? args[at + 1] ?? '../axios' : process.env.FORK_DIR ?? '../axios');
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--fork') ?? 'docs/lab4/research-cites.json';

const cites = z.array(citeSchema.extend({ claim: z.string().optional() }).strict()).parse(JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')));
const bad = cites.map((c) => ({ c, why: checkCite(fork, { sha: c.sha, ...(c.file === undefined ? {} : { file: c.file }), ...(c.line === undefined ? {} : { line: c.line }) }) })).filter((r) => r.why !== null);
for (const r of bad) console.error(`${JSON.stringify(r.c)} — ${r.why}`);
console.log(`цитат: ${cites.length}, не підтверджено: ${bad.length}`);
if (bad.length > 0) process.exit(1);
