import { describe, expect, it } from 'vitest';

import { bestRank } from '../scripts/search';
import { buildBm25, searchBm25, tokenize } from '../src/rag/bm25';
import { chunkDocument } from '../src/rag/chunk';
import { validateAnswer } from '../src/rag/cite';
import { fakeEmbedder } from '../src/rag/embed';
import { refusalReason } from '../src/rag/refusal';
import { rrf } from '../src/rag/rrf';
import { bm25From, hybridSearch } from '../src/rag/search';
import type { IndexedChunk, IndexFile } from '../src/rag/store';

describe('rrf', () => {
  it('той самий розбір, що в методичці', () => {
    const fused = rrf([['A', 'B', 'C'], ['C', 'A', 'D']]);
    expect(fused.map((r) => r.id)).toEqual(['A', 'C', 'B', 'D']);
    expect(fused[0]!.score).toBeCloseTo(1 / 61 + 1 / 62, 10);
    // згода двох гілок перебиває перше місце в одній
    expect(fused[0]!.score).toBeGreaterThan(fused[1]!.score);
  });

  it('ранги рахуються з одиниці', () => {
    expect(rrf([['A']])[0]!.score).toBeCloseTo(1 / 61, 10);
  });

  it('відсутній у списку документ не додає нічого', () => {
    expect(rrf([['A', 'B'], ['A']]).find((r) => r.id === 'B')!.score).toBeCloseTo(1 / 62, 10);
  });
});

describe('bm25', () => {
  const docs = [
    { id: 'c-1', text: 'Помилка E-418 означає, що формат заявки не підтримується.' },
    { id: 'c-2', text: 'Відмова у реєстрації оскаржується протягом тридцяти днів.' },
    { id: 'c-3', text: 'Заявка подається через особистий кабінет.' },
  ];
  const index = buildBm25(docs);

  it('бачить кирилицю', () => {
    expect(tokenize('Помилка E-418')).toEqual(['помилка', '418']);
  });

  it('знаходить рідкісний точний рядок', () => {
    expect(searchBm25(index, 'E-418')[0]!.id).toBe('c-1');
  });

  it('нічого не повертає, коли спільних слів немає', () => {
    // «куди», «звертатися», «після», «відхилення» не трапляються в жодному фрагменті;
    // стемінгу немає, тому «відхилення» не збігається з «відмова»
    expect(searchBm25(index, 'куди звертатися після відхилення')).toEqual([]);
  });
});

describe('validateAnswer', () => {
  const served = [{ id: 'doc-03#0004' }] as unknown as IndexedChunk[];

  it('ловить відповідь без цитати', () => {
    expect(validateAnswer('Тридцять днів.', served).join(' ')).toContain('немає жодної цитати');
  });

  it('ловить цитату на невидане', () => {
    expect(validateAnswer('Тридцять днів [doc-99#0001].', served).join(' ')).toContain('не давали');
  });

  it('приймає цитату на видане', () => {
    expect(validateAnswer('Тридцять днів [doc-03#0004].', served)).toEqual([]);
  });

  it('бачить id у kebab-case, як у нашому корпусі', () => {
    const ours = [{ id: 'private-github-repository-access#0002' }] as unknown as IndexedChunk[];
    expect(validateAnswer('Ключ ed25519 [private-github-repository-access#0002].', ours)).toEqual([]);
  });
});

// Гібрид на мінікорпусі з підробленим ембедером: перевіряє механіку, а не якість моделі.
describe('hybridSearch на мінікорпусі', () => {
  const corpus: Record<string, string> = {
    'check-open-ports': '# Перевірка відкритих портів\n\n## Команди / Код\n\n```bash\nsudo ss -tulpn\n```\n',
    'install-nginx': '# Встановлення Nginx\n\n## Команди / Код\n\n```bash\nsudo apt install nginx\n```\n',
    backup: '# Відновлення бекапу\n\n## Команди / Код\n\n```bash\nzcat dump.gz | docker exec -i db psql\n```\n',
  };
  const embedder = fakeEmbedder();

  async function build(): Promise<IndexFile> {
    const chunks = Object.entries(corpus).flatMap(([id, text]) => chunkDocument(id, text));
    const vectors = await embedder.embedDocuments(chunks.map((c) => c.text));
    return {
      version: 1,
      builtAt: 'test',
      embedder: embedder.id,
      dimensions: embedder.dimensions,
      rule: { maxChars: 1200, minChars: 200, overlapChars: 120 },
      normalization: 'test',
      documents: [],
      chunks: chunks.map((c, i) => ({ ...c, vector: vectors[i]! })),
    };
  }

  it('правильний документ — першим, ранги обох гілок з одиниці', async () => {
    const index = await build();
    const hits = await hybridSearch(index, bm25From(index), embedder, 'як встановити nginx', 5);
    expect(hits[0]!.chunk.docId).toBe('install-nginx');
    expect(hits[0]!.rankWords).toBe(1);
    expect(hits.length).toBeLessThanOrEqual(5);
  });

  it('bestRank рахує найкращий ранг документа серед його фрагментів', () => {
    const list = [{ id: 'backup#0001' }, { id: 'install-nginx#0000' }, { id: 'install-nginx#0001' }];
    expect(bestRank(list, ['install-nginx'])).toBe(2);
    expect(bestRank(list, ['check-open-ports'])).toBeNull();
  });
});

describe('refusalReason', () => {
  it('без калібрування (minCosine = null) не відмовляє ніколи', () => {
    expect(refusalReason({ topCosine: 0.01, wordHits: 0 }, { minCosine: null, requireWordHit: false })).toBeNull();
  });

  it('відмовляє за косинусом і за порожньою гілкою слів — не за балом RRF', () => {
    const rule = { minCosine: 0.6, requireWordHit: true };
    expect(refusalReason({ topCosine: 0.55, wordHits: 3 }, rule)).toContain('косинус');
    expect(refusalReason({ topCosine: 0.7, wordHits: 0 }, rule)).toContain('жодне слово');
    expect(refusalReason({ topCosine: 0.7, wordHits: 3 }, rule)).toBeNull();
  });
});
