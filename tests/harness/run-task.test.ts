/**
 * Виконавець фабрики (Лабораторна 3, крок 00) без мережі й без ключів: підставний агент у тимчасовому
 * git-репозиторії. Перевіряємо не модель, а обв'язку: журнал прогону пишеться ЗАВЖДИ — коли агент упав,
 * коли впорався в нуль ходів, коли вичерпав бюджет, коли спрацював таймаут і коли сам запуск кинув виняток.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  allowedToolsFor,
  claudeArgs,
  readMeta,
  relocate,
  runTask,
  type AgentResult,
  type AgentRunner,
  type RunRecord,
  type Task,
} from '../../scripts/harness/run-task';

const task: Task = {
  id: 't-99',
  input: 'додай файл hello.txt',
  acceptance: ['node -e "process.exit(0)"'],
  budget: { max_turns: 12, max_usd: 0.3, timeout_s: 60 },
  files: ['hello.txt'],
};

let root: string;
let tree: string;
let out: string;

const git = (args: string[]) => execFileSync('git', args, { cwd: tree, encoding: 'utf8' });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'harness-'));
  tree = join(root, 'tree');
  out = join(root, 'runs');
  mkdirSync(join(tree, '.agent-log'), { recursive: true });
  writeFileSync(join(tree, 'README.md'), 'старт\n');
  writeFileSync(join(tree, '.agent-log', 'claude-code.jsonl'), '');
  git(['init', '-q']);
  git(['config', 'core.autocrlf', 'false']); // без попереджень LF/CRLF у виводі тестів на Windows
  git(['-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A']);
  git(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init']);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const fake =
  (result: Partial<AgentResult>, act?: (cwd: string) => void): AgentRunner =>
  (_task, cwd) => {
    act?.(cwd);
    return { exitCode: 0, stdout: '', stderr: '', timedOut: false, ...result };
  };

function run(runner: AgentRunner): RunRecord {
  return runTask(task, { runner, agentPath: 'fake', model: 'fake-model', worktree: tree, outDir: out });
}

function filesOf(rec: RunRecord): string[] {
  return ['patch.diff', 'output.txt', 'agent.log', 'run.json'].filter((f) => existsSync(join(rec.artifact_dir, f)));
}

describe('runTask — журнал пишеться завжди', () => {
  it('успіх: новий файл потрапляє в patch.diff, run.json вказує на свою теку', () => {
    const rec = run(fake({ stdout: '{"session_id":"s-1","subtype":"success"}' }, (cwd) => writeFileSync(join(cwd, 'hello.txt'), 'привіт\n')));
    expect(filesOf(rec)).toEqual(['patch.diff', 'output.txt', 'agent.log', 'run.json']);
    expect(readFileSync(join(rec.artifact_dir, 'patch.diff'), 'utf8')).toContain('+++ b/hello.txt');
    const saved = JSON.parse(readFileSync(join(rec.artifact_dir, 'run.json'), 'utf8')) as RunRecord;
    expect(saved.artifact_dir).toBe(rec.artifact_dir);
    expect(saved.exit_status).toBe('ok');
    expect(saved.acceptance_passed).toBe(true);
    expect(saved.session_id).toBe('s-1');
    expect(saved.task_id).toBe('t-99');
    expect(rec.artifact_dir).toMatch(/t-99-\d+$/);
  });

  it('агент упав (ненульовий код) — журнал є, статус agent_failed', () => {
    const rec = run(fake({ exitCode: 1, stderr: 'щось зламалося' }));
    expect(filesOf(rec)).toHaveLength(4);
    expect(rec.exit_status).toBe('agent_failed');
    expect(rec.exit_code).toBe(1);
    expect(readFileSync(join(rec.artifact_dir, 'agent.log'), 'utf8')).toBe('щось зламалося');
  });

  it('нуль ходів, нічого не змінено — порожній patch.diff, журнал є', () => {
    const rec = run(fake({}));
    expect(readFileSync(join(rec.artifact_dir, 'patch.diff'), 'utf8')).toBe('');
    expect(rec.exit_status).toBe('ok');
  });

  it('вичерпаний бюджет — журнал зберігає оцінку вартості, сесію й subtype', () => {
    const stdout = JSON.stringify({ type: 'result', subtype: 'error_max_budget_usd', is_error: true, session_id: 's-2', num_turns: 5, total_cost_usd: 0.31, usage: { input_tokens: 1200, output_tokens: 300 } });
    const rec = run(fake({ exitCode: 1, stdout }));
    expect(rec.exit_status).toBe('agent_failed');
    expect(rec.result_subtype).toBe('error_max_budget_usd');
    expect(rec.cost_usd_estimate).toBe(0.31);
    expect(rec.num_turns).toBe(5);
    expect(rec.input_tokens).toBe(1200); // без кеш-полів повний вхід = usage.input_tokens
    expect(existsSync(join(rec.artifact_dir, 'run.json'))).toBe(true);
  });

  it('таймаут — статус timeout, а не agent_failed', () => {
    expect(run(fake({ exitCode: 1, timedOut: true })).exit_status).toBe('timeout');
  });

  it('запуск агента кинув виняток — журнал однаково написано', () => {
    const rec = run(() => {
      throw new Error('spawn claude ENOENT');
    });
    expect(rec.exit_status).toBe('agent_failed');
    expect(readFileSync(join(rec.artifact_dir, 'agent.log'), 'utf8')).toContain('spawn claude ENOENT');
    expect(existsSync(join(rec.artifact_dir, 'run.json'))).toBe(true);
  });

  it('журнал дій агента (.agent-log) не потрапляє в patch.diff, а йде в agent-actions.jsonl', () => {
    const rec = run(
      fake({}, (cwd) => {
        writeFileSync(join(cwd, 'hello.txt'), 'привіт\n');
        appendFileSync(join(cwd, '.agent-log', 'claude-code.jsonl'), '{"tool":"Write"}\n');
      }),
    );
    const patch = readFileSync(join(rec.artifact_dir, 'patch.diff'), 'utf8');
    expect(patch).not.toContain('.agent-log');
    expect(readFileSync(join(rec.artifact_dir, 'agent-actions.jsonl'), 'utf8')).toBe('{"tool":"Write"}\n');
  });

  it('acceptance — справжні команди в дереві; провал однієї робить прогін непройденим', () => {
    const failing = { ...task, acceptance: ['node -e "process.exit(0)"', 'node -e "process.exit(3)"'] };
    const rec = runTask(failing, { runner: fake({}), agentPath: 'fake', worktree: tree, outDir: out });
    expect(rec.acceptance).toEqual([
      { cmd: 'node -e "process.exit(0)"', exit: 0 },
      { cmd: 'node -e "process.exit(3)"', exit: 3 },
    ]);
    expect(rec.acceptance_passed).toBe(false);
  });

  it('порожній acceptance ніколи не дає «пройдено»', () => {
    const rec = runTask({ ...task, acceptance: [] }, { runner: fake({}), agentPath: 'fake', worktree: tree, outDir: out });
    expect(rec.acceptance_passed).toBe(false);
  });

  it('повторний прогін тієї самої задачі не перезаписує попередній артефакт', () => {
    const a = run(fake({}));
    const b = run(fake({}));
    expect(a.artifact_dir).not.toBe(b.artifact_dir);
    expect(existsSync(join(a.artifact_dir, 'run.json'))).toBe(true);
  });
});

describe('readMeta', () => {
  it('не-JSON вивід дає null у всіх полях, а не виняток', () => {
    expect(readMeta('Error: not logged in')).toEqual({
      session_id: null, result_subtype: null, num_turns: null, input_tokens: null, cache_read_tokens: null,
      output_tokens: null, permission_denials: null, cost_usd_estimate: null,
    });
  });

  it('повний вхід = некешований + прочитаний з кешу + записаний у кеш (числа справжнього прогону t-01)', () => {
    const meta = readMeta(JSON.stringify({
      session_id: 'a7b8', subtype: 'success', num_turns: 9, total_cost_usd: 0.00556803,
      usage: { input_tokens: 10, cache_creation_input_tokens: 18357, cache_read_input_tokens: 56063, output_tokens: 2670 },
      permission_denials: [{ tool_name: 'Bash' }],
    }));
    expect(meta.input_tokens).toBe(74430);
    expect(meta.cache_read_tokens).toBe(56063);
    expect(meta.output_tokens).toBe(2670);
    expect(meta.permission_denials).toBe(1);
  });
});

describe('relocate', () => {
  it('журнал відібраної копії вказує на саму копію, сирий шлях лишається окремо', () => {
    const rec = run(fake({}));
    const moved = relocate(rec, 'docs\\lab3\\runs\\t-99-1');
    expect(moved.artifact_dir).toBe('docs/lab3/runs/t-99-1');
    expect(moved.raw_artifact_dir).toBe(rec.artifact_dir);
    expect(moved.task_id).toBe(rec.task_id);
  });
});

describe('дозволи агента', () => {
  it('змінювати — лише файли задачі; з оболонки — лише команди перевірки', () => {
    const allowed = allowedToolsFor({ ...task, files: ['src/a.ts', 'tests/a.test.ts'] });
    expect(allowed).toContain('Edit(src/a.ts)');
    expect(allowed).toContain('Write(tests/a.test.ts)');
    expect(allowed).not.toContain('Edit');
    expect(allowed.filter((t) => t.startsWith('Bash(')).every((t) => /^Bash\((npm|npx tsx scripts\/validate-golden|git (diff|status))/.test(t))).toBe(true);
  });

  it('виклик claude: dontAsk, без обходу дозволів, з бюджетом і без MCP-серверів проєкту', () => {
    const argv = claudeArgs(task);
    expect(argv[argv.indexOf('--permission-mode') + 1]).toBe('dontAsk');
    expect(argv).not.toContain('--dangerously-skip-permissions');
    expect(argv).not.toContain('bypassPermissions');
    expect(argv[argv.indexOf('--max-turns') + 1]).toBe('12');
    expect(argv[argv.indexOf('--max-budget-usd') + 1]).toBe('0.3');
    expect(argv).toContain('--strict-mcp-config');
    expect(argv[argv.indexOf('-p') + 1]).toBe(task.input);
  });
});
