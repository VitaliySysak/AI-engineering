/**
 * Прогін банку задач (Лабораторна 3, крок 04): k спроб на задачу, кожна — у новому git worktree від HEAD.
 * Журнал останнього прогону — docs/lab3/evals.jsonl, один рядок на спробу. ВИТРАЧАЄ ЛІМІТ АГЕНТА — запускає автор.
 *
 *   npx tsx scripts/evals/run-evals.ts docs/lab3/tasks.jsonl
 *
 * Змінні: EVAL_K (типово 3), EVAL_BUCKET (один кошик), EVAL_ONLY (t-01,t-02), EVAL_AGENT (claude | gemini),
 * EVAL_RESUME=1 (дописати незавершений прогін того самого коміту замість почати заново).
 *
 * Код виходу 2: вичерпана квота. Така спроба не є відмовою задачі, тому в журнал вона не пишеться.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { startTelemetry } from '../../src/telemetry/otel';
import { CLAUDE_MODEL, claudeRunner, GEMINI_CLI_MODEL, geminiRunner, runTaskTraced, type AgentRunner, type Task } from '../harness/run-task';
import { DEFAULT_LOG } from './gate';
import { grade } from './graders';

const AGENTS: Record<string, { runner: AgentRunner; path: string; model: string }> = {
  claude: { runner: claudeRunner, path: 'claude-code -p', model: CLAUDE_MODEL },
  gemini: { runner: geminiRunner, path: 'gemini-cli', model: GEMINI_CLI_MODEL },
};

export interface SummaryLine {
  readonly task_id: string;
  readonly bucket: string;
  readonly pass: boolean;
  readonly duration_s?: number | null;
  readonly input_tokens?: number | null;
  readonly output_tokens?: number | null;
  readonly cost_usd_estimate?: number | null;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/** pass@k — хоч одна спроба з k; pass^k — усі k. Частки задач кошика, окремо по кошиках. */
export function summarize(lines: readonly SummaryLine[], k: number) {
  const byTask = new Map<string, { bucket: string; ok: number; n: number }>();
  for (const l of lines) {
    const c = byTask.get(l.task_id) ?? { bucket: l.bucket, ok: 0, n: 0 };
    byTask.set(l.task_id, { bucket: c.bucket, ok: c.ok + (l.pass ? 1 : 0), n: c.n + 1 });
  }
  const buckets = new Map<string, { tasks: number; at: number; pow: number }>();
  for (const { bucket, ok, n } of byTask.values()) {
    const b = buckets.get(bucket) ?? { tasks: 0, at: 0, pow: 0 };
    buckets.set(bucket, { tasks: b.tasks + 1, at: b.at + (ok >= 1 ? 1 : 0), pow: b.pow + (ok === n && n === k ? 1 : 0) });
  }
  const nums = (bucket: string, pick: (l: SummaryLine) => number | null | undefined) =>
    lines.filter((l) => l.bucket === bucket).map(pick).filter((v): v is number => typeof v === 'number');
  const total = (values: readonly number[]) => (values.length === 0 ? null : values.reduce((s, v) => s + v, 0));
  return [...buckets].map(([bucket, b]) => ({
    bucket,
    tasks: b.tasks,
    pass_at_k: b.at / b.tasks,
    pass_pow_k: b.pow / b.tasks,
    median_s: median(nums(bucket, (l) => l.duration_s)),
    median_input_tokens: median(nums(bucket, (l) => l.input_tokens)),
    median_output_tokens: median(nums(bucket, (l) => l.output_tokens)),
    cost_usd_estimate_total: total(nums(bucket, (l) => l.cost_usd_estimate)),
  }));
}

export function parseBank(text: string, bucket = '', only: readonly string[] = []): Task[] {
  return text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as Task)
    .filter((t) => (bucket === '' || t.bucket === bucket) && (only.length === 0 || only.includes(t.id)));
}

/** Які спроби вже є в журналі цього коміту (для EVAL_RESUME). */
export function doneAttempts(logText: string, sha: string): Set<string> {
  const done = new Set<string>();
  for (const l of logText.split(/\r?\n/).filter((x) => x.trim() !== '')) {
    const r = JSON.parse(l) as { task_id: string; attempt: number; sha: string };
    if (r.sha === sha) done.add(`${r.task_id}#${r.attempt}`);
  }
  return done;
}

/** Порожній patch.diff при змінах в індексі — збій знімання артефакту, а не «агент нічого не зробив»: такий вердикт хибний. */
export function assertPatchCaptured(patch: string, stagedNames: string): void {
  if (patch.trim() === '' && stagedNames.trim() !== '') {
    throw new Error(`patch.diff порожній, хоча змінено: ${stagedNames.trim().split(/\r?\n/).join(', ')}`);
  }
}

async function main(): Promise<void> {
  const k = Number(process.env.EVAL_K ?? 3);
  if (!Number.isInteger(k) || k < 1) throw new Error(`EVAL_K має бути цілим >= 1: ${process.env.EVAL_K}`);
  const agentName = process.env.EVAL_AGENT ?? 'claude';
  const agent = AGENTS[agentName];
  if (agent === undefined) throw new Error(`невідомий EVAL_AGENT: ${agentName}`);
  const only = (process.env.EVAL_ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const bankFile = process.argv[2] ?? 'docs/lab3/tasks.jsonl';
  const tasks = parseBank(readFileSync(bankFile, 'utf8'), process.env.EVAL_BUCKET ?? '', only);
  if (tasks.length === 0) throw new Error(`у ${bankFile} немає задач для цього фільтра`);

  const telemetry = startTelemetry();
  const ROOT = resolve('.');
  const git = (args: string[], cwd = ROOT) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  const sha = git(['rev-parse', '--short', 'HEAD']).trim();
  const resume = process.env.EVAL_RESUME === '1' && existsSync(DEFAULT_LOG);
  const done = resume ? doneAttempts(readFileSync(DEFAULT_LOG, 'utf8'), sha) : new Set<string>();
  // журнал — лише останній прогін: брама рахує всі рядки файлу, старі спроби змішалися б із новими
  if (!resume) writeFileSync(DEFAULT_LOG, '', 'utf8');

  const read = (dir: string, name: string) => {
    try {
      return readFileSync(join(dir, name), 'utf8');
    } catch {
      return '';
    }
  };

  for (const task of tasks) {
    for (let attempt = 1; attempt <= k; attempt += 1) {
      if (done.has(`${task.id}#${attempt}`)) continue;
      // чисте середовище на кожну спробу, а не на задачу: інакше друга спроба бачить файли першої
      const branch = `eval/${task.id}-${attempt}-${Date.now()}`;
      const tree = resolve(ROOT, '..', 'eval-runs', `${task.id}-${attempt}`);
      if (existsSync(tree)) throw new Error(`${tree} вже існує: зніміть попереднє дерево`);
      // HEAD, а не main: брама перевіряє саме цей коміт
      git(['worktree', 'add', '-q', '-b', branch, tree, 'HEAD']);
      const modules = join(tree, 'node_modules');
      symlinkSync(join(ROOT, 'node_modules'), modules, 'junction');
      let quota = false;
      try {
        const rec = runTaskTraced(task, { runner: agent.runner, agentPath: agent.path, model: agent.model, worktree: tree, outDir: join(ROOT, 'runs') }, telemetry.target);
        quota = rec.quota_hit;
        if (!quota) {
          const patch = read(rec.artifact_dir, 'patch.diff');
          assertPatchCaptured(patch, git(['diff', '--cached', '--name-only', '--', '.', ':(exclude).agent-log', ':(exclude)node_modules'], tree));
          const graders = grade({ task, patch, output: read(rec.artifact_dir, 'output.txt'), acceptance: rec.acceptance });
          // спроба успішна, лише якщо зелені всі оцінювачі з мітки; exit_status не оцінюється, але лишається в журналі
          const pass = graders.length > 0 && graders.every((g) => g.pass);
          appendFileSync(
            DEFAULT_LOG,
            `${JSON.stringify({
              task_id: task.id,
              bucket: task.bucket,
              frozen_at: task.frozen_at,
              agent: agent.path,
              model: agent.model,
              attempt,
              sha,
              pass,
              graders,
              duration_s: rec.duration_s,
              num_turns: rec.num_turns,
              input_tokens: rec.input_tokens,
              output_tokens: rec.output_tokens,
              cost_usd_estimate: rec.cost_usd_estimate,
              exit_status: rec.exit_status,
              result_subtype: rec.result_subtype,
              permission_denials: rec.permission_denials,
              artifact: relative(ROOT, rec.artifact_dir).replace(/\\/g, '/'),
              trace_id: rec.trace_id, // заповнює крок 06
              at: new Date().toISOString(),
            })}\n`,
          );
          console.log(`${task.id} #${attempt}: ${pass ? 'pass' : 'FAIL'} (${graders.filter((g) => !g.pass).map((g) => g.id).join(', ') || 'усі зелені'}), ${rec.exit_status}, ${rec.duration_s} с`);
        }
      } finally {
        // спершу знімаємо посилання, інакше видалення дерева могло б піти в справжній node_modules
        if (process.platform === 'win32') rmdirSync(modules);
        else unlinkSync(modules);
        git(['worktree', 'remove', tree, '--force']);
        git(['branch', '-q', '-D', branch]);
      }
      if (quota) {
        console.error(`${task.id} #${attempt}: вичерпано квоту. Прогін зупинено, дописати потім можна з EVAL_RESUME=1`);
        await telemetry.shutdown();
        process.exit(2);
      }
    }
  }

  const lines = readFileSync(DEFAULT_LOG, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as SummaryLine);
  console.table(summarize(lines, k));
  await telemetry.shutdown();
}

if (process.argv[1]?.endsWith('run-evals.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
