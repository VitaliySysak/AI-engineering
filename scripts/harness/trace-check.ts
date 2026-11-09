/**
 * Діагностика трасування (Лабораторна 3, крок 06). ХОДИТЬ У МЕРЕЖУ (Langfuse) — запускає автор:
 *
 *   npx tsx scripts/harness/trace-check.ts
 *
 * Значень ключів не друкує. Показує, чи є ключі, до якого проєкту вони належать, і чи приймає бекенд один тестовий спан.
 */
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';

import { otlpTarget, parseHeaders, telemetryEnv } from '../../src/telemetry/otel';

const env = telemetryEnv();
console.log(`Файл .env.local: ${existsSync('.env.local') ? 'є' : 'немає'}`);
for (const k of ['LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY', 'LANGFUSE_BASE_URL', 'OTEL_EXPORTER_OTLP_ENDPOINT', 'OTEL_EXPORTER_OTLP_HEADERS']) console.log(`  ${k}: ${env[k] ? 'задано' : 'порожньо'}`);
console.log(`  вигляд ключів: публічний ${env.LANGFUSE_PUBLIC_KEY?.startsWith('pk-lf-') ? 'pk-lf-…' : 'НЕТИПОВИЙ або порожній'}, секретний ${env.LANGFUSE_SECRET_KEY?.startsWith('sk-lf-') ? 'sk-lf-…' : 'НЕТИПОВИЙ або порожній'}`);

const target = otlpTarget(env);
if (target === null) {
  console.log('\nВисновок: ключів немає, траси нікуди не відправляються. Додайте LANGFUSE_PUBLIC_KEY і LANGFUSE_SECRET_KEY у .env.local.');
  process.exit(1);
}
const origin = new URL(target.endpoint).origin;
console.log(`\nБекенд: ${origin}`);
const headers = parseHeaders(target.headers);

const projects = await fetch(`${origin}/api/public/projects`, { headers: { Authorization: headers.Authorization ?? '' } });
console.log(`Перевірка ключів: HTTP ${projects.status}`);
if (projects.ok) {
  const body = (await projects.json()) as { data?: { name?: string }[] };
  console.log(`Ключі належать проєкту: ${(body.data ?? []).map((p) => p.name).join(', ') || 'невідомо'}`);
}

const traceId = randomBytes(16).toString('hex');
const now = BigInt(Date.now()) * 1_000_000n;
const res = await fetch(`${target.endpoint}/v1/traces`, {
  method: 'POST',
  headers: { ...headers, 'content-type': 'application/json' },
  body: JSON.stringify({
    resourceSpans: [{
      resource: { attributes: [{ key: 'service.name', value: { stringValue: 'trace-check' } }] },
      scopeSpans: [{ scope: { name: 'trace-check' }, spans: [{ traceId, spanId: randomBytes(8).toString('hex'), name: 'trace-check', kind: 1, startTimeUnixNano: String(now - 1_000_000n), endTimeUnixNano: String(now), attributes: [] }] }],
    }],
  }),
});
console.log(`Тестовий спан: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
console.log(res.ok ? `\nШукайте в Tracing спан trace-check, trace_id ${traceId}` : '\nБекенд не прийняв спан.');
