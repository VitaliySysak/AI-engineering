/**
 * ПРАВИЛО ВІДМОВИ (крок 05) для запитів, відповіді на які в колекції немає (тег unanswerable).
 *
 * Порогом НЕ є бал RRF: він залежить лише від рангів, і найкращий фрагмент отримує ~1/61 завжди —
 * і коли точно відповідає, і коли просто найменш непотрібний. Міряти треба подібність:
 * косинус найкращого фрагмента і те, чи знайшла гілка слів хоч щось.
 *
 * Числа калібруються на еталонному наборі (scripts/search.ts --golden) і записуються в
 * docs/lab2/retrieval.md. Поки minCosine === null — правило не відкаліброване і нічого не відкидає.
 */
export interface RefusalRule {
  /** Відмова, якщо косинус найкращого фрагмента нижчий. null — ще не відкалібровано. */
  readonly minCosine: number | null;
  /** Відмова, якщо гілка слів не знайшла жодного фрагмента (жодного спільного слова). */
  readonly requireWordHit: boolean;
}

export const REFUSAL: RefusalRule = { minCosine: null, requireWordHit: false };

export interface RefusalSignal {
  /** Косинус найкращого фрагмента у векторній гілці. */
  readonly topCosine: number;
  /** Скільки фрагментів знайшла гілка слів (BM25, бал > 0). */
  readonly wordHits: number;
}

/** null — відповідати; рядок — причина відмови. Чиста функція, без мережі. */
export function refusalReason(signal: RefusalSignal, rule: RefusalRule = REFUSAL): string | null {
  if (rule.minCosine !== null && signal.topCosine < rule.minCosine) {
    return `найкращий фрагмент надто далекий: косинус ${signal.topCosine.toFixed(4)} < ${rule.minCosine}`;
  }
  if (rule.requireWordHit && signal.wordHits === 0) {
    return 'жодне слово запиту не трапляється в колекції';
  }
  return null;
}
