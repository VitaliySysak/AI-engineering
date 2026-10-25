/**
 * ФРАГМЕНТАЦІЯ (крок 04). Чиста функція: без мережі, без файлової системи.
 *
 * Правило курсу: межі за заголовками Markdown, задовгий розділ добиваємо
 * за абзацами й реченнями, короткі огризки приклеюємо до попереднього.
 * Числа нижче — ПАРАМЕТРИ, а не істина: своє правило ви обґрунтували в
 * docs/lab2/indexing.md і підставляєте сюди.
 *
 * Інваріант, від якого залежить цитування на кроці 05:
 *   chunk.text === normalize(raw).slice(chunk.start, chunk.end)
 */
export interface ChunkRule {
  /** Цільовий максимум фрагмента в символах. */
  readonly maxChars: number;
  /** Коротший фрагмент приклеюємо до попереднього. */
  readonly minChars: number;
  /** Перекриття сусідніх фрагментів у символах. */
  readonly overlapChars: number;
  /**
   * Версія 2 (крок 06): розділ, коротший за minChars, приклеюється до НАСТУПНОГО розділу документа,
   * якщо разом вони не довші за maxChars. Без цього назва й опис ставали окремими фрагментами
   * й витісняли фрагмент із командами з топ-5 (q-01, q-02 — docs/lab2/indexing.md, «Версія 2»).
   */
  readonly mergeForward?: boolean;
}

export const RULE: ChunkRule = { maxChars: 1200, minChars: 200, overlapChars: 120, mergeForward: true };

export interface Chunk {
  /** doc-03#0007 — стабільний: залежить лише від id документа і порядку. */
  readonly id: string;
  readonly docId: string;
  /** Шлях заголовків: «Розділ 2 › Терміни». Порожній, якщо заголовків немає. */
  readonly heading: string;
  /** 0-based зсув у НОРМАЛІЗОВАНОМУ тексті документа. */
  readonly start: number;
  /** Виключно: text === normalized.slice(start, end). */
  readonly end: number;
  readonly text: string;
}

/** Нормалізація — частина індексу. Змінили її — перебудуйте індекс. */
export function normalize(raw: string): string {
  return raw.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '');
}

interface Span {
  start: number;
  end: number;
}

/**
 * Розділи між рядками-заголовками. Заголовок лишається ВСЕРЕДИНІ розділу.
 * Відхилення від коду курсу: рядки всередині блоку ``` заголовками не вважаються —
 * у корпусі є bash-коментарі «# Встановлення Docker», які інакше різали б код навпіл.
 */
function sections(text: string): { heading: string; span: Span }[] {
  const out: { heading: string; span: Span }[] = [];
  const path: string[] = [];
  let current = { heading: '', start: 0 };
  let offset = 0;
  let inFence = false;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const m = inFence ? null : /^(#{1,6})\s+(.+)$/.exec(line);
    if (m) {
      if (offset > current.start) out.push({ heading: current.heading, span: { start: current.start, end: offset } });
      const level = (m[1] as string).length;
      path.length = level - 1;
      path[level - 1] = (m[2] as string).trim();
      current = { heading: path.filter(Boolean).join(' › '), start: offset };
    }
    offset += line.length + 1; // +1 — це '\n'
  }
  out.push({ heading: current.heading, span: { start: current.start, end: text.length } });
  return out.filter((s) => text.slice(s.span.start, s.span.end).trim() !== '');
}

/**
 * Остання межа у вікні — але лише в його другій половині: інакше розділ на
 * 1200 символів різався б після першого ж абзацу на 40 символів.
 */
function lastBoundary(window: string, re: RegExp): number | null {
  let found: number | null = null;
  for (const m of window.matchAll(re)) found = (m.index ?? 0) + m[0].length;
  return found !== null && found > window.length / 2 ? found : null;
}

function split(text: string, span: Span, rule: ChunkRule): Span[] {
  const pieces: Span[] = [];
  let start = span.start;
  while (span.end - start > rule.maxChars) {
    const window = text.slice(start, start + rule.maxChars);
    const cut =
      lastBoundary(window, /\n{2,}/g) ??        // 1. порожній рядок
      lastBoundary(window, /[.!?…»]\s/g) ??     // 2. кінець речення
      lastBoundary(window, /\s/g) ??            // 3. хоч пробіл
      rule.maxChars;                            // 4. різати всередині слова
    const end = start + cut;
    pieces.push({ start, end });
    // перекриття: відступаємо назад і виходимо на межу слова
    const back = Math.max(end - rule.overlapChars, start + 1);
    const ws = text.slice(back, end).search(/\s/);
    start = ws > 0 ? back + ws + 1 : back;
  }
  pieces.push({ start, end: span.end });
  return pieces;
}

export function chunkDocument(docId: string, raw: string, rule: ChunkRule = RULE): Chunk[] {
  const text = normalize(raw);
  const parts: { heading: string; span: Span }[] = [];
  for (const section of sections(text)) {
    for (const span of split(text, section.span, rule)) parts.push({ heading: section.heading, span });
  }

  // версія 2: короткий розділ несемо вперед і приклеюємо до наступного, поки разом вміщаємось у maxChars
  const forward: { heading: string; span: Span }[] = [];
  let carry: { heading: string; span: Span } | null = null;
  for (const raw of parts) {
    let part = raw;
    if (carry !== null) {
      if (part.span.end - carry.span.start <= rule.maxChars) {
        part = { heading: part.heading, span: { start: carry.span.start, end: part.span.end } };
      } else {
        forward.push(carry);
      }
      carry = null;
    }
    if (rule.mergeForward === true && part.span.end - part.span.start < rule.minChars) {
      carry = part;
      continue;
    }
    forward.push(part);
  }
  if (carry !== null) forward.push(carry);

  // огризки коротші за minChars приклеюємо до попереднього фрагмента того ж розділу
  const merged: { heading: string; span: Span }[] = [];
  for (const part of forward) {
    const prev = merged[merged.length - 1];
    const short = part.span.end - part.span.start < rule.minChars;
    const fits = prev !== undefined && part.span.end - prev.span.start <= rule.maxChars + rule.overlapChars;
    if (prev !== undefined && short && fits && prev.heading === part.heading) {
      merged[merged.length - 1] = { heading: prev.heading, span: { start: prev.span.start, end: part.span.end } };
    } else {
      merged.push(part);
    }
  }

  return merged.map((part, i) => ({
    id: `${docId}#${String(i).padStart(4, '0')}`,
    docId,
    heading: part.heading,
    start: part.span.start,
    end: part.span.end,
    text: text.slice(part.span.start, part.span.end),
  }));
}
