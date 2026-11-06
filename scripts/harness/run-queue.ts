/**
 * Черга фабрики (Лабораторна 3, крок 00): одна задача або всі. Готує git worktree і прибирає після себе.
 * run-task.ts нічого не знає ні про чергу, ні про git-дерева — їх тримає цей файл.
 *
 *   npx tsx scripts/harness/run-queue.ts docs/lab3/tasks.jsonl --id t-01     одна задача
 *   npx tsx scripts/harness/run-queue.ts docs/lab3/tasks.jsonl               усі
 *   ... --push                                                               ще й відправити гілку harness/<id>
 *
 * ВИТРАЧАЄ ЛІМІТ ПІДПИСКИ (claude -p) — запускає автор.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmdirSync, symlinkSync, unlinkSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { CLAUDE_MODEL, claudeRunner, runTask, type Task } from './run-task';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--id') ?? 'docs/lab3/tasks.jsonl';
const onlyId = args.includes('--id') ? (args[args.indexOf('--id') + 1] ?? null) : null;
const push = args.includes('--push');

const tasks: Task[] = readFileSync(file, 'utf8')
  .replace(/^﻿/, '')
  .split(/\r?\n/)
  .filter((l) => l.trim() !== '')
  .map((l) => JSON.parse(l) as Task)
  .filter((t) => onlyId === null || t.id === onlyId);

if (tasks.length === 0) throw new Error(`у ${file} немає задач${onlyId ? ` з id ${onlyId}` : ''}`);

const ROOT = resolve('.');
const git = (gitArgs: string[], cwd = ROOT) => execFileSync('git', gitArgs, { cwd, encoding: 'utf8' });

/** Що змінено в основному checkout — крім очікуваних шляхів (артефакти, журнал дій сесії автора). */
const EXPECTED = /^(docs\/lab3\/runs\/|runs\/|\.agent-log\/)/;
const dirtyMain = () =>
  git(['status', '--porcelain'])
    .split('\n')
    .map((l) => l.slice(3).trim())
    .filter((p) => p !== '' && !EXPECTED.test(p));

for (const task of tasks) {
  const branch = `harness/${task.id}`;
  const tree = resolve(ROOT, '..', 'harness-runs', task.id);
  const before = new Set(dirtyMain());
  if (existsSync(tree)) throw new Error(`${tree} вже існує — зніміть попереднє дерево: git worktree remove ${tree} --force`);
  // -B: повторний прогін тієї самої задачі починає гілку заново від main; артефакт попереднього лишився в docs/lab3/runs/
  git(['worktree', 'add', '-B', branch, tree, 'main']);
  // node_modules у новому дереві немає: junction на основний (лише посилання, без копіювання й без мережі)
  const modules = join(tree, 'node_modules');
  symlinkSync(join(ROOT, 'node_modules'), modules, 'junction');
  try {
    const rec = runTask(task, { runner: claudeRunner, agentPath: 'claude-code -p', model: CLAUDE_MODEL, worktree: tree, outDir: join(ROOT, 'runs') });
    // артефакт — у репозиторій; сира runs/ лишається поза git
    const keep = join(ROOT, 'docs', 'lab3', 'runs', basename(rec.artifact_dir));
    mkdirSync(keep, { recursive: true });
    cpSync(rec.artifact_dir, keep, { recursive: true });
    // комітимо лише проіндексоване виконавцем (без .agent-log): -a тут не можна
    if (git(['diff', '--cached', '--name-only'], tree).trim() !== '') {
      git(['commit', '-m', `harness: ${task.id}`], tree);
      if (push) git(['push', '-u', 'origin', branch], tree);
    }
    const leaked = dirtyMain().filter((p) => !before.has(p));
    console.log(
      `${task.id}: ${rec.exit_status} (exit ${rec.exit_code}, ${rec.result_subtype ?? '—'}), ` +
        `acceptance ${rec.acceptance_passed ? 'pass' : 'fail'}, ${rec.duration_s} с → ${keep}`,
    );
    console.log(leaked.length === 0 ? '  основний checkout чистий' : `  УВАГА: змінено основний checkout: ${leaked.join(', ')}`);
  } finally {
    // спершу знімаємо junction (лише посилання), інакше видалення дерева могло б піти в справжній node_modules
    if (process.platform === 'win32') rmdirSync(modules);
    else unlinkSync(modules);
    git(['worktree', 'remove', tree, '--force']);
  }
}
