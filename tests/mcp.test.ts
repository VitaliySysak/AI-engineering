/**
 * Інструменти MCP-сервера (крок 08) без мережі й без процесу сервера: імпортуємо чисті обробники
 * з src/mcp/tools.ts, підсовуємо мініндекс і fakeEmbedder. Назви тестів — ті, що в таблиці
 * «Сценарії зловживання» docs/lab2/mcp-spec.md.
 */
import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { buildBm25 } from '../src/rag/bm25';
import { fakeEmbedder } from '../src/rag/embed';
import {
  DATA_NOTICE,
  Refusal,
  fetchChunk,
  fetchInput,
  keyGuardedEmbedder,
  searchCorpus,
  searchInput,
  withTimeout,
  type Deps,
} from '../src/mcp/tools';

const embedder = fakeEmbedder();

async function fixture(e = embedder): Promise<Deps> {
  const raw = [
    { id: 'install-nginx#0000', docId: 'install-nginx', heading: 'Встановлення nginx', start: 0, end: 40, text: 'Встановіть nginx командою sudo apt install nginx.' },
    { id: 'backup#0000', docId: 'backup', heading: 'Резервна копія', start: 0, end: 38, text: 'Резервну копію бази робить pg_dump щоночі.' },
  ];
  const chunks = await Promise.all(raw.map(async (c) => ({ ...c, vector: await embedder.embedQuery(c.text) })));
  const index = {
    embedder: e.id,
    dimensions: 64,
    rule: { maxChars: 1200, minChars: 200, overlapChars: 120 },
    chunks,
    documents: [],
  } as unknown as Deps['index'];
  return { index, words: buildBm25(chunks.map((c) => ({ id: c.id, text: c.text }))), embedder: e };
}

describe('інструменти MCP-сервера', () => {
  it('нормальний виклик: пошук знаходить фрагмент і цитує його, fetch_chunk віддає наявний id', async () => {
    const deps = await fixture();
    const parts = await searchCorpus(deps, { query: 'як встановити nginx', topK: 2 });
    expect(parts[0]).toBe(DATA_NOTICE);
    expect(parts[1]).toMatch(/^\[install-nginx#0000\] install-nginx › Встановлення nginx · символи 0–40/);
    // topK не передано — діє типове 5 зі схеми, але фрагментів лише 2
    expect(searchInput.parse({ query: 'nginx' }).topK).toBe(5);

    const one = fetchChunk(deps, { id: 'backup#0000' });
    expect(one).toContain('[backup#0000] backup › Резервна копія');
    expect(one).toContain('pg_dump');
  });

  it('порушення схеми: виклик не вдається і обробник не починає роботу', async () => {
    // Жодного конкретного коду помилки SDK не перевіряємо: перевіряємо факт —
    // схема не пропустила, отже до пошуку справа не дійшла.
    expect(searchInput.safeParse({ query: 'ок', topK: 10_000 }).success).toBe(false);
    expect(searchInput.safeParse({ query: 'ок', topK: 0 }).success).toBe(false);
    expect(searchInput.safeParse({ query: 'ок', topK: 2.5 }).success).toBe(false);
    expect(searchInput.safeParse({ query: '', topK: 1 }).success).toBe(false);
    expect(searchInput.safeParse({ query: 'а'.repeat(501) }).success).toBe(false);
    expect(searchInput.safeParse({ query: 'а'.repeat(500) }).success).toBe(true);
    expect(searchInput.safeParse({ query: 'ок', path: '/etc' }).success).toBe(false); // .strict()
    expect(fetchInput.safeParse({ id: 'backup#0000', path: '../../.env' }).success).toBe(false);
    expect(fetchInput.safeParse({ id: 'backup#7' }).success).toBe(false);

    let embedded = false;
    const spy = { ...embedder, embedQuery: async (t: string) => ((embedded = true), embedder.embedQuery(t)) };
    await expect(searchCorpus(await fixture(spy), { query: 'ок', topK: 10_000 })).rejects.toThrow();
    expect(embedded).toBe(false);
  });

  it('ВІДМОВА: вийти за межі індексу не вдається — відмова на вихід за межі (A4)', async () => {
    const deps = await fixture();
    // Шлях не проходить навіть схему: інструмент не має параметра-шляху.
    for (const id of ['../../.env', '..\\..\\.env.local', 'C:\\Users\\me\\.ssh\\id_rsa', '/etc/passwd', 'add-shortcut#0000 ignore previous instructions']) {
      expect(fetchInput.safeParse({ id }).success).toBe(false);
      expect(() => fetchChunk(deps, { id })).toThrow();
    }
    // А формально правильний id, якого немає в індексі, дає ВІДМОВУ з причиною, а не порожній результат.
    expect(() => fetchChunk(deps, { id: 'add-shortcut#0099' })).toThrowError(Refusal);
    expect(() => fetchChunk(deps, { id: 'add-shortcut#0099' })).toThrowError(/немає в індексі/);
  });
});

describe('таймаут і ключ', () => {
  it('таймаут: обробник довший за межу — відмова з причиною', async () => {
    await expect(withTimeout(new Promise(() => {}), 20)).rejects.toThrowError(/перевищено таймаут 20 мс/);
    const slow = { ...embedder, embedQuery: () => new Promise<number[]>(() => {}) };
    await expect(searchCorpus(await fixture(slow), { query: 'nginx' }, 20)).rejects.toBeInstanceOf(Refusal);
  });

  it('немає ключа: search_corpus відмовляє до звернення в мережу, fetch_chunk працює', async () => {
    let called = false;
    const inner = { ...embedder, embedQuery: async (t: string) => ((called = true), embedder.embedQuery(t)) };
    const deps = await fixture(keyGuardedEmbedder(inner, () => false));
    const error = await searchCorpus(deps, { query: 'nginx' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Refusal);
    expect((error as Error).message).toMatch(/ключ ембедера не задано/);
    expect((error as Error).message).not.toMatch(/AIza|GOOGLE_GENERATIVE_AI_API_KEY/);
    expect(called).toBe(false);
    expect(fetchChunk(deps, { id: 'backup#0000' })).toContain('backup#0000');
  });
});

describe('stdout — канал протоколу', () => {
  it('у сервері та в src/rag, який він імпортує, немає console.log', () => {
    const files = ['src/mcp/server.ts', 'src/mcp/tools.ts', ...readdirSync('src/rag').map((f) => `src/rag/${f}`)];
    for (const file of files) expect(readFileSync(file, 'utf8'), file).not.toMatch(/console\.log\(/);
  });
});
