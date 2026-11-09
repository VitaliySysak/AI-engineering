/** Трасування кроку 06 без мережі: цілі експорту, середовище агента, trace_id у журналі прогону. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { trace, type Span, type Tracer } from '@opentelemetry/api';
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';

import { runTask, runTaskTraced, type Task } from '../../scripts/harness/run-task';
import { claudeTraceEnv, otlpTarget, parseHeaders, startTelemetry, telemetryEnv, traceparent, validTraceId, type Telemetry } from '../../src/telemetry/otel';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

describe('куди слати траси', () => {
  it('ключі Langfuse дають ЄС-адресу, Basic і версію ingestion', () => {
    const t = otlpTarget({ LANGFUSE_PUBLIC_KEY: 'pk', LANGFUSE_SECRET_KEY: 'sk' });
    expect(t?.endpoint).toBe('https://cloud.langfuse.com/api/public/otel');
    expect(t?.headers).toBe(`Authorization=Basic ${Buffer.from('pk:sk').toString('base64')},x-langfuse-ingestion-version=4`);
  });

  it('LANGFUSE_BASE_URL без кінцевого слеша, явні OTEL_* мають перевагу', () => {
    expect(otlpTarget({ LANGFUSE_PUBLIC_KEY: 'a', LANGFUSE_SECRET_KEY: 'b', LANGFUSE_BASE_URL: 'https://us.cloud.langfuse.com/' })?.endpoint).toBe('https://us.cloud.langfuse.com/api/public/otel');
    expect(otlpTarget({ LANGFUSE_PUBLIC_KEY: 'a', LANGFUSE_SECRET_KEY: 'b', OTEL_EXPORTER_OTLP_ENDPOINT: 'http://x/', OTEL_EXPORTER_OTLP_HEADERS: 'h=1' })).toEqual({ endpoint: 'http://x', headers: 'h=1' });
  });

  it('без ключів цілі немає', () => {
    expect(otlpTarget({})).toBeNull();
    expect(otlpTarget({ LANGFUSE_PUBLIC_KEY: 'a' })).toBeNull();
  });

  it('заголовки: знак = у base64 не ламає значення', () => {
    expect(parseHeaders('Authorization=Basic YWI6Yw==,x-langfuse-ingestion-version=4')).toEqual({ Authorization: 'Basic YWI6Yw==', 'x-langfuse-ingestion-version': '4' });
  });

  it('із файлу беруться лише змінні трасування, значення процесу важливіші', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-'));
    const file = join(dir, 'e');
    writeFileSync(file, 'LANGFUSE_PUBLIC_KEY=from-file\nLANGFUSE_SECRET_KEY=s\nANTHROPIC_API_KEY=must-not-pass\nGEMINI_API_KEY=must-not-pass\n');
    const env = telemetryEnv(file, { LANGFUSE_SECRET_KEY: 'from-process' });
    expect(env.LANGFUSE_PUBLIC_KEY).toBe('from-file');
    expect(env.LANGFUSE_SECRET_KEY).toBe('from-process');
    expect(JSON.stringify(env)).not.toContain('must-not-pass');
    rmSync(dir, { recursive: true, force: true });
  });

  it('файлу немає — не помилка', () => {
    expect(telemetryEnv(join(tmpdir(), 'немає-такого'), {}).LANGFUSE_PUBLIC_KEY).toBeUndefined();
  });
});

describe('середовище Claude Code', () => {
  const t = { endpoint: 'https://l/api/public/otel', headers: 'h=1' };

  it('трасування ввімкнено, батько — спан задачі, HTTP', () => {
    const env = claudeTraceEnv(t, traceparent('a'.repeat(32), 'b'.repeat(16)));
    expect(env.CLAUDE_CODE_ENABLE_TELEMETRY).toBe('1');
    expect(env.CLAUDE_CODE_ENHANCED_TELEMETRY_BETA).toBe('1');
    expect(env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT).toBe('https://l/api/public/otel/v1/traces');
    expect(env.OTEL_EXPORTER_OTLP_TRACES_PROTOCOL).toMatch(/^http/);
    expect(env.TRACEPARENT).toBe(`00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`);
  });

  it('вміст промптів і деталі інструментів не вмикаються', () => {
    const keys = Object.keys(claudeTraceEnv(t, 'p'));
    for (const k of ['OTEL_LOG_USER_PROMPTS', 'OTEL_LOG_TOOL_DETAILS', 'OTEL_LOG_TOOL_CONTENT', 'OTEL_LOG_RAW_API_BODIES']) expect(keys).not.toContain(k);
  });

  it('нульовий ідентифікатор не пишеться в журнал', () => {
    expect(validTraceId('0'.repeat(32))).toBeNull();
    expect(validTraceId('ab'.repeat(16))).toBe('ab'.repeat(16));
  });
});

describe('справжній SDK без експорту', () => {
  let telemetry: Telemetry;
  beforeAll(() => {
    telemetry = startTelemetry({});
  });
  afterAll(() => telemetry.shutdown());

  it('без цілі спан усе одно має справжній ідентифікатор', () => {
    expect(telemetry.target).toBeNull();
    const id = trace.getTracer('t').startActiveSpan('x', (span) => {
      const v = span.spanContext().traceId;
      span.end();
      return v;
    });
    expect(validTraceId(id)).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('задача в спані', () => {
  let root: string;
  let repo: string;
  const task: Task = { id: 't-x', input: 'i', acceptance: [], budget: { max_turns: 1, max_usd: 0.1, timeout_s: 5 } };
  const IDS = { traceId: 'c'.repeat(32), spanId: 'd'.repeat(16), traceFlags: 1 };
  let attrs: Record<string, unknown>;
  let ended: number;
  const tracer = {
    startActiveSpan: (_n: string, fn: (s: Span) => unknown) => fn({ spanContext: () => IDS, setAttributes: (a: Record<string, unknown>) => void Object.assign(attrs, a), end: () => void (ended += 1) } as unknown as Span),
  } as unknown as Tracer;
  const seen: Record<string, string | undefined> = {};
  const runner = () => {
    seen.parent = process.env.TRACEPARENT;
    seen.beta = process.env.CLAUDE_CODE_ENHANCED_TELEMETRY_BETA;
    return { exitCode: 0, stdout: '{}', stderr: '', timedOut: false };
  };

  beforeEach(() => {
    attrs = {};
    ended = 0;
    delete seen.parent;
    delete seen.beta;
    root = mkdtempSync(join(tmpdir(), 'traced-'));
    repo = join(root, 'repo');
    mkdirSync(repo);
    execFileSync('git', ['init', '-q'], { cwd: repo });
    execFileSync('git', ['-c', 'user.email=a@a', '-c', 'user.name=a', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: repo });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const target = { endpoint: 'https://l', headers: 'h=1' };
  const opts = (agentPath: string) => ({ runner, agentPath, worktree: repo, outDir: join(root, 'out') });

  it('trace_id є і в результаті, і в run.json; спан закрито', () => {
    const rec = runTaskTraced(task, opts('claude-code -p'), target, tracer);
    expect(rec.trace_id).toBe(IDS.traceId);
    expect(JSON.parse(readFileSync(join(rec.artifact_dir, 'run.json'), 'utf8')).trace_id).toBe(IDS.traceId);
    expect(ended).toBe(1);
    expect(attrs['harness.task_id']).toBe('t-x');
  });

  it('Claude бачить TRACEPARENT, після задачі змінних немає', () => {
    runTaskTraced(task, opts('claude-code -p'), target, tracer);
    expect(seen.parent).toBe(`00-${IDS.traceId}-${IDS.spanId}-01`);
    expect(seen.beta).toBe('1');
    expect(process.env.TRACEPARENT).toBeUndefined();
    expect(process.env.CLAUDE_CODE_ENHANCED_TELEMETRY_BETA).toBeUndefined();
  });

  it('чуже значення змінної відновлюється', () => {
    process.env.TRACEPARENT = 'було';
    runTaskTraced(task, opts('claude-code -p'), target, tracer);
    expect(process.env.TRACEPARENT).toBe('було');
    delete process.env.TRACEPARENT;
  });

  it('інший агент або відсутня ціль — без змінних Claude, але trace_id є', () => {
    expect(runTaskTraced(task, opts('gemini-cli'), target, tracer).trace_id).toBe(IDS.traceId);
    expect(seen.parent).toBeUndefined();
    runTaskTraced(task, opts('claude-code -p'), null, tracer);
    expect(seen.parent).toBeUndefined();
  });

  it('runTask без спана лишає null', () => {
    expect(runTask(task, opts('x')).trace_id).toBeNull();
  });
});
