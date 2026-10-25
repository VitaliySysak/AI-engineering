/**
 * ЕМБЕДІНГИ (крок 04): два шляхи за $0 і підробка для тестів.
 * Індексатор не знає, хто рахує вектори, — він знає лише цей інтерфейс.
 */
import { embed, embedMany } from 'ai';
import { google } from '@ai-sdk/google'; // ключ: GOOGLE_GENERATIVE_AI_API_KEY

/**
 * Модель ембедингів шляху Б. Ціну звірено зі сторінкою Google 2026-10-25: текст $0.20 за 1 млн вхідних
 * токенів, free tier — безкоштовно, виходу немає. Не в CATALOG src/models.ts: тести реєстру
 * (src/models.test.ts) вимагають «вихід дорожчий за вхід» і вартість ролі `embed` = 0 — для моделі
 * ембедингів обидва не виконуються, а тести змінювати без наказу автора не можна (AGENTS.md).
 */
export const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-2';

export interface Embedder {
  /** Те, що піде в заголовок індексу: 'ollama:embeddinggemma-2:270m'. */
  readonly id: string;
  readonly dimensions: number;
  embedDocuments(texts: readonly string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

// ---------- Шлях А: локальна Ollama ----------

export function ollamaEmbedder(model = 'embeddinggemma-2:270m', dimensions = 768): Embedder {
  const base = process.env.OLLAMA_URL ?? 'http://localhost:11434';

  const call = async (input: readonly string[]): Promise<number[][]> => {
    const res = await fetch(`${base}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // truncate типово true — задовгий вхід обрізався б МОВЧКИ. Нам потрібне падіння.
      body: JSON.stringify({ model, input, dimensions, truncate: false }),
    });
    if (!res.ok) throw new Error(`/api/embed ${res.status}: ${await res.text()}`);
    const data: unknown = await res.json();
    const vectors = (data as { embeddings?: unknown }).embeddings;
    if (!Array.isArray(vectors) || vectors.length !== input.length) {
      throw new Error(`/api/embed: очікував ${input.length} векторів, прийшло інше`);
    }
    for (const v of vectors as number[][]) {
      if (v.length !== dimensions) throw new Error(`/api/embed: розмірність ${v.length}, очікував ${dimensions}`);
    }
    return vectors as number[][];
  };

  return {
    id: `ollama:${model}`,
    dimensions,
    embedDocuments: call,
    embedQuery: async (text) => (await call([text]))[0] as number[],
  };
}

// ---------- Шлях Б: Gemini через AI SDK ----------

export function geminiEmbedder(dimensions = 768): Embedder {
  const model = google.textEmbedding(GEMINI_EMBEDDING_MODEL);

  return {
    id: `google:${GEMINI_EMBEDDING_MODEL}@${dimensions}`,
    dimensions,
    embedDocuments: async (texts) => {
      const { embeddings, usage } = await embedMany({
        model,
        values: [...texts],
        // embedMany сам ріже список на кілька викликів; тримаємо паралельність низькою,
        // щоб не впертися в ліміти безкоштовного рівня (їхні числа не опубліковані)
        maxParallelCalls: 2,
        providerOptions: {
          google: { taskType: 'RETRIEVAL_DOCUMENT', outputDimensionality: dimensions },
        },
      });
      // Gemini через AI SDK не повертає usage.tokens для ембедингів (перша побудова 2026-10-25 друкувала NaN)
      const tokens = Number.isFinite(usage.tokens) ? String(usage.tokens) : 'провайдер не повідомив';
      console.error(`  embedMany: ${texts.length} фрагментів, токенів: ${tokens}`);
      return embeddings;
    },
    embedQuery: async (text) => {
      const { embedding } = await embed({
        model,
        value: text,
        // запит — RETRIEVAL_QUERY, документ — RETRIEVAL_DOCUMENT. Це асиметрично за задумом.
        providerOptions: {
          google: { taskType: 'RETRIEVAL_QUERY', outputDimensionality: dimensions },
        },
      });
      return embedding;
    },
  };
}

// ---------- Підробка для тестів: детерміновано, без мережі ----------

/**
 * Схожість тут — збіг слів, а не сенсу. Це НЕ модель: це спосіб перевірити
 * механіку індексу й пошуку в CI, де немає ні ключів, ні Ollama.
 */
export function fakeEmbedder(dimensions = 64): Embedder {
  const vector = (text: string): number[] => {
    const v = new Array<number>(dimensions).fill(0);
    for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
      let h = 2166136261; // FNV-1a: детермінований і однаковий на будь-якій машині
      for (let i = 0; i < word.length; i += 1) {
        h ^= word.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      const slot = Math.abs(h) % dimensions;
      v[slot] = (v[slot] ?? 0) + 1;
    }
    const norm = Math.hypot(...v) || 1;
    return v.map((x) => x / norm);
  };

  return {
    id: `fake:fnv@${dimensions}`,
    dimensions,
    embedDocuments: async (texts) => texts.map(vector),
    embedQuery: async (text) => vector(text),
  };
}
