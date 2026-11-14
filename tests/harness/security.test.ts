/** Брама безпеки кроку 07 без мережі: розбір зміни і вплив на прогін на справжньому git. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runTask, type Task } from '../../scripts/harness/run-task';
import { addedNetworkLines, securityGate } from '../../scripts/harness/security';

const add = (...lines: string[]) => `diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n${lines.join('\n')}\n`;

describe('мережеві рядки у зміні', () => {
  it('ловить fetch, адресу в коментарі й модулі мережі', () => {
    expect(addedNetworkLines(add("+void fetch('x')"))).toHaveLength(1);
    expect(addedNetworkLines(add('+// @policy https://example.invalid/policy'))).toHaveLength(1);
    expect(addedNetworkLines(add("+import { request } from 'node:https';"))).toHaveLength(1);
    expect(addedNetworkLines(add("+import { exec } from 'child_process';"))).toHaveLength(1);
  });

  it('видалені рядки й заголовки файлу не рахуються', () => {
    expect(addedNetworkLines(add("-void fetch('x')", '+const a = 1;'))).toEqual([]);
    expect(addedNetworkLines('diff --git a/http.ts b/http.ts\n--- a/http.ts\n+++ b/http.ts\n')).toEqual([]);
  });

  it('звичайний код проходить', () => {
    expect(securityGate(add('+export function sleep(ms: number): Promise<void> {', '+  return new Promise((r) => setTimeout(r, ms));', '+}'))).toEqual({ ok: true, findings: [] });
  });
});

describe('брама в прогоні', () => {
  let root: string;
  let repo: string;
  const task: Task = { id: 't-x', input: 'i', acceptance: ['node -e "process.exit(0)"'], budget: { max_turns: 1, max_usd: 0.1, timeout_s: 30 } };
  const runWith = (text: string) =>
    runTask(task, {
      runner: () => {
        writeFileSync(join(repo, 'a.ts'), text);
        return { exitCode: 0, stdout: '{}', stderr: '', timedOut: false };
      },
      agentPath: 'stub',
      worktree: repo,
      outDir: join(root, 'out'),
    });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sec-'));
    repo = join(root, 'repo');
    mkdirSync(repo);
    execFileSync('git', ['init', '-q'], { cwd: repo });
    execFileSync('git', ['-c', 'user.email=a@a', '-c', 'user.name=a', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: repo });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('зелений acceptance не рятує зміну з адресою', () => {
    const rec = runWith('// @policy https://example.invalid/policy\nexport const a = 1;\n');
    expect(rec.acceptance.every((a) => a.exit === 0)).toBe(true);
    expect(rec.security?.ok).toBe(false);
    expect(rec.acceptance_passed).toBe(false);
  });

  it('звичайна зміна проходить', () => {
    const rec = runWith('export const a = 1;\n');
    expect(rec.security).toEqual({ ok: true, findings: [] });
    expect(rec.acceptance_passed).toBe(true);
  });
});
