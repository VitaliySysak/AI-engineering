/**
 * Інструмент «запропонувати запис у памʼять» (Лабораторна 4, крок 04). Модель не має доступу до файлу store:
 * вона передає поля, код валідує їх тією самою схемою, проганяє детерміновані відмови і лише тоді дописує.
 * at і sha ставить код (HEAD відповідного репозиторію), а не модель — модель не вирішує, «коли це було правдою».
 */
import { execFileSync } from 'node:child_process';

import { tool } from 'ai';
import { z } from 'zod';

import { entry, remember, type StoreOptions } from './store';

export const proposalSchema = entry.pick({ kind: true, text: true, repo: true, paths: true, source: true }).strict();

export function headOf(cwd: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
}

/** Те саме, що робить інструмент, — окремо, щоб перевірити без моделі. */
export function propose(input: unknown, o: StoreOptions = {}): { ok: true } | { ok: false; why: string } {
  const parsed = proposalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, why: `схема: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}` };
  const roots = o.roots ?? { course: '.', fork: process.env.FORK_DIR ?? '../axios' };
  try {
    remember({ ...parsed.data, at: new Date().toISOString(), sha: headOf(roots[parsed.data.repo]) }, o);
    return { ok: true };
  } catch (error) {
    return { ok: false, why: error instanceof Error ? error.message : String(error) };
  }
}

export function proposeMemoryTool(o: StoreOptions = {}) {
  return tool({
    description: 'Запропонувати ОДИН запис у постійну памʼять харнеса: рішення, обмеження або результат. Без коду, без секретів, до 400 символів; посилання — у source.',
    inputSchema: proposalSchema,
    execute: async (input) => propose(input, o),
  });
}

export type Proposal = z.input<typeof proposalSchema>;
