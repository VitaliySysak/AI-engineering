/**
 * Гібридний пошук із цитуванням (крок 05). ХОДИТЬ У МЕРЕЖУ (ембедінг запиту, модель відповіді) —
 * лише вручну, з кореня репозиторію:
 *
 *   npx tsx --env-file=.env.local scripts/search.ts "<запит>"              топ-5 з цитатами
 *   npx tsx --env-file=.env.local scripts/search.ts "<запит>" --explain    три списки поруч
 *   npx tsx --env-file=.env.local scripts/search.ts "<запит>" --answer     відповідь моделі з джерелами
 *   npx tsx --env-file=.env.local scripts/search.ts --golden               ранги на всьому еталонному наборі
 *
 * Ембедер — той самий, що в індексі (loadIndex перевіряє заголовок), запит — з RETRIEVAL_QUERY.
 * Модель відповіді й системний промпт — ті самі, що в базовій лінії (scripts/baseline.ts): змінюється
 * лише те, що в повідомлення користувача додано знайдені фрагменти.
 */
import { readFileSync } from 'node:fs';

import { cosineSimilarity } from 'ai';

import { chatCompletionsModel } from '../src/agent/adapters';
import { renderCitation, renderContext, toCitation, validateAnswer } from '../src/rag/cite';
import { geminiEmbedder } from '../src/rag/embed';
import { refusalReason, REFUSAL } from '../src/rag/refusal';
import { rrf, RRF_K } from '../src/rag/rrf';
import { bm25From, DEPTH, hybridSearch } from '../src/rag/search';
import { searchBm25 } from '../src/rag/bm25';
import { loadIndex, type IndexFile } from '../src/rag/store';
import { CATALOG } from '../src/models';
import { SYSTEM_PROMPT } from './baseline';
import { validateGolden, type Entry } from './validate-golden';

const INDEX = 'data/index.json';
const GOLDEN = 'docs/lab2/golden/queries.jsonl';

/** Три ранжування одного запиту: вектор (усі фрагменти), слова (бал > 0), злиття RRF (топ-DEPTH кожної гілки). */
export interface Lists {
  readonly vector: readonly { id: string; score: number }[];
  readonly words: readonly { id: string; score: number }[];
  readonly fused: readonly { id: string; score: number }[];
}

/** Найкращий 1-based ранг серед фрагментів потрібних документів; null — гілка жодного не знайшла. */
export function bestRank(list: readonly { id: string }[], docIds: readonly string[]): number | null {
  const i = list.findIndex((r) => docIds.includes(r.id.split('#')[0] as string));
  return i < 0 ? null : i + 1;
}

const embedder = geminiEmbedder(768);

async function lists(index: IndexFile, query: string): Promise<Lists> {
  const qv = await embedder.embedQuery(query);
  const vector = index.chunks
    .map((c) => ({ id: c.id, score: cosineSimilarity(qv, c.vector) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const words = searchBm25(bm25From(index), query, DEPTH);
  const fused = rrf([vector.slice(0, DEPTH).map((r) => r.id), words.map((r) => r.id)], RRF_K);
  return { vector, words, fused };
}

const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const cell = (r: { id: string; score: number } | undefined, i: number, digits: number) =>
  r === undefined ? '' : `${String(i + 1).padStart(2)}  ${r.id}  ${r.score.toFixed(digits)}`;

function explain(l: Lists, rows = 10): void {
  const w = 52;
  console.log(`${pad('вектор (cosine)', w)}${pad('слова (BM25)', w)}RRF (k=${RRF_K})`);
  for (let i = 0; i < rows; i++) {
    const words = l.words.length === 0 && i === 0 ? 'порожньо: жодного слова запиту немає' : cell(l.words[i], i, 2);
    console.log(`${pad(cell(l.vector[i], i, 4), w)}${pad(words, w)}${cell(l.fused[i], i, 5)}`);
  }
}

function loadGolden(): Entry[] {
  const text = readFileSync(GOLDEN, 'utf8');
  const problems = validateGolden(text);
  if (problems.length > 0) throw new Error(`набір не проходить валідатор:\n${problems.join('\n')}`);
  return text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Entry);
}

async function golden(index: IndexFile): Promise<void> {
  const fmt = (r: number | null) => (r === null ? 'немає' : String(r));
  console.log('| id | tags | must_cite | вектор | слова | RRF | у топ-5 RRF | косинус топ-1 | фрагментів у BM25 |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const [i, q] of loadGolden().entries()) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1_000)); // free tier: не поспішаємо
    const l = await lists(index, q.query);
    const answerable = q.must_cite.length > 0;
    const v = answerable ? bestRank(l.vector, q.must_cite) : null;
    const w = answerable ? bestRank(l.words, q.must_cite) : null;
    const r = answerable ? bestRank(l.fused, q.must_cite) : null;
    const top5 = answerable ? (r !== null && r <= 5 ? 'так' : 'НІ') : '—';
    console.log(
      `| ${q.id} | ${q.tags.join(', ')} | ${q.must_cite.join(', ') || '—'} | ${answerable ? fmt(v) : '—'} | ${answerable ? fmt(w) : '—'} | ${answerable ? fmt(r) : '—'} | ${top5} | ${(l.vector[0]?.score ?? 0).toFixed(4)} | ${l.words.length} |`,
    );
  }
  console.log('\nРанги — найкращий 1-based ранг будь-якого фрагмента документа з must_cite; «немає» — гілка його не знайшла.');
  console.log(`Вектор ранжує всі ${index.chunks.length} фрагментів; у злиття йде топ-${DEPTH} кожної гілки.`);
}

async function answer(index: IndexFile, query: string): Promise<void> {
  const l = await lists(index, query);
  const reason = refusalReason({ topCosine: l.vector[0]?.score ?? 0, wordHits: l.words.length });
  if (REFUSAL.minCosine === null) console.error('Порогу відмови на рівні пошуку немає (див. retrieval.md, розділ 4): відмовляє модель.');
  if (reason !== null) {
    console.log(`Відмова: у колекції немає відповіді на це питання (${reason}).`);
    return;
  }
  const hits = await hybridSearch(index, bm25From(index), embedder, query, 5);
  const served = hits.map((h) => h.chunk);

  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY порожній: заповніть .env.local');
  const spec = CATALOG['gemini-3.5-flash-lite']; // та сама модель, що в базовій лінії
  const model = chatCompletionsModel({
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: spec.id,
    headers: { authorization: `Bearer ${key}` },
  });
  const user = `Фрагменти документів:\n\n${renderContext(served)}\n\nПитання: ${query}`;
  const turn = await model(SYSTEM_PROMPT, [{ role: 'user', text: user }], []);

  console.log(`Запит: «${query}»\n`);
  console.log(turn.text);
  console.log('\nВидані фрагменти:');
  for (const h of hits) console.log(`  ${renderCitation(toCitation(h.chunk, h.chunk.text))} · cosine=${h.cosine.toFixed(4)} rrf=${h.rrf.toFixed(5)}`);
  const problems = validateAnswer(turn.text, served);
  console.log(`\nvalidateAnswer: ${problems.length === 0 ? 'проблем 0' : problems.join('; ')}`);
  console.log(`Токени: вхід ${turn.usage.inputTokens}, вихід ${turn.usage.outputTokens}`);
  if (problems.length > 0) process.exitCode = 1;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const index = loadIndex(INDEX, embedder);
  if (args.includes('--golden')) return golden(index);

  const query = args.find((a) => !a.startsWith('--'));
  if (query === undefined) throw new Error('потрібен запит: scripts/search.ts "<запит>" [--explain | --answer]');
  if (args.includes('--answer')) return answer(index, query);

  const l = await lists(index, query);
  if (args.includes('--explain')) return explain(l);
  const hits = await hybridSearch(index, bm25From(index), embedder, query, 5);
  for (const h of hits) {
    console.log(`${renderCitation(toCitation(h.chunk, h.chunk.text))}`);
    console.log(`  cosine=${h.cosine.toFixed(4)} rrf=${h.rrf.toFixed(5)} · ранг: вектор ${h.rankVector ?? '—'}, слова ${h.rankWords ?? '—'}`);
  }
}

if (process.argv[1]?.endsWith('search.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
