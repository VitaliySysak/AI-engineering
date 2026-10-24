/**
 * Тести верифікатора (крок 03): схема вердикту, брама, розбір критеріїв, очищення diff і розбір
 * відповіді судді. Лише чисті функції — без мережі, ключів і файлів.
 */

import { describe, expect, it } from 'vitest';

import { extractJson, judgePrompt, parseCriteria, parseVerdict, redactDiff } from '../scripts/verify';
import { isBlocked, verifyReport } from '../src/verify/schema';

const ok = { id: 'A1', verdict: 'pass', reason: 'Тести зелені.', evidence: 'tests/x.test.ts:3' };

describe('схема вердикту', () => {
  it('приймає строгий звіт і відхиляє зайве поле чи невідомий вердикт', () => {
    expect(verifyReport.safeParse({ results: [ok] }).success).toBe(true);
    expect(verifyReport.safeParse({ results: [{ ...ok, score: 1 }] }).success).toBe(false);
    expect(verifyReport.safeParse({ results: [{ ...ok, verdict: 'maybe' }] }).success).toBe(false);
    expect(verifyReport.safeParse({ results: [] }).success).toBe(false);
  });

  it('брама червона лише на fail; unknown її не валить', () => {
    const unknown = { ...ok, id: 'A2', verdict: 'unknown' as const, evidence: '' };
    expect(isBlocked(verifyReport.parse({ results: [ok, unknown] }))).toBe(false);
    expect(isBlocked(verifyReport.parse({ results: [ok, { ...ok, id: 'A3', verdict: 'fail' }] }))).toBe(true);
  });
});

describe('parseCriteria', () => {
  it('бере рядки A… з таблиці критеріїв і пропускає решту таблиць', () => {
    const spec = [
      '| Ціль | Число | Як міряється | Де число |',
      '| G1. Точність | ≥ 80% | прогін | eval-report.md |',
      '| № | Критерій | Чим перевіряється |',
      '|---|---|---|',
      '| A1 | `npm test` зелений | команди + CI |',
      '| A5 | Набір ≥ 20 запитів | `tests/validate-golden.test.ts` |',
    ].join('\r\n');
    expect(parseCriteria(spec)).toEqual([
      { id: 'A1', text: '`npm test` зелений', check: 'команди + CI' },
      { id: 'A5', text: 'Набір ≥ 20 запитів', check: '`tests/validate-golden.test.ts`' },
    ]);
  });
});

describe('redactDiff', () => {
  const envSection = 'diff --git a/.env.local b/.env.local\n+GEMINI_API_KEY=AIzaSyA-справжній-не-потрібен\n';
  const exampleSection = 'diff --git a/.env.example b/.env.example\n+VERIFIER_MODEL=\n';
  const codeSection = 'diff --git a/src/a.ts b/src/a.ts\n+const key = "AIzaSyD0123456789abcdefghijklmn";\n+export const x = 1;\n';

  it('прибирає секцію .env.local, але лишає .env.example', () => {
    const { text, removed } = redactDiff(envSection + exampleSection);
    expect(text).not.toContain('.env.local');
    expect(text).toContain('.env.example');
    expect(removed).toEqual(['секція файлу .env.local']);
  });

  it('маскує рядок, схожий на ключ, і не чіпає звичайний код', () => {
    const { text, removed } = redactDiff(codeSection);
    expect(text).not.toContain('AIzaSyD0123456789');
    expect(text).toContain('[ПРИБРАНО: схоже на секрет]');
    expect(text).toContain('+export const x = 1;');
    expect(removed).toHaveLength(1);
  });

  it('порожнє KEY= у шаблоні не вважається секретом', () => {
    expect(redactDiff('diff --git a/.env.example b/.env.example\n+GEMINI_API_KEY=\n').removed).toEqual([]);
  });
});

describe('відповідь судді', () => {
  it('витягує JSON з обгортки ```json і з тексту навколо', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Ось вердикт: {"a":2} — кінець')).toEqual({ a: 2 });
    expect(() => extractJson('немає json')).toThrow('немає JSON');
  });

  it('приймає валідний вердикт і відхиляє чужий id, pass без evidence і зайве поле', () => {
    expect(parseVerdict(JSON.stringify(ok), 'A1')).toEqual(ok);
    expect(() => parseVerdict(JSON.stringify(ok), 'A2')).toThrow('питали про A2');
    expect(() => parseVerdict(JSON.stringify({ ...ok, evidence: ' ' }), 'A1')).toThrow('без evidence');
    expect(() => parseVerdict(JSON.stringify({ ...ok, note: 'x' }), 'A1')).toThrow();
    const unknown = { id: 'A1', verdict: 'unknown', reason: 'Немає результату CI.', evidence: '' };
    expect(parseVerdict(JSON.stringify(unknown), 'A1')).toEqual(unknown);
  });

  it('промпт містить рівно один критерій і сам diff', () => {
    const prompt = judgePrompt({ id: 'A3', text: 'validateAnswer відхиляє чужі id', check: 'тест' }, '+x');
    expect(prompt).toContain('Критерій A3: validateAnswer відхиляє чужі id');
    expect(prompt).toContain('```diff\n+x\n```');
    expect(prompt).not.toContain('A1');
  });
});
