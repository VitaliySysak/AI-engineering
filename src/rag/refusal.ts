/**
 * ПРАВИЛО ВІДМОВИ (крок 05) для запитів, відповіді на які в колекції немає (тег unanswerable).
 *
 * Порогом НЕ є бал RRF: він залежить лише від рангів, і найкращий фрагмент отримує ~1/61 завжди —
 * і коли точно відповідає, і коли просто найменш непотрібний. Міряти треба подібність:
 * косинус найкращого фрагмента і те, чи знайшла гілка слів хоч щось.
 *
 * Калібрування на еталонному наборі (scripts/search.ts --golden, 2026-10-25): косинус топ-1 на unanswerable
 * 0.6804–0.7081, на запитах із відповіддю 0.6860–0.8406 — діапазони перекриваються, жоден поріг їх не
 * розділяє; гілка слів на unanswerable знаходить 6–16 фрагментів. Тому рішення автора: порогу на рівні
 * пошуку немає (minCosine = null, requireWordHit = false), відмовляє модель за системним промптом,
 * і це вимірює крок 06. Деталі — docs/lab2/retrieval.md, розділ 4.
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
