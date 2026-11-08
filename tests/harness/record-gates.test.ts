/**
 * Свідок брам і форма ланцюга (Лабораторна 3, крок 01) без мережі: record-gates.mjs запускається окремим процесом
 * у тимчасовій теці, gates.yml перевіряється як текст — на те, що ламається тихо.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve('scripts/harness/record-gates.mjs');
const GREEN = ['--types', 'success', '--lint', 'success', '--tests', 'success', '--build', 'success'];
const CONFIRMED = ['--types-output', 'pass', '--lint-output', 'pass', '--tests-output', 'pass', '--build-output', 'pass'];

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'gates-'));
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

function addRun(name: string): string {
  const dir = join(cwd, 'docs', 'lab3', 'runs', name);
  mkdirSync(dir, { recursive: true });
  const id = name.replace(/-\d+$/, '');
  writeFileSync(join(dir, 'run.json'), JSON.stringify({ task_id: id, artifact_dir: `docs/lab3/runs/${name}`, gates: {} }));
  return join(dir, 'run.json');
}

function record(args: readonly string[]) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args, '--run-url', 'https://ci/1'], { cwd, encoding: 'utf8' });
  const file = join(cwd, 'gate-record.json');
  return { code: r.status, out: r.stdout + r.stderr, record: existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null };
}

const readRun = (file: string) => JSON.parse(readFileSync(file, 'utf8'));

describe('record-gates', () => {
  it('гілка задачі: вердикти йдуть у run.json НАЙНОВІШОГО прогону цієї задачі (за міткою в імені, не за mtime)', () => {
    const old = addRun('t-01-100');
    const fresh = addRun('t-01-200');
    const other = addRun('t-010-300'); // t-01 не повинно збігтися з t-010
    const { code, record: rec } = record([...GREEN, ...CONFIRMED, '--branch', 'harness/t-01']);
    expect(code).toBe(0);
    expect(rec.task_id).toBe('t-01');
    expect(rec.artifact_dir).toBe('docs/lab3/runs/t-01-200');
    expect(rec.gates).toEqual({ types: 'pass', lint: 'pass', tests: 'pass', build: 'pass' });
    expect(rec.ci_run_url).toBe('https://ci/1');
    expect(readRun(fresh).gates).toEqual(rec.gates);
    expect(readRun(fresh).ci_run_url).toBe('https://ci/1');
    expect(readRun(old).gates).toEqual({});
    expect(readRun(other).gates).toEqual({});
    expect(JSON.parse(readFileSync(join(cwd, 'gate-run.json'), 'utf8')).task_id).toBe('t-01');
  });

  it('червоний прогін: failure → fail, пропущені → skipped, скасована → skipped', () => {
    addRun('t-02-1');
    const { code, record: rec } = record(['--types', 'failure', '--lint', 'skipped', '--tests', 'cancelled', '--build', 'skipped', '--branch', 'harness/t-02']);
    expect(code).toBe(0); // свідок сам нічого не вирішує
    expect(rec.gates).toEqual({ types: 'fail', lint: 'skipped', tests: 'skipped', build: 'skipped' });
  });

  it('outputs.verdict — лише підтвердження: на впалій брамі порожній, факт береться з result', () => {
    addRun('t-02-1');
    const { record: rec } = record(['--types', 'failure', '--types-output', '', '--lint', 'skipped', '--tests', 'skipped', '--build', 'skipped', '--branch', 'harness/t-02']);
    expect(rec.gates.types).toBe('fail');
    expect(rec.confirmed.types).toBe(false);
  });

  it('зелені брами з підтвердженням', () => {
    const { record: rec } = record([...GREEN, ...CONFIRMED, '--branch', 'main']);
    expect(rec.confirmed).toEqual({ types: true, lint: true, tests: true, build: true });
  });

  it('гілка не задачі (main, lab3/step-01, harness/red-*): task_id null, run.json не чіпаємо, код 0', () => {
    const run = addRun('t-01-100');
    for (const branch of ['main', 'lab3/step-01', 'harness/red-2026-11-08']) {
      const { code, record: rec } = record([...GREEN, '--branch', branch]);
      expect(code).toBe(0);
      expect(rec.task_id).toBeNull();
      expect(rec.branch).toBe(branch);
    }
    expect(readRun(run).gates).toEqual({});
    expect(existsSync(join(cwd, 'gate-run.json'))).toBe(false);
  });

  it('гілка задачі без прогону в репозиторії: не падає, але каже про це в note', () => {
    const { code, record: rec } = record([...GREEN, '--branch', 'harness/t-99']);
    expect(code).toBe(0);
    expect(rec.task_id).toBeNull();
    expect(rec.note).toMatch(/немає прогону задачі t-99/);
  });
});

describe('gates.yml — те, що ламається тихо', () => {
  const yml = readFileSync('.github/workflows/gates.yml', 'utf8');
  const job = (name: string, next?: string): string => {
    const from = yml.indexOf(`\n  ${name}:\n`);
    const to = next === undefined ? yml.length : yml.indexOf(`\n  ${next}:\n`);
    return yml.slice(from, to);
  };
  const JOBS = [['types', 'lint'], ['lint', 'tests'], ['tests', 'build'], ['build', 'record'], ['record', undefined]] as const;

  it('кожна задача має явний timeout-minutes', () => {
    for (const [name, next] of JOBS) expect(job(name, next), name).toMatch(/timeout-minutes: \d+/);
  });

  it('ланцюг зв\'язаний needs у порядку types → lint → tests → build', () => {
    expect(job('types', 'lint')).not.toMatch(/\n    needs:/);
    expect(job('lint', 'tests')).toMatch(/needs: types\b/);
    expect(job('tests', 'build')).toMatch(/needs: lint\b/);
    expect(job('build', 'record')).toMatch(/needs: tests\b/);
  });

  it('record бачить усі чотири брами і виконується на червоному — з дужками ${{ }}, не always()', () => {
    const record = job('record');
    expect(record).toMatch(/needs: \[types, lint, tests, build\]/);
    expect(record).toContain('if: ${{ !cancelled() }}');
    expect(yml).not.toContain('always()');
  });

  it('verify — після всіх чотирьох брам, лише на harness/t-*, без функції статусу (неявний success()), секрет лише тут', () => {
    const verify = yml.slice(yml.indexOf('\n  verify:\n'));
    expect(verify).toMatch(/needs: \[types, lint, tests, build\]/);
    expect(verify).toContain("if: ${{ startsWith(github.ref, 'refs/heads/harness/t-') }}");
    expect(verify).toMatch(/timeout-minutes: \d+/);
    expect(verify).toContain('secrets.GEMINI_API_KEY');
    expect(yml.slice(0, yml.indexOf('\n  verify:\n'))).not.toContain('secrets.');
  });

  it('новий push скасовує попередній прогін', () => {
    expect(yml).toContain('group: ${{ github.workflow }}-${{ github.ref }}');
    expect(yml).toContain('cancel-in-progress: true');
  });

  it('мажори дій артефактів різні: upload@v7, download@v8', () => {
    expect(yml).toContain('actions/upload-artifact@v7');
    expect(yml).toContain('actions/download-artifact@v8');
    expect(yml).not.toContain('actions/download-artifact@v7');
  });

  it('кожна брама пише verdict у вихід задачі', () => {
    for (const [name, next] of JOBS.slice(0, 4)) {
      expect(job(name, next), name).toContain('echo "verdict=pass" >> "$GITHUB_OUTPUT"');
      expect(job(name, next), name).toContain('verdict: ${{ steps.g.outputs.verdict }}');
    }
  });
});
