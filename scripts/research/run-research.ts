/**
 * Глибоке дослідження форка (Лабораторна 4, крок 04). ХОДИТЬ У МЕРЕЖУ — запускає автор з ключами, як run-multi.ts:
 *
 *   npx tsx <ключі з файлу секретів> scripts/research/run-research.ts [--rpm 8]
 *
 * Пише: docs/lab4/research/answer.md (відповідь із permalink), docs/lab4/research-cites.json (цитати для
 * scripts/cite-check.ts), рядок у docs/lab4/traces/research-runs.jsonl. У памʼять результат НЕ пишеться:
 * прочитане в чужому репозиторії не стає інструкцією (OWASP LLM01).
 */
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { trace } from '@opentelemetry/api';

import { mayRun, recordOutcome } from '../../src/harness/breaker';
import { CATALOG } from '../../src/models';
import { QuotaError } from '../../src/multi/fanout';
import { permalink } from '../../src/research/cite-check';
import { research, RESEARCH_BUDGET, type ResearchResult } from '../../src/research/research';
import { startTelemetry } from '../../src/telemetry/otel';
import { assertNotGemini, BREAKER_MULTI, rateLimitedFetch, retry503Fetch, RETRY_503_DELAYS } from '../multi/run-multi';

export const QUESTION = 'Чому buildURL відрізає #фрагмент лише тоді, коли серіалізовані параметри непорожні, і чи це задумано?';
export const MODULE = 'lib/helpers/buildURL.js';
/** Нульова точка форка (крок 00): lib/ у робочій копії форка на ній не змінювався. */
export const ZERO_SHA = '9f0f4ddfe72b4c06afafe1a658e6ee53d35b5760';
export const FORK_URL = 'https://github.com/VitaliySysak/axios';

export function renderAnswer(r: ResearchResult, root: string, traceId: string | null): string {
  const verdictOf = (i: number) => r.verdicts[r.claims.slice(0, i + 1).filter((c) => c.why === null).length - 1]?.verdict;
  const lines = [
    '# Глибоке дослідження: відповідь',
    '',
    `Питання: ${r.question}`,
    '',
    `Раундів: ${r.rounds} · зупинка: ${r.stopReason} · ходів: ${r.spent.calls} · in ${r.spent.input} / out ${r.spent.output} · ${Math.round(r.wallMs / 1000)} с · trace ${traceId ?? '—'}`,
    r.failed.length > 0 ? `\n> НЕПОВНА: смуги ${r.failed.join(', ')} не дали результату.` : '',
    '',
    r.answer ?? '_Звід не відбувся._',
    '',
    '| твердження | цитата | детермінована перевірка | верифікатор |',
    '|---|---|---|---|',
    ...r.claims.map((c, i) => {
      const link = c.cite === null ? '—' : c.why === null ? permalink(FORK_URL, root, c.cite) : `${c.cite.file ?? ''}${c.cite.line === undefined ? '' : `:${c.cite.line}`} ${c.cite.file === undefined ? c.cite.sha : ''}`.trim();
      return `| ${c.text.replace(/\|/g, '\\|')} | ${link} | ${c.why === null ? 'існує' : `брак: ${c.why}`} | ${c.why === null ? verdictOf(i) ?? 'не перевірено' : '—'} |`;
    }),
    '',
    `Цитат усього: ${r.citesTotal}; не підтверджено детермінованою перевіркою: ${r.citesBad}.`,
  ];
  return `${lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')}\n`;
}

async function main(): Promise<void> {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const orKey = process.env.OPENROUTER_API_KEY;
  const orModel = process.env.OPENROUTER_MODEL?.trim();
  if (!geminiKey) throw new Error('GEMINI_API_KEY порожній');
  if (!orKey || !orModel) throw new Error('OPENROUTER_API_KEY або OPENROUTER_MODEL порожні');
  assertNotGemini(orModel);
  const at = process.argv.indexOf('--rpm');
  const rpm = at > 0 ? Number(process.argv[at + 1]) : 8;
  const root = resolve(process.env.FORK_DIR ?? '../axios');
  if (!existsSync(resolve(root, MODULE))) throw new Error(`${root} — не форк axios`);

  const gate = mayRun(new Date(), BREAKER_MULTI);
  if (!gate.allow) throw new Error(`брейкер відкритий: ${gate.why}`);

  let retries503 = 0;
  const gemini = createGoogleGenerativeAI({ apiKey: geminiKey, fetch: retry503Fetch(rateLimitedFetch(rpm), RETRY_503_DELAYS, () => { retries503++; }) })(CATALOG['gemini-3.5-flash-lite'].id);
  const verifier = createOpenRouter({ apiKey: orKey })(orModel);
  const telemetry = startTelemetry();
  console.log(`Дослідження: ${QUESTION}\nЧитачі/звід: ${CATALOG['gemini-3.5-flash-lite'].id} (≤${rpm} RPM) · верифікатор: ${orModel} · бюджет ${JSON.stringify(RESEARCH_BUDGET)}\n`);
  try {
    let traceId: string | null = null;
    const r: ResearchResult = await trace.getTracer('lab4-research').startActiveSpan('lab4-research buildURL-hash', async (s) => {
      traceId = s.spanContext().traceId;
      try {
        return await research({ question: QUESTION, module: MODULE, root, zeroSha: ZERO_SHA, readerModel: gemini, synthModel: gemini, verifierModel: verifier, taskId: 'research' });
      } finally {
        s.end();
      }
    });
    recordOutcome({ ok: true, reason: null }, new Date(), BREAKER_MULTI);
    mkdirSync('docs/lab4/research', { recursive: true });
    writeFileSync('docs/lab4/research/answer.md', renderAnswer(r, root, traceId), 'utf8');
    writeFileSync('docs/lab4/research-cites.json', `${JSON.stringify(r.claims.filter((c) => c.cite !== null).map((c) => ({ ...c.cite, claim: c.text })), null, 2)}\n`, 'utf8');
    appendFileSync('docs/lab4/traces/research-runs.jsonl', `${JSON.stringify({ at: new Date().toISOString(), traceId, retries503, ...r })}\n`);
    console.log(`раундів ${r.rounds} · зупинка ${r.stopReason} · ходів ${r.spent.calls} · in ${r.spent.input} out ${r.spent.output} · ${Math.round(r.wallMs / 1000)} с · цитат ${r.citesTotal}, брак ${r.citesBad} · вердикти ${r.verdicts.map((v) => v.verdict).join(',') || '—'} · trace ${traceId}`);
    for (const e of r.errors) console.log(`   помилка ${e.stage}: ${e.name}${e.status === null ? '' : ` ${e.status}`} — ${e.message}`);
    console.log(`Повторів після 503: ${retries503}\nЗаписано: docs/lab4/research/answer.md, docs/lab4/research-cites.json`);
  } catch (error) {
    if (error instanceof QuotaError) recordOutcome({ ok: false, reason: 'quota' }, new Date(), BREAKER_MULTI);
    throw error;
  } finally {
    await telemetry.shutdown();
  }
}

if (process.argv[1]?.endsWith('run-research.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
