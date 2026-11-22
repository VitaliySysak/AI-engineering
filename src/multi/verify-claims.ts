/**
 * Верифікатор на fan-in (Лабораторна 4, крок 03): та сама схема й брама, що в Лабораторній 3 (src/verify/schema.ts) —
 * один запит на одне твердження, isTaskBlocked валить усе, що не pass (unknown теж).
 * Доказ дістає ОРКЕСТРАТОР детерміновано (рядки файлу чи опис коміту з форка); модель інструментів не має.
 */
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

import { generateText } from 'ai';

import { criterionVerdict, isTaskBlocked, type VerifyReport } from '../verify/schema';
import type { Usage } from './budget';
import type { Model } from './fanout';
import { readLines } from './fork-tools';
import type { Claim } from './synthesize';

/** Доказ для твердження — з форка, без участі моделі. */
export function resolveEvidence(root: string, claim: Claim): string {
  try {
    if (claim.sha !== undefined && /^[0-9a-f]{7,40}$/i.test(claim.sha)) {
      return execFileSync('git', ['show', '-s', '--format=commit %H%nдата %as%nтема %s%n%n%b', claim.sha], { cwd: root, encoding: 'utf8' })
        + execFileSync('git', ['show', '--name-only', '--format=', claim.sha], { cwd: root, encoding: 'utf8' });
    }
    if (claim.path !== undefined) {
      const line = claim.line ?? 1;
      return readLines(root, claim.path, Math.max(1, line - 3), line + 3);
    }
    return 'посилання відсутнє';
  } catch (error) {
    return `доказ не знайдено: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`;
  }
}

export const refOf = (c: Claim) => (c.sha !== undefined ? `коміт ${c.sha}` : `${c.path ?? '?'}:${c.line ?? '?'}`);

export function verifierPrompt(id: string, claim: Claim, evidence: string): string {
  return [
    'Ти суворий верифікатор. Перевір ОДНЕ твердження про чужий репозиторій проти наданого доказу.',
    'pass — доказ прямо підтверджує твердження; fail — доказ суперечить або посилання хибне/не існує; unknown — доказу недостатньо.',
    `Твердження ${id}: ${claim.text}`,
    `Посилання: ${refOf(claim)}`,
    'Доказ (дістав оркестратор із форка):',
    '```',
    evidence.slice(0, 6000),
    '```',
    `Відповідай ЛИШЕ JSON-обʼєктом: {"id":"${id}","verdict":"pass|fail|unknown","reason":"одне речення","evidence":"цитата з доказу або порожньо"}`,
  ].join('\n');
}

/** Модель могла обгорнути JSON текстом чи ```json — беремо перший обʼєкт; негодний вивід = unknown. */
export function parseVerdict(id: string, text: string) {
  const m = text.match(/\{[\s\S]*\}/);
  if (m !== null) {
    try {
      const parsed = criterionVerdict.safeParse({ ...JSON.parse(m[0]), id });
      if (parsed.success) return parsed.data;
    } catch {
      /* нижче — unknown */
    }
  }
  return { id, verdict: 'unknown' as const, reason: 'вивід верифікатора не відповідає схемі', evidence: '' };
}

export async function verifyClaims(opts: { model: Model; root: string; claims: Claim[]; taskId: string; abortSignal?: AbortSignal }) {
  const results: VerifyReport['results'] = [];
  const calls: { usage: Usage; ms: number }[] = [];
  for (const [i, claim] of opts.claims.entries()) {
    const id = `c${i + 1}`;
    const t0 = performance.now();
    const r = await generateText({
      model: opts.model,
      prompt: verifierPrompt(id, claim, resolveEvidence(opts.root, claim)),
      temperature: 0,
      maxRetries: 0,
      ...(opts.abortSignal === undefined ? {} : { abortSignal: opts.abortSignal }),
      telemetry: { isEnabled: true, functionId: `${opts.taskId}/verify-${id}`, recordInputs: false, recordOutputs: false },
    });
    calls.push({ usage: r.totalUsage, ms: performance.now() - t0 });
    results.push(parseVerdict(id, r.text));
  }
  const report: VerifyReport = { results };
  return { report, blocked: results.length === 0 || isTaskBlocked(report), calls };
}
