/**
 * Суддя кроку 05 (Лабораторна 3): один запит на одну пару «випадок — вимір». ХОДИТЬ У МЕРЕЖУ (Gemini) — запускає автор:
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/judge/run-judge.ts --rubric before
 *
 * Рубрика — scripts/judge/rubric-<назва>.md; суддя бачить лише спільні правила і свій вимір. Вердикти дописуються в
 * docs/lab3/verdicts/judge.jsonl з моделлю й хешем рубрики; уже наявні пари цієї рубрики пропускаються (відновлення після
 * вичерпаної квоти). Вердикти відкладених випадків у консоль не друкуються: їх не можна бачити до кінця ітерації.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import type { Model } from '../../src/agent/agent-loop';
import type { Label } from '../kappa';
import { isTransient } from '../baseline';
import { verifierModel } from '../harness/verify-task';
import { diffFiles, EvidenceNotInDiff, parseVerdict, redactDiff } from '../verify';

export const CASES_FILE = 'docs/lab3/judge-cases.jsonl';
export const VERDICTS_FILE = 'docs/lab3/verdicts/judge.jsonl';

export interface JudgeCase {
  readonly case_id: string;
  readonly artifact: string;
  readonly dimension: string;
  readonly mine: Label;
  readonly reason: string;
  readonly holdout: boolean;
}

export interface JudgeTask {
  readonly id: string;
  readonly input: string;
  readonly files?: readonly string[];
}

export interface JudgeVerdict {
  readonly case_id: string;
  readonly dimension: string;
  readonly verdict: Label;
  readonly reason: string;
  readonly evidence: string;
  readonly model: string;
  readonly rubric: string;
  readonly rubric_sha: string;
  /** Суддя не порівнює варіанти, тому порядку подання немає. */
  readonly order: string;
  readonly at: string;
}

export function jsonl<T>(text: string): T[] {
  return text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as T);
}

/** Спільні правила + лише один вимір: окремий ізольований суддя на вимір. */
export function rubricFor(markdown: string, dimension: string): string {
  const sections = new Map<string, string>();
  const parts = markdown.replace(/\r\n/g, '\n').split(/^## (\S+)[ \t]*$/m);
  for (let i = 1; i < parts.length; i += 2) sections.set(parts[i] as string, (parts[i + 1] as string).trim());
  const common = sections.get('common');
  const own = sections.get(dimension);
  if (common === undefined || own === undefined) throw new Error(`у рубриці немає розділу common або ${dimension}`);
  return `${common}\n\n${own}`;
}

export function judgePrompt(id: string, task: JudgeTask, patch: string): string {
  return [
    `Ідентифікатор для відповіді: ${id}`,
    '',
    `Вхід задачі: ${task.input}`,
    '',
    `Файли задачі: ${(task.files ?? []).join(', ') || 'не задано'}`,
    '',
    `Файли в цій зміні: ${diffFiles(patch).join(', ') || 'немає'}`,
    '',
    'Зміна (git diff):',
    '```diff',
    patch,
    '```',
  ].join('\n');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_RETRIES = 3;

export interface JudgeDeps {
  readonly model: Model;
  readonly retryAfterMs: number;
}

async function callModel(deps: JudgeDeps, system: string, id: string, text: string): Promise<string> {
  for (let retries = 0; ; retries++) {
    try {
      return (await deps.model(system, [{ role: 'user', text }], [])).text;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!isTransient(message) || retries >= MAX_RETRIES) throw error;
      console.error(`${id}: ${/HTTP \d+/.exec(message)?.[0]} — повтор ${retries + 1}/${MAX_RETRIES}`);
      await sleep(deps.retryAfterMs);
    }
  }
}

/**
 * Один вимір одного випадку. Порожній diff теж судиться: на нерелевантний вхід це може бути правильний результат.
 * Невалідну відповідь перепитуємо один раз; evidence поза зміною вдруге — вердикт знімається до unknown.
 */
export async function judgeOne(deps: JudgeDeps, system: string, id: string, task: JudgeTask, rawPatch: string) {
  const { text: patch } = redactDiff(rawPatch);
  const files = patch.trim() === '' ? undefined : diffFiles(patch);
  const prompt = judgePrompt(id, task, patch);
  let last: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const text = attempt === 1 ? prompt : `${prompt}\n\nПопередня відповідь не пройшла перевірку (${String(last)}). Поверни ЛИШЕ JSON за схемою.`;
    try {
      return parseVerdict(await callModel(deps, system, id, text), id, files);
    } catch (error) {
      if (error instanceof Error && /HTTP \d+/.test(error.message)) throw error;
      last = error;
    }
  }
  if (last instanceof EvidenceNotInDiff) {
    return { id, verdict: 'unknown' as const, reason: `Суддя двічі навів evidence поза зміною — вердикт знято. ${last.message}`, evidence: '' };
  }
  throw new Error(`${id}: суддя двічі повернув невалідну відповідь (${String(last)})`);
}

/** Задача артефакту: той самий вибір, що й на аркуші розмітки. */
export function taskForArtifact(artifact: string, bank: ReadonlyMap<string, JudgeTask>, stop: ReadonlyMap<string, JudgeTask>): JudgeTask {
  const id = basename(artifact).replace(/-\d+$/, '');
  const task = artifact.includes('t-05-17941') && stop.has(id) ? stop.get(id) : bank.get(id);
  if (task === undefined) throw new Error(`немає задачі для ${artifact}`);
  return task;
}

async function main(): Promise<void> {
  const at = process.argv.indexOf('--rubric');
  const rubricName = at > 0 ? process.argv[at + 1] : undefined;
  if (rubricName === undefined) throw new Error('потрібна назва рубрики: --rubric before');
  const rubricFile = join('scripts', 'judge', `rubric-${rubricName}.md`);
  const markdown = readFileSync(rubricFile, 'utf8');
  const rubricSha = createHash('sha256').update(markdown.replace(/\r\n/g, '\n')).digest('hex').slice(0, 12);

  const read = (f: string) => jsonl<JudgeTask>(readFileSync(f, 'utf8'));
  const bank = new Map([...read('docs/lab3/tasks.jsonl'), ...read('docs/lab3/tasks-rejected.jsonl')].map((t) => [t.id, t]));
  const stop = new Map(read('docs/lab3/tasks-stop.jsonl').map((t) => [t.id, t]));
  const cases = jsonl<JudgeCase>(readFileSync(CASES_FILE, 'utf8'));
  const earlier = existsSync(VERDICTS_FILE) ? jsonl<JudgeVerdict>(readFileSync(VERDICTS_FILE, 'utf8')) : [];
  const done = new Set(earlier.filter((v) => v.rubric === rubricName).map((v) => `${v.case_id}|${v.dimension}`));

  const { model, modelId } = verifierModel();
  mkdirSync(dirname(VERDICTS_FILE), { recursive: true });
  console.log(`Суддя: ${modelId} · temperature 0 · рубрика ${rubricName} (${rubricSha}) · пар ${cases.length} · уже є ${done.size}\n`);

  for (const c of cases) {
    if (done.has(`${c.case_id}|${c.dimension}`)) continue;
    const task = taskForArtifact(c.artifact, bank, stop);
    const r = await judgeOne({ model, retryAfterMs: 60_000 }, rubricFor(markdown, c.dimension), `${c.case_id}.${c.dimension}`, task, readFileSync(join(c.artifact, 'patch.diff'), 'utf8'));
    const line: JudgeVerdict = { case_id: c.case_id, dimension: c.dimension, verdict: r.verdict, reason: r.reason, evidence: r.evidence, model: modelId, rubric: rubricName, rubric_sha: rubricSha, order: 'n/a', at: new Date().toISOString() };
    appendFileSync(VERDICTS_FILE, `${JSON.stringify(line)}\n`, 'utf8');
    console.log(c.holdout ? `${c.case_id} · ${c.dimension} · відкладено` : `${c.case_id} · ${c.dimension} · я ${c.mine} · суддя ${r.verdict}${c.mine === r.verdict ? '' : '  ← розбіжність'}`);
    // 15 запитів на хвилину: один запит на 5 с лишає запас для повторів
    await sleep(5_000);
  }
  console.log(`\nЗаписано в ${VERDICTS_FILE}. Далі: npx tsx scripts/judge/calibrate.ts --rubric ${rubricName}`);
}

if (process.argv[1]?.endsWith('run-judge.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  });
}
