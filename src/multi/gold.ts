/**
 * Детермінований оцінювач якості (той самий підхід, що graders у Лабораторній 3, крок 04):
 * скільки еталонних імпортерів і тестових файлів названо у відповіді.
 */
import type { Question } from './question';
import type { Draft } from './synthesize';

const baseName = (p: string) => p.split('/').pop()!;

/** Файл вважаємо названим, якщо в тексті є його шлях відносно lib/ або власне імʼя файлу. */
export function mentions(text: string, file: string): boolean {
  return text.includes(file) || text.includes(baseName(file));
}

export function score(q: Question, draft: Draft | null, laneTexts: string[] = []) {
  const text = [draft?.answer ?? '', ...(draft?.claims ?? []).map((c) => `${c.text} ${c.path ?? ''}`), ...laneTexts].join('\n');
  // Сам модуль не рахуємо імпортером самого себе.
  const own = baseName(q.module);
  const importers = q.gold_importers.filter((f) => baseName(f) !== own);
  return {
    importers: importers.filter((f) => mentions(text, f)).length,
    importersTotal: importers.length,
    tests: q.gold_tests.filter((f) => mentions(text, f)).length,
    testsTotal: q.gold_tests.length,
  };
}
