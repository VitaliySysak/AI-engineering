import { cosineSimilarity } from 'ai';

import type { Embedder } from './embed';
import type { IndexFile, IndexedChunk } from './store';
import { buildBm25, searchBm25, type Bm25Index } from './bm25';
import { rrf, RRF_K } from './rrf';

export const DEPTH = 20; // скільки беремо з кожної гілки ДО злиття

export interface Hit {
  readonly chunk: IndexedChunk;
  readonly rrf: number;
  readonly cosine: number;
  /** Ранги з 1; null — цієї гілки фрагмент не знайшла. Саме це йде в retrieval.md. */
  readonly rankVector: number | null;
  readonly rankWords: number | null;
}

export function bm25From(index: IndexFile): Bm25Index {
  // шукаємо по тому ж тексту, що й ембедимо: заголовок усередині фрагмента — навмисно
  return buildBm25(index.chunks.map((c) => ({ id: c.id, text: c.text })));
}

export async function hybridSearch(
  index: IndexFile,
  words: Bm25Index,
  embedder: Embedder,
  query: string,
  topK = 5,
): Promise<Hit[]> {
  const qv = await embedder.embedQuery(query);
  const cosines = new Map(index.chunks.map((c) => [c.id, cosineSimilarity(qv, c.vector)]));

  const vectorList = [...cosines.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, DEPTH)
    .map(([id]) => id);
  const wordList = searchBm25(words, query, DEPTH).map((r) => r.id);

  const byId = new Map(index.chunks.map((c) => [c.id, c]));
  const rank = (list: readonly string[], id: string): number | null => {
    const i = list.indexOf(id);
    return i < 0 ? null : i + 1;
  };

  return rrf([vectorList, wordList], RRF_K)
    .slice(0, topK)
    .map(({ id, score }) => ({
      chunk: byId.get(id)!,
      rrf: score,
      cosine: cosines.get(id) ?? 0,
      rankVector: rank(vectorList, id),
      rankWords: rank(wordList, id),
    }));
}
