import { describe, expect, it } from 'vitest';

import { chunkDocument, normalize, RULE } from '../src/rag/chunk';

const doc = `# Інструкція\n\n## Розділ 1\n${'А'.repeat(900)}\n\n${'Б'.repeat(900)}\n\n## Розділ 2\nКоротко.\n`;

describe('chunkDocument', () => {
  it('тримає інваріант зсувів', () => {
    const text = normalize(doc);
    for (const c of chunkDocument('doc-01', doc)) {
      expect(c.text).toBe(text.slice(c.start, c.end));
    }
  });

  it('не перевищує максимум', () => {
    for (const c of chunkDocument('doc-01', doc)) {
      expect(c.end - c.start).toBeLessThanOrEqual(RULE.maxChars);
    }
  });

  it('веде шлях заголовків', () => {
    const headings = chunkDocument('doc-01', doc).map((c) => c.heading);
    expect(headings).toContain('Інструкція › Розділ 1');
    expect(headings).toContain('Інструкція › Розділ 2');
  });

  it('детермінований: ті самі id на тому самому вході', () => {
    const a = chunkDocument('doc-01', doc).map((c) => c.id);
    const b = chunkDocument('doc-01', doc).map((c) => c.id);
    expect(a).toEqual(b);
  });

  // Відхилення від коду курсу: bash-коментар у блоці коду — не заголовок (corpus/install-docker.md).
  it('не вважає заголовком рядок «# …» усередині блоку ```', () => {
    const md = '# Docker\n\n## Команди / Код\n\n```bash\n# Встановлення Docker\nsudo apt-get update\n```\n';
    const chunks = chunkDocument('install-docker', md);
    expect(chunks.map((c) => c.heading)).not.toContain('Встановлення Docker');
    const code = chunks.find((c) => c.text.includes('sudo apt-get update'));
    expect(code?.text).toContain('# Встановлення Docker');
    expect(code?.heading).toBe('Docker › Команди / Код');
  });

  // Версія 2 правила (крок 06): назва й опис ідуть разом із командами одним фрагментом.
  it('приклеює короткі назву й опис до наступного розділу', () => {
    const md = '# Встановлення Nginx\n\n## Опис\n\nКоманда для швидкого встановлення.\n\n## Команди / Код\n\n```bash\nsudo apt install nginx\n```\n';
    const chunks = chunkDocument('install-nginx', md);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.heading).toBe('Встановлення Nginx › Команди / Код');
    expect(chunks[0]!.text).toBe(normalize(md));
  });

  it('не приклеює, якщо разом довше за maxChars', () => {
    const md = `# Т\n\n## Опис\nкоротко\n\n## Код\n${'x'.repeat(1190)}\n`;
    const chunks = chunkDocument('doc-03', md, { ...RULE, maxChars: 1200 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.end - c.start).toBeLessThanOrEqual(RULE.maxChars + RULE.overlapChars);
  });

  it('без mergeForward поводиться як версія 1 (правило курсу)', () => {
    const md = '# Т\n\n## Опис\nкоротко\n\n## Код\nsudo ss -tulpn\n';
    expect(chunkDocument('doc-04', md, { ...RULE, mergeForward: false })).toHaveLength(3);
  });

  it('CRLF і BOM не зсувають інваріант', () => {
    const raw = '﻿# Т\r\n\r\n## Опис\r\nТекст  \r\n';
    const text = normalize(raw);
    expect(text).toBe('# Т\n\n## Опис\nТекст\n');
    for (const c of chunkDocument('doc-02', raw)) expect(c.text).toBe(text.slice(c.start, c.end));
  });
});
