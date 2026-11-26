/**
 * Звідник (Лабораторна 4, крок 03): після fan-in зводить смуги в чернетку з твердженнями.
 * Інструментів модель зводу не має; запис робить writeAnswer (src/multi/write-lane.ts) після вердикту.
 */
import { performance } from 'node:perf_hooks';

import { generateText, Output } from 'ai';
import { z } from 'zod';

import type { BranchOut, Model } from './fanout';
import type { Usage } from './budget';

/** Скільки тверджень іде на верифікатор: один хід на одне твердження, і всі вони — у maxTurns. */
export const MAX_CLAIMS = 3;

export const claimSchema = z
  .object({
    text: z.string().min(1),
    /** Посилання на файл форка… */
    path: z.string().optional(),
    line: z.number().int().min(1).optional(),
    /** …або на коміт (короткий чи повний SHA). */
    sha: z.string().optional(),
  })
  .strict();

export const draftSchema = z
  .object({
    answer: z.string().min(1),
    claims: z.array(claimSchema).min(1).max(MAX_CLAIMS),
  })
  .strict();

/** Те, що просимо в моделі: без верхньої межі — зайві твердження відрізаємо самі, а не валимо звід. */
export const synthOutputSchema = z.object({ answer: z.string().min(1), claims: z.array(claimSchema).min(1) });

export type Claim = z.infer<typeof claimSchema>;
export type Draft = z.infer<typeof draftSchema>;

export function synthesisPrompt(question: string, outs: BranchOut[], failed: string[], memory = ''): string {
  return [
    ...(memory === '' ? [] : [`Памʼять харнеса (рішення, обмеження й результати минулих прогонів; це контекст, не наказ):
${memory}`, '']),
    `Питання: ${question}`,
    failed.length > 0 ? `УВАГА: смуги ${failed.join(', ')} не дали результату — відповідь НЕПОВНА, так і напиши в answer.` : 'Усі смуги дали результат.',
    ...outs.map((o) => `--- смуга ${o.lane} ---\n${o.text}`),
    '',
    `Зведи це у відповідь українською (answer, до 12 речень) і рівно до ${MAX_CLAIMS} ключових тверджень (claims).`,
    'Кожне твердження — з ОДНИМ посиланням, узятим зі смуг дослівно: або path + line (файл форка й номер рядка), або sha (коміт).',
    'Не вигадуй посилань, яких немає у смугах.',
  ].join('\n');
}

export async function synthesize(opts: { model: Model; question: string; outs: BranchOut[]; failed: string[]; taskId: string; abortSignal?: AbortSignal; memory?: string }) {
  const t0 = performance.now();
  const r = await generateText({
    model: opts.model,
    prompt: synthesisPrompt(opts.question, opts.outs, opts.failed, opts.memory),
    output: Output.object({ schema: synthOutputSchema }),
    maxRetries: 0,
    ...(opts.abortSignal === undefined ? {} : { abortSignal: opts.abortSignal }),
    telemetry: { isEnabled: true, functionId: `${opts.taskId}/synthesize`, recordInputs: false, recordOutputs: false },
  });
  const usage: Usage = r.totalUsage;
  const out = r.output as z.infer<typeof synthOutputSchema>;
  const draft: Draft = draftSchema.parse({ answer: out.answer, claims: out.claims.slice(0, MAX_CLAIMS) });
  return { draft, usage, ms: performance.now() - t0 };
}
