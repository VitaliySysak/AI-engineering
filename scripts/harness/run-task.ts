/**
 * Виконавець фабрики задач (Лабораторна 3, крок 00). Каркас курсу з відхиленнями, позначеними нижче.
 * Один виклик = одна задача = один артефакт + один журнал прогону.
 *
 * Виконавець не має власного інтелекту: запускає агента в ГОТОВОМУ робочому дереві (його створює
 * run-queue.ts), забирає артефакт і ЗАВЖДИ пише run.json — навіть коли агент упав або кинув виняток.
 * Запуск агента — параметр (AgentRunner), тому тести працюють з підставним агентом без мережі.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { trace, type Tracer } from '@opentelemetry/api';

import { CATALOG } from '../../src/models';
import { claudeTraceEnv, traceparent, validTraceId, type OtlpTarget } from '../../src/telemetry/otel';

export interface Task {
  readonly id: string;
  readonly input: string;
  readonly acceptance: readonly string[];
  readonly budget: { readonly max_turns: number; readonly max_usd: number; readonly timeout_s: number };
  readonly files?: readonly string[];
  // Поля evals (крок 04); необов'язкові, щоб черги кроків 00–03 парсились без змін.
  /** Еталонна мітка: ключ — id оцінювача, значення — очікуваний результат. */
  readonly label?: Readonly<Record<string, boolean>>;
  /** З якого прогону взялася задача. */
  readonly source?: string;
  readonly bucket?: 'regression' | 'new' | 'edge';
  /** Дата заморозки банку, РРРР-ММ-ДД. */
  readonly frozen_at?: string;
}

export interface AgentResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  /** true, якщо процес убив таймаут, а не агент завершився сам */
  readonly timedOut: boolean;
}

/** Запуск агента. У тестах підмінюється підставним. */
export type AgentRunner = (task: Task, cwd: string) => AgentResult;

export interface RunRecord {
  readonly task_id: string;
  readonly agent_path: string;
  readonly model: string | null;
  readonly artifact_dir: string;
  readonly started_at: string;
  readonly ended_at: string;
  readonly duration_s: number;
  readonly exit_status: 'ok' | 'agent_failed' | 'timeout';
  readonly exit_code: number;
  readonly acceptance: readonly { readonly cmd: string; readonly exit: number }[];
  readonly acceptance_passed: boolean;
  readonly session_id: string | null;
  /** subtype результату Claude Code (наприклад, 'success'); розрізняє вичерпаний бюджет і падіння — крок 03 */
  readonly result_subtype: string | null;
  readonly num_turns: number | null;
  /** ПОВНИЙ вхід: usage.input_tokens + cache_read_input_tokens + cache_creation_input_tokens (як Usage у src/cost.ts) */
  readonly input_tokens: number | null;
  /** з них прочитано з кешу */
  readonly cache_read_tokens: number | null;
  readonly output_tokens: number | null;
  /** скільки викликів інструментів відхилив dontAsk (permission_denials у JSON Claude Code) */
  readonly permission_denials: number | null;
  /** Відмова провайдера за квотою (HTTP 429 / usage limit) — для брейкера це умова спрацювання, а не невдача задачі. */
  readonly quota_hit: boolean;
  /** total_cost_usd — КЛІЄНТСЬКА ОЦІНКА Claude Code, не рахунок (за підпискою Pro грошей не списано) */
  readonly cost_usd_estimate: number | null;
  readonly trace_id: string | null; // крок 06
  readonly gates: Record<string, 'pass' | 'fail' | 'skipped'>; // крок 01
}

/** Модель виконавця — рішення автора 2026-11-06 (factory.md): Haiku, бо задачі дрібні й однакової форми. */
export const CLAUDE_MODEL = 'haiku';

/**
 * Спільна обв'язка процесу: таймаут задачі тримає сам процес.
 * Відхилення від курсу: shell лише для .cmd-обгорток. Claude Code тут — нативний claude.exe (WinGet), і оболонка
 * розбила б input задачі з пробілами й лапками на окремі аргументи.
 */
function spawnAgent(bin: string, args: readonly string[], cwd: string, timeoutS: number, shell = false): AgentResult {
  const r = spawnSync(bin, [...args], {
    cwd,
    encoding: 'utf8',
    timeout: timeoutS * 1000,
    // SIGINT дає агентові завершити хід; на Windows процес завершується безумовно
    killSignal: 'SIGINT',
    shell,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    exitCode: r.status ?? 1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? (r.error ? String(r.error) : ''),
    timedOut: r.error !== undefined && (r.error as NodeJS.ErrnoException).code === 'ETIMEDOUT',
  };
}

/** Модель безкоштовного рівня для Gemini CLI: та сама, що в судді; типова модель CLI має меншу квоту. */
export const GEMINI_CLI_MODEL = CATALOG['gemini-3.5-flash-lite'].id;

/**
 * Аргументи Gemini CLI (звірено з docs/cli/cli-reference.md, 0.67.0). auto_edit схвалює лише replace і write_file;
 * усе, що потребує підтвердження, у headless-режимі відхиляється, тож yolo не потрібен. --skip-trust — вимога
 * неінтерактивного запуску: без довіри до теки CLI завершується з FatalUntrustedWorkspaceError (docs/cli/trusted-folders.md).
 */
export function geminiArgs(task: Task): string[] {
  return ['-p', task.input, '-o', 'json', '-m', GEMINI_CLI_MODEL, '--approval-mode', 'auto_edit', '--skip-trust'];
}

/** Безкоштовний шлях курсу: Gemini CLI. Локально не встановлено, запускається в CI (крок 04). */
export const geminiRunner: AgentRunner = (task, cwd) =>
  spawnAgent('gemini', geminiArgs(task), cwd, task.budget.timeout_s, process.platform === 'win32');

/**
 * Дозволи агента: читати й шукати — будь-де в дереві; змінювати — лише файли задачі; з оболонки — лише команди
 * перевірки. Пробіл перед * значущий: Bash(npm test *) — збіг за префіксом.
 */
export function allowedToolsFor(task: Task): string[] {
  const files = task.files ?? [];
  return [
    'Read',
    'Glob',
    'Grep',
    ...(files.length > 0 ? files.flatMap((f) => [`Edit(${f})`, `Write(${f})`]) : ['Edit', 'Write']),
    'Bash(npm test *)',
    'Bash(npm run typecheck)',
    'Bash(npm run lint)',
    'Bash(npx tsx scripts/validate-golden.ts *)',
    'Bash(git diff *)',
    'Bash(git status *)',
  ];
}

/** Аргументи claude -p. Прапорці звірено з claude --help 2.1.302 і https://code.claude.com/docs/en/cli-reference. */
export function claudeArgs(task: Task): string[] {
  return [
    '-p', task.input,
    '--output-format', 'json',
    '--model', CLAUDE_MODEL,
    // набір доступних інструментів; --allowedTools лише дозволяє їх без запитання
    '--tools', 'Read,Glob,Grep,Edit,Write,Bash',
    '--allowedTools', allowedToolsFor(task).join(','),
    // усе, чого немає в --allowedTools, відхиляється без запитання; обходу дозволів немає
    '--permission-mode', 'dontAsk',
    // .mcp.json кореня підняв би в -p наш MCP-сервер lab2-corpus без запиту — агентові він не потрібен
    '--strict-mcp-config',
    '--max-turns', String(task.budget.max_turns),
    '--max-budget-usd', String(task.budget.max_usd),
  ];
}

/** Платний шлях (підписка Pro): Claude Code у режимі -p. */
export const claudeRunner: AgentRunner = (task, cwd) => spawnAgent('claude', claudeArgs(task), cwd, task.budget.timeout_s);

/**
 * Поля з claude -p --output-format json (звірено з першим справжнім прогоном t-01, 2026-11-06):
 * session_id, subtype, num_turns, total_cost_usd, permission_denials[], usage.{input_tokens,
 * cache_read_input_tokens, cache_creation_input_tokens, output_tokens}. usage.input_tokens — лише НЕкешований
 * хвіст (у t-01 — 10 із 74 430), тому повний вхід складається з трьох полів.
 */
export function readMeta(stdout: string) {
  const empty = {
    session_id: null, result_subtype: null, num_turns: null, input_tokens: null, cache_read_tokens: null,
    output_tokens: null, permission_denials: null, cost_usd_estimate: null,
  };
  try {
    const j = JSON.parse(stdout) as Record<string, unknown>;
    const usage = (typeof j.usage === 'object' && j.usage !== null ? j.usage : {}) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === 'number' ? v : null);
    const fresh = num(usage.input_tokens);
    const read = num(usage.cache_read_input_tokens);
    const created = num(usage.cache_creation_input_tokens);
    return {
      session_id: typeof j.session_id === 'string' ? j.session_id : null,
      result_subtype: typeof j.subtype === 'string' ? j.subtype : null,
      num_turns: num(j.num_turns),
      input_tokens: fresh === null ? null : fresh + (read ?? 0) + (created ?? 0),
      cache_read_tokens: read,
      output_tokens: num(usage.output_tokens),
      permission_denials: Array.isArray(j.permission_denials) ? j.permission_denials.length : null,
      cost_usd_estimate: num(j.total_cost_usd),
    };
  } catch {
    return empty;
  }
}

/**
 * Журнал відібраного артефакту: run.json копії в docs/lab3/runs/ має вказувати на ЦЮ ж теку (шлях від кореня
 * репозиторію), а не на сиру runs/, якої в git немає. Сирий шлях лишається в raw_artifact_dir.
 */
export function relocate(record: RunRecord, keptDir: string): RunRecord & { readonly raw_artifact_dir: string } {
  return { ...record, artifact_dir: keptDir.replace(/\\/g, '/'), raw_artifact_dir: record.artifact_dir };
}

/** Критерії приймання — це КОМАНДИ. Виконуємо їх у дереві прогону. */
export function quotaHit(stdout: string): boolean {
  const QUOTA = /HTTP 429|RESOURCE_EXHAUSTED|rate.?limit|usage limit|quota/i;
  try {
    const j = JSON.parse(stdout) as Record<string, unknown>;
    // error.code — форма помилки Gemini CLI
    const geminiCode = typeof j.error === 'object' && j.error !== null ? (j.error as { code?: unknown }).code : undefined;
    return j.api_error_status === 429 || geminiCode === 429 || (j.is_error === true && QUOTA.test(String(j.result ?? '')));
  } catch {
    return QUOTA.test(stdout);
  }
}

/** Результат задачі мовою брейкера (src/harness/breaker.ts): причина — те, за чим порівнюються відмови підряд. */
export function classifyOutcome(rec: Pick<RunRecord, 'exit_status' | 'acceptance_passed' | 'quota_hit' | 'result_subtype'>): { ok: boolean; reason: string | null } {
  if (rec.exit_status === 'ok' && rec.acceptance_passed) return { ok: true, reason: null };
  if (rec.quota_hit) return { ok: false, reason: 'quota' };
  if (rec.result_subtype === 'error_max_budget_usd') return { ok: false, reason: 'budget' };
  if (rec.result_subtype === 'error_max_turns') return { ok: false, reason: 'max_turns' };
  if (rec.exit_status === 'timeout') return { ok: false, reason: 'timeout' };
  return { ok: false, reason: rec.exit_status === 'agent_failed' ? 'agent_failed' : 'acceptance_failed' };
}

export function checkAcceptance(task: Task, cwd: string) {
  return task.acceptance.map((cmd) => {
    const r = spawnSync(cmd, { cwd, encoding: 'utf8', shell: true, timeout: task.budget.timeout_s * 1000 });
    return { cmd, exit: r.status ?? 1 };
  });
}

/** Журнал дій агента: hook пише його в .agent-log/ робочого дерева. Це не зміна задачі, тому з patch.diff його виключено. */
const AGENT_LOG = '.agent-log';

export function runTask(
  task: Task,
  opts: {
    runner: AgentRunner;
    agentPath: string;
    model?: string | null;
    worktree: string;
    outDir: string;
    check?: typeof checkAcceptance;
  },
): RunRecord {
  const started = new Date();
  const dir = join(opts.outDir, `${task.id}-${started.getTime()}`);
  mkdirSync(dir, { recursive: true });

  let res: AgentResult;
  try {
    res = opts.runner(task, opts.worktree);
  } catch (error) {
    // журнал пишемо завжди — і тоді, коли сам запуск агента кинув виняток
    res = { exitCode: 1, stdout: '', stderr: `runner кинув виняток: ${String(error)}`, timedOut: false };
  }

  // Артефакт: спершу git add, бо `git diff` без індексу НЕ показує нових файлів,
  // а задача «дописати тест» саме новий файл і створює. Журнал дій агента — окремо.
  let patch = '';
  let actions = '';
  try {
    execFileSync('git', ['add', '-A', '--', '.', `:(exclude)${AGENT_LOG}`], { cwd: opts.worktree });
    // node_modules — посилання: правило .gitignore зі слешем у кінці не діє на symlink у Linux, і воно потрапило б у patch.
    // Саме reset, а не :(exclude) в add: для вже ігнорованого шляху (junction у Windows) такий add завершується кодом 1.
    execFileSync('git', ['reset', '-q', '--', 'node_modules'], { cwd: opts.worktree });
    patch = execFileSync('git', ['diff', '--cached'], { cwd: opts.worktree, encoding: 'utf8' });
    actions = execFileSync('git', ['diff', '--', AGENT_LOG], { cwd: opts.worktree, encoding: 'utf8' })
      .split('\n')
      .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
      .map((l) => l.slice(1))
      .join('\n');
  } catch {
    patch = '';
  }
  writeFileSync(join(dir, 'patch.diff'), patch, 'utf8');
  writeFileSync(join(dir, 'output.txt'), res.stdout, 'utf8');
  writeFileSync(join(dir, 'agent.log'), res.stderr, 'utf8');
  writeFileSync(join(dir, 'agent-actions.jsonl'), actions === '' ? '' : `${actions}\n`, 'utf8');

  const acceptance = (opts.check ?? checkAcceptance)(task, opts.worktree);
  const ended = new Date();
  const record: RunRecord = {
    task_id: task.id,
    agent_path: opts.agentPath,
    model: opts.model ?? null,
    artifact_dir: dir, // ← зв'язок журналу з артефактом
    started_at: started.toISOString(),
    ended_at: ended.toISOString(),
    duration_s: (ended.getTime() - started.getTime()) / 1000,
    exit_status: res.timedOut ? 'timeout' : res.exitCode === 0 ? 'ok' : 'agent_failed',
    exit_code: res.exitCode,
    acceptance,
    acceptance_passed: acceptance.length > 0 && acceptance.every((a) => a.exit === 0),
    ...readMeta(res.stdout),
    // stderr — лише для невдалого запуску: успішний Gemini CLI може згадати 429 про повтор, після якого все минуло
    quota_hit: quotaHit(res.stdout) || (res.exitCode !== 0 && quotaHit(res.stderr)),
    trace_id: null, // ← крок 06
    gates: {}, // ← крок 01
  };
  writeFileSync(join(dir, 'run.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return record;
}

/**
 * Задача всередині власного спана (крок 06): ідентифікатор траси лягає і в run.json, і в evals.jsonl. Для Claude Code
 * спан стає батьком його власних спанів через TRACEPARENT; змінні діють лише на час задачі.
 */
export function runTaskTraced(task: Task, opts: Parameters<typeof runTask>[1], target: OtlpTarget | null, tracer: Tracer = trace.getTracer('harness')): RunRecord {
  return tracer.startActiveSpan(`task ${task.id}`, (span) => {
    const ctx = span.spanContext();
    const childEnv = target !== null && opts.agentPath.startsWith('claude') ? claudeTraceEnv(target, traceparent(ctx.traceId, ctx.spanId)) : {};
    const saved = Object.keys(childEnv).map((k) => [k, process.env[k]] as const);
    Object.assign(process.env, childEnv);
    try {
      const rec = runTask(task, opts);
      span.setAttributes({ 'harness.task_id': task.id, 'harness.agent_path': opts.agentPath, 'harness.exit_status': rec.exit_status, 'harness.acceptance_passed': rec.acceptance_passed, 'gen_ai.agent.name': 'harness-run-task' });
      const withTrace: RunRecord = { ...rec, trace_id: validTraceId(ctx.traceId) };
      // runTask уже записав run.json із trace_id: null, тож журнал перезаписуємо
      writeFileSync(join(withTrace.artifact_dir, 'run.json'), `${JSON.stringify(withTrace, null, 2)}\n`, 'utf8');
      return withTrace;
    } finally {
      for (const [k, v] of saved) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      span.end();
    }
  });
}
