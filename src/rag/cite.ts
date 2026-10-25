/**
 * ЦИТУВАННЯ (крок 05). Цитата має дати читачеві знайти місце в документі
 * за 10 секунд — це вимога зі spec.md, а не побажання.
 */
import type { IndexedChunk } from './store';

export interface Citation {
  readonly chunkId: string;
  readonly docId: string;
  readonly heading: string;
  /** 0-based зсуви в нормалізованому тексті документа — як у кроці 04. */
  readonly start: number;
  readonly end: number;
  /** Дослівний уривок з фрагмента: те, на чому тримається твердження. */
  readonly quote: string;
}

export function toCitation(chunk: IndexedChunk, quote: string): Citation {
  return {
    chunkId: chunk.id,
    docId: chunk.docId,
    heading: chunk.heading,
    start: chunk.start,
    end: chunk.end,
    quote,
  };
}

/** Рядок, який бачить користувач. */
export function renderCitation(c: Citation): string {
  const where = c.heading === '' ? '' : ` › ${c.heading}`;
  return `[${c.chunkId}] ${c.docId}${where} · символи ${c.start}–${c.end}`;
}

/** Фрагменти в промпт — з id, бо цитувати модель має саме їх. */
export function renderContext(chunks: readonly IndexedChunk[]): string {
  return chunks
    .map((c) => `[${c.id}] ${c.docId}${c.heading === '' ? '' : ` › ${c.heading}`}\n${c.text}`)
    .join('\n\n---\n\n');
}

const CHUNK_ID = /^[a-z0-9][a-z0-9-]*#\d{4}$/i;

/**
 * id з квадратних дужок: `[a#0001]` і, на відміну від коду курсу, список `[a#0001, b#0002]` —
 * саме так модель процитувала в першій відповіді кроку 05, і валідатор курсу її відкинув.
 * Дужки без id (`[ПРИБРАНО]`, `[1]`) не вважаються цитатою.
 */
export function citedIds(answer: string): string[] {
  return [...answer.matchAll(/\[([^\]\n]+)]/g)].flatMap((m) =>
    (m[1] as string).split(/[,;]\s*/).map((s) => s.trim()).filter((s) => CHUNK_ID.test(s)),
  );
}

/**
 * Відповідь без цитати і відповідь із цитатою на невидане — помилки.
 * Повертає перелік проблем; порожній означає «зелено».
 */
export function validateAnswer(answer: string, served: readonly IndexedChunk[]): string[] {
  const problems: string[] = [];
  const ids = new Set(served.map((c) => c.id));
  const used = citedIds(answer);

  if (used.length === 0) problems.push('у відповіді немає жодної цитати');
  for (const id of used) {
    if (!ids.has(id)) problems.push(`цитата [${id}]: такого фрагмента асистентові не давали`);
  }
  return problems;
}
