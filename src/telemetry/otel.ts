/**
 * Експорт трас у Langfuse через OTLP/HTTP (Лабораторна 3, крок 06). gRPC Langfuse не підтримує.
 * Для фабрики траси пише сам Claude Code (бета-трасування), під спаном задачі через TRACEPARENT;
 * для власних циклів на AI SDK спани дає інтеграція OpenTelemetry з @ai-sdk/otel. Вміст промптів не експортується.
 */
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { OpenTelemetry } from '@ai-sdk/otel';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { registerTelemetry } from 'ai';

export interface OtlpTarget {
  /** Базова адреса OTLP без /v1/traces. */
  readonly endpoint: string;
  /** Заголовки у форматі OTLP: ключ=значення через кому. */
  readonly headers: string;
}

type Env = Readonly<Record<string, string | undefined>>;

/** Лише імена трасування: решта секретів файлу не має потрапити в середовище агента. */
const TELEMETRY_KEYS = ['LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY', 'LANGFUSE_BASE_URL', 'OTEL_EXPORTER_OTLP_ENDPOINT', 'OTEL_EXPORTER_OTLP_HEADERS'];

/** Змінні трасування із файлу середовища автора; значення процесу мають перевагу. */
export function telemetryEnv(file = '.env.local', env: Env = process.env): Env {
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
  return Object.fromEntries(TELEMETRY_KEYS.map((k) => [k, env[k] || fromFile[k]]));
}

/** Куди слати траси: явні OTEL_* або ключі Langfuse; null — лише локальні ідентифікатори, без експорту. */
export function otlpTarget(env: Env): OtlpTarget | null {
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const headers = env.OTEL_EXPORTER_OTLP_HEADERS;
  if (endpoint && headers) return { endpoint: endpoint.replace(/\/+$/, ''), headers };
  const pub = env.LANGFUSE_PUBLIC_KEY;
  const secret = env.LANGFUSE_SECRET_KEY;
  if (!pub || !secret) return null;
  const base = (env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com').replace(/\/+$/, '');
  const auth = Buffer.from(`${pub}:${secret}`, 'utf8').toString('base64');
  // x-langfuse-ingestion-version=4 — ingestion у реальному часі; без нього спани можуть затриматися
  return { endpoint: `${base}/api/public/otel`, headers: `Authorization=Basic ${auth},x-langfuse-ingestion-version=4` };
}

export function parseHeaders(headers: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of headers.split(',')) {
    const at = pair.indexOf('=');
    if (at > 0) out[pair.slice(0, at).trim()] = pair.slice(at + 1).trim();
  }
  return out;
}

/** Рядок для консолі: куди йдуть траси. Без значень ключів. */
export function describeTarget(target: OtlpTarget | null): string {
  return target === null ? 'Траси: без експорту (немає LANGFUSE_PUBLIC_KEY і LANGFUSE_SECRET_KEY)' : `Траси: експорт у ${new URL(target.endpoint).origin}`;
}

export const traceparent = (traceId: string, spanId: string): string => `00-${traceId}-${spanId}-01`;

/** Нульовий ідентифікатор означає, що трасувальника немає: у журнал такий не пишемо. */
export const validTraceId = (traceId: string): string | null => (/^0+$/.test(traceId) ? null : traceId);

/**
 * Середовище процесу claude -p (code.claude.com/docs/en/monitoring-usage, розділ Traces (beta)). Промпти й деталі
 * інструментів Claude Code типово редагує; змінні, що їх вмикають, тут не задаються.
 */
export function claudeTraceEnv(target: OtlpTarget, parent: string): Record<string, string> {
  return {
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: '1',
    OTEL_TRACES_EXPORTER: 'otlp',
    OTEL_METRICS_EXPORTER: 'none',
    OTEL_LOGS_EXPORTER: 'none',
    OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: 'http/json',
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: `${target.endpoint}/v1/traces`,
    OTEL_EXPORTER_OTLP_TRACES_HEADERS: target.headers,
    TRACEPARENT: parent,
  };
}

/** Без цілі потрібен трасувальник із відкиданням: без експортера SDK не реєструє його, і ідентифікатори були б нульові. */
const DISCARD: NonNullable<NonNullable<ConstructorParameters<typeof NodeSDK>[0]>['traceExporter']> = {
  export: (_spans, done) => done({ code: 0 }),
  shutdown: async () => undefined,
};

export interface Telemetry {
  readonly target: OtlpTarget | null;
  shutdown(): Promise<void>;
}

/** Один раз на старті процесу. Без цілі спани й ідентифікатори є, але нікуди не відправляються. */
export function startTelemetry(env: Env = telemetryEnv()): Telemetry {
  const target = otlpTarget(env);
  const traceExporter = target === null ? DISCARD : new OTLPTraceExporter({ url: `${target.endpoint}/v1/traces`, headers: parseHeaders(target.headers) });
  // без цього помилки експорту зникають мовчки: процес зелений, бекенд порожній
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);
  const sdk = new NodeSDK({ serviceName: 'harness', traceExporter });
  sdk.start();
  console.log(describeTarget(target));
  // Саме ця інтеграція дотримується конвенцій GenAI; LegacyOpenTelemetry шле старі спани ai.*
  registerTelemetry(new OpenTelemetry());
  return {
    target,
    // недоступний бекенд не має вішати завершення прогону
    shutdown: () => Promise.race([sdk.shutdown(), new Promise<void>((resolve) => setTimeout(resolve, 10_000))]),
  };
}
