/**
 * Побудова індексу (крок 04). Мережа тут потрібна, тому це scripts/, а не src/.
 *   npm run index                        — Gemini (шлях Б, spec.md розділ 7), ключ із .env.local
 *   npx tsx scripts/build-index.ts       — локальна Ollama (шлях А, запасний)
 */
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { chunkDocument, normalize, RULE } from '../src/rag/chunk';
import { geminiEmbedder, ollamaEmbedder, type Embedder } from '../src/rag/embed';
import { round6, saveIndex, sha256, type IndexedChunk, type IndexFile } from '../src/rag/store';

const CORPUS = 'corpus';
const OUT = 'data/index.json';
const NORMALIZATION = 'BOM прибрано, CRLF→LF, пробіли в кінці рядків прибрано';

const embedder: Embedder = process.argv.includes('--provider')
  && process.argv[process.argv.indexOf('--provider') + 1] === 'google'
  ? geminiEmbedder(768)
  : ollamaEmbedder();

const started = performance.now();
const documents: IndexFile['documents'] = [];
const chunks: IndexedChunk[] = [];

const files = readdirSync(CORPUS).filter((f) => /\.(md|txt)$/i.test(f)).sort();
if (files.length < 10) throw new Error(`у ${CORPUS}/ лише ${files.length} файлів, специфікація вимагає 10–40`);

for (const file of files) {
  const docId = file.replace(/\.(md|txt)$/i, ''); // імʼя файлу = id зі spec.md
  const text = normalize(readFileSync(join(CORPUS, file), 'utf8'));
  const parts = chunkDocument(docId, text, RULE);
  const vectors = await embedder.embedDocuments(parts.map((p) => p.text));
  parts.forEach((part, i) => chunks.push({ ...part, vector: (vectors[i] as number[]).map(round6) }));
  documents.push({ id: docId, path: join(CORPUS, file).replace(/\\/g, '/'), chars: text.length, sha256: sha256(text) });
  console.log(`  ${docId}: ${text.length} симв. → ${parts.length} фрагм.`);
}

mkdirSync('data', { recursive: true });
saveIndex(OUT, {
  version: 1,
  builtAt: new Date().toISOString(),
  embedder: embedder.id,
  dimensions: embedder.dimensions,
  rule: RULE,
  normalization: NORMALIZATION,
  documents,
  chunks,
});

const seconds = (performance.now() - started) / 1000;
const lengths = chunks.map((c) => c.text.length).sort((a, b) => a - b);
console.log(`
документів:    ${documents.length}
фрагментів:    ${chunks.length}
довжина:       медіана ${lengths[Math.floor(lengths.length / 2)]}, мін ${lengths[0]}, макс ${lengths[lengths.length - 1]} симв.
ембедер:       ${embedder.id}, ${embedder.dimensions} вимірів
${OUT}:        ${(statSync(OUT).size / 1024 / 1024).toFixed(1)} МБ
час побудови:  ${seconds.toFixed(1)} с
`);
