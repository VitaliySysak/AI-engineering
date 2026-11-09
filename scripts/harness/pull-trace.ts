/**
 * Текстова витяжка траси з Langfuse (Лабораторна 3, крок 06). ХОДИТЬ У МЕРЕЖУ — запускає автор:
 *
 *   npx tsx scripts/harness/pull-trace.ts <trace_id> --class <клас>
 *
 * Пише docs/lab3/traces/<дата>-<клас>-<trace_id>.txt: дерево спанів і лише дозволені атрибути.
 * Вміст промптів, відповідей і аргументів інструментів у витяжку не потрапляє: docs/lab3/ лежить у публічному репозиторії.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { otlpTarget, parseHeaders, telemetryEnv } from '../../src/telemetry/otel';

export interface Observation {
  readonly id: string;
  readonly parentObservationId?: string | null;
  readonly name?: string | null;
  readonly type?: string | null;
  readonly startTime?: string | null;
  readonly endTime?: string | null;
  readonly level?: string | null;
  readonly statusMessage?: string | null;
  readonly metadata?: unknown;
  readonly usageDetails?: Readonly<Record<string, number>> | null;
}

/** Точні назви атрибутів, що не містять вмісту. Усе інше відкидається. */
const ALLOWED = new Set([
  'gen_ai.operation.name', 'gen_ai.provider.name', 'gen_ai.request.model', 'gen_ai.response.model', 'gen_ai.agent.name', 'gen_ai.tool.name',
  'gen_ai.response.finish_reasons', 'gen_ai.usage.input_tokens', 'gen_ai.usage.output_tokens', 'error.type',
  'span.type', 'tool_name', 'success', 'error', 'duration_ms', 'model', 'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_creation_tokens',
  'attempt', 'decision', 'source', 'parent.source', 'harness.task_id', 'harness.agent_path', 'harness.exit_status', 'harness.acceptance_passed',
]);

/** Плоский перелік дозволених атрибутів; вкладені обгортки бекенда (attributes тощо) розгортаються. */
export function safeAttributes(metadata: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (value: unknown): void => {
    if (typeof value !== 'object' || value === null) return;
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) walk(v);
      else if (v !== null && v !== undefined) {
        // бекенд може додавати префікс (attributes.tool_name); порівнюємо за точною назвою або кінцем після крапки
        const name = [...ALLOWED].find((a) => k === a || k.endsWith(`.${a}`));
        if (name !== undefined) out[name] = (Array.isArray(v) ? JSON.stringify(v) : String(v)).slice(0, 120);
      }
    }
  };
  walk(metadata);
  return out;
}

const ms = (o: Observation): string => {
  if (!o.startTime || !o.endTime) return '?';
  return `${Date.parse(o.endTime) - Date.parse(o.startTime)} мс`;
};

/** Дерево за parentObservationId; спани без батька в цій трасі — корені. Порядок — за часом старту. */
export function treeLines(observations: readonly Observation[]): string[] {
  const ids = new Set(observations.map((o) => o.id));
  const byStart = [...observations].sort((a, b) => Date.parse(a.startTime ?? '') - Date.parse(b.startTime ?? ''));
  const children = (parent: string | null) => byStart.filter((o) => (o.parentObservationId && ids.has(o.parentObservationId) ? o.parentObservationId : null) === parent);
  const lines: string[] = [];
  const visit = (o: Observation, depth: number): void => {
    const attrs = Object.entries(safeAttributes(o.metadata)).map(([k, v]) => `${k}=${v}`).join(' ');
    const level = o.level && o.level !== 'DEFAULT' ? ` level=${o.level}` : '';
    const usage = Object.entries(o.usageDetails ?? {}).filter(([, v]) => typeof v === 'number').map(([k, v]) => `${k}=${v}`).join(' ');
    lines.push(`${'  '.repeat(depth)}${o.name ?? '?'} [${o.type ?? '?'}] ${ms(o)}${level}${attrs === '' ? '' : ` · ${attrs}`}${usage === '' ? '' : ` · usage ${usage}`}`);
    for (const c of children(o.id)) visit(c, depth + 1);
  };
  for (const root of children(null)) visit(root, 0);
  return lines;
}

/** Observations API v2: /api/public/traces/{id} на Langfuse v4 віддає 410. Поля io навмисно не запитуємо. */
async function fetchObservations(origin: string, authorization: string, traceId: string): Promise<Observation[]> {
  const out: Observation[] = [];
  const from = new Date(Date.now() - 30 * 86_400_000).toISOString();
  let cursor: string | undefined;
  do {
    const q = new URLSearchParams({ traceId, fields: 'core,basic,metadata,usage', fromStartTime: from, limit: '1000', ...(cursor === undefined ? {} : { cursor }) });
    const res = await fetch(`${origin}/api/public/v2/observations?${q.toString()}`, { headers: { Authorization: authorization } });
    if (!res.ok) throw new Error(`Langfuse: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const page = (await res.json()) as { data?: Observation[]; meta?: { cursor?: string } };
    out.push(...(page.data ?? []));
    cursor = page.meta?.cursor;
  } while (cursor !== undefined);
  return out;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const traceId = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--class');
  const klass = args.includes('--class') ? args[args.indexOf('--class') + 1] : undefined;
  if (traceId === undefined || klass === undefined) throw new Error('потрібно: <trace_id> --class <клас>');
  const target = otlpTarget(telemetryEnv());
  if (target === null) throw new Error('немає ключів Langfuse');
  const observations = await fetchObservations(new URL(target.endpoint).origin, parseHeaders(target.headers).Authorization ?? '', traceId);
  if (observations.length === 0) throw new Error('спанів ще немає: Langfuse міг не обробити трасу, спробуйте за хвилину');
  const start = observations.map((o) => o.startTime ?? '').sort()[0] ?? new Date().toISOString();
  const root = observations.find((o) => !o.parentObservationId);
  const lines = [`trace_id: ${traceId}`, `клас: ${klass}`, `корінь: ${root?.name ?? '—'}`, `час: ${start}`, `спанів: ${observations.length}`, '', ...treeLines(observations), ''];
  const date = start.slice(0, 10);
  mkdirSync('docs/lab3/traces', { recursive: true });
  const file = join('docs', 'lab3', 'traces', `${date}-${klass}-${traceId}.txt`);
  writeFileSync(file, lines.join('\n'), 'utf8');
  console.log(lines.join('\n'));
  console.log(`Записано: ${file}`);
  // лише назви ключів, без значень: щоб звірити перелік дозволених атрибутів
  if (args.includes('--keys')) console.log(`Ключі metadata: ${[...new Set(observations.flatMap((o) => (typeof o.metadata === 'object' && o.metadata !== null ? Object.keys(o.metadata) : [])))].sort().join(', ')}`);
}

if (process.argv[1]?.endsWith('pull-trace.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
