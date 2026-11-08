/**
 * Знімання артефакту на справжньому git, без мережі й агента. Регресія кроку 04: :(exclude)node_modules у git add давав
 * код 1 на ігнорованому junction, патч лишався порожнім, а спроба з новим файлом отримувала хибний pass.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runTask, type Task } from '../../scripts/harness/run-task';
import { assertPatchCaptured } from '../../scripts/evals/run-evals';

let root: string;
let repo: string;
const task: Task = { id: 't-x', input: 'i', acceptance: [], budget: { max_turns: 1, max_usd: 0.1, timeout_s: 5 } };
const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=a@a', '-c', 'user.name=a', ...args], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'patch-'));
  repo = join(root, 'repo');
  mkdirSync(repo);
  mkdirSync(join(root, 'real-modules'));
  git('init', '-q');
  writeFileSync(join(repo, '.gitignore'), 'node_modules/\n');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  // те саме посилання, що створюють run-queue і run-evals: junction у Windows, symlink у Linux
  symlinkSync(join(root, 'real-modules'), join(repo, 'node_modules'), 'junction');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('знімання патча', () => {
  it('новий файл агента є в patch.diff, а node_modules немає', () => {
    const rec = runTask(task, {
      runner: () => {
        writeFileSync(join(repo, 'new-file.txt'), 'зміна\n');
        return { exitCode: 0, stdout: '{}', stderr: '', timedOut: false };
      },
      agentPath: 'stub',
      worktree: repo,
      outDir: join(root, 'out'),
    });
    const patch = readFileSync(join(rec.artifact_dir, 'patch.diff'), 'utf8');
    expect(patch).toContain('new-file.txt');
    expect(patch).not.toContain('node_modules');
  });

  it('агент нічого не змінив — патч порожній законно', () => {
    const rec = runTask(task, { runner: () => ({ exitCode: 0, stdout: '{}', stderr: '', timedOut: false }), agentPath: 'stub', worktree: repo, outDir: join(root, 'out') });
    expect(readFileSync(join(rec.artifact_dir, 'patch.diff'), 'utf8')).toBe('');
  });
});

describe('запобіжник порожнього артефакту', () => {
  it('порожній патч при змінах в індексі — збій, а не вердикт', () => {
    expect(() => assertPatchCaptured('', 'tests/a.test.ts\n')).toThrow(/tests\/a\.test\.ts/);
  });

  it('законні випадки проходять', () => {
    expect(() => assertPatchCaptured('', '')).not.toThrow();
    expect(() => assertPatchCaptured('diff --git a/x b/x\n', 'x\n')).not.toThrow();
  });
});
