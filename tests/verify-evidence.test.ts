/**
 * Механічна перевірка evidence (крок 03, після калібрування, прогін 3): pass/fail має посилатися
 * на файл, який справді є в diff. Чисті функції — без мережі.
 */

import { describe, expect, it } from 'vitest';

import { citesDiffFile, diffFiles, EvidenceNotInDiff, parseVerdict } from '../scripts/verify';

const diff = [
  'diff --git a/docs/lab2/baseline.md b/docs/lab2/baseline.md',
  '+# Базова лінія',
  'diff --git a/scripts/validate-golden.ts b/scripts/validate-golden.ts',
  '+export const SUBMIT = { total: 10 };',
  'diff --git a/docs/lab2/baseline.md b/docs/lab2/baseline.md',
].join('\n');
const files = diffFiles(diff);

describe('diffFiles', () => {
  it('повертає унікальні шляхи з заголовків diff', () => {
    expect(files).toEqual(['docs/lab2/baseline.md', 'scripts/validate-golden.ts']);
  });
});

describe('citesDiffFile', () => {
  it('приймає повний шлях і імʼя файлу з рядком', () => {
    expect(citesDiffFile('scripts/validate-golden.ts:30', files)).toBe(true);
    expect(citesDiffFile('baseline.md:q-19', files)).toBe(true);
  });

  it('відхиляє файл, якого немає в diff (випадок 07, прогін 3)', () => {
    expect(citesDiffFile('docs/lab2/eval-report.md:79', files)).toBe(false);
  });
});

describe('parseVerdict із переліком файлів', () => {
  const v = (verdict: string, evidence: string) => JSON.stringify({ id: 'A6', verdict, reason: 'Причина.', evidence });

  it('кидає EvidenceNotInDiff на pass/fail з evidence поза зміною', () => {
    expect(() => parseVerdict(v('pass', 'docs/lab2/eval-report.md:79'), 'A6', files)).toThrow(EvidenceNotInDiff);
    expect(() => parseVerdict(v('fail', 'src/rag/chunk.ts:1'), 'A6', files)).toThrow(EvidenceNotInDiff);
  });

  it('приймає fail з evidence на файл зі зміни і unknown з будь-яким evidence', () => {
    expect(parseVerdict(v('fail', 'scripts/validate-golden.ts:30'), 'A6', files).verdict).toBe('fail');
    expect(parseVerdict(v('unknown', 'docs/lab2/eval-report.md'), 'A6', files).verdict).toBe('unknown');
  });

  it('без переліку файлів поводиться як раніше', () => {
    expect(parseVerdict(v('pass', 'docs/lab2/eval-report.md:79'), 'A6').verdict).toBe('pass');
  });
});
