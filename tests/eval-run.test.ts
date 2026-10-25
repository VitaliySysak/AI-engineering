/**
 * Та сама методика, що в базовій лінії (крок 06): промпт однаковий, контекст додається лише
 * в повідомлення користувача, підсумок рахується без мережі. Фікстури — у коді.
 */

import { describe, expect, it } from 'vitest';

import { SYSTEM_PROMPT as BASELINE_PROMPT } from '../scripts/baseline';
import { SYSTEM_PROMPT, summary, withContext, type EvalRow } from '../scripts/eval-run';

describe('методика eval-run = baseline', () => {
  it('системний промпт той самий, символ у символ', () => {
    expect(SYSTEM_PROMPT).toBe(BASELINE_PROMPT);
  });

  it('контекст іде перед питанням, саме питання не змінюється', () => {
    const text = withContext('Як встановити nginx?', '[install-nginx#0002] …');
    expect(text).toBe('Фрагменти документів:\n\n[install-nginx#0002] …\n\nПитання: Як встановити nginx?');
  });
});

const row = (over: Partial<EvalRow>): EvalRow => ({
  id: 'q-01',
  tags: ['easy'],
  query: 'q',
  must_cite: ['install-nginx'],
  hits: [{ docId: 'install-nginx', chunkId: 'install-nginx#0002' }],
  recallAtK: 1,
  reciprocalRank: 1,
  answer: 'a [install-nginx#0002]',
  cited: ['install-nginx#0002'],
  usage: { inputTokens: 100, cachedTokens: 0, outputTokens: 50 },
  latencyMs: 1000,
  searchMs: 300,
  retried: false,
  model: 'gemini-3.5-flash-lite',
  ts: 't',
  verdict: 'correct',
  baselineVerdict: 'partial',
  citationCorrect: true,
  injectionResisted: null,
  ...over,
});

describe('summary', () => {
  const rows = [
    row({}),
    row({ id: 'q-02', verdict: 'wrong', baselineVerdict: 'wrong', recallAtK: 0, reciprocalRank: 0, citationCorrect: false }),
    row({ id: 'q-16', tags: ['unanswerable'], must_cite: [], recallAtK: null, reciprocalRank: null, verdict: 'refused', baselineVerdict: 'wrong', cited: [], citationCorrect: null }),
    row({ id: 'q-19', tags: ['injection', 'easy'], verdict: 'correct', baselineVerdict: 'partial', injectionResisted: true }),
  ];

  it('рахує точність, відмови, injection, recall і MRR лише на своїх знаменниках', () => {
    const out = summary({ k: 5, rows }).join('\n');
    expect(out).toContain('| Точність на відповідних запитах (correct / 3) | 2 / 3 = 66.7% |');
    expect(out).toContain('| Правильні відмови (unanswerable) | 1 із 1 |');
    expect(out).toContain('| Стійкість до injection | 1 із 1 |');
    expect(out).toContain('| recall@5 | 0.67 |');
    expect(out).toContain('| MRR@5 | 0.67 |');
    expect(out).toContain('n = 3, обчислено');
  });

  it('будує таблицю переходів від baselineVerdict до verdict', () => {
    const out = summary({ k: 5, rows }).join('\n');
    expect(out).toContain('| partial | correct | 2 | q-01, q-19 |');
    expect(out).toContain('| wrong | refused | 1 | q-16 |');
  });

  it('не рахує підсумок, поки є рядки без вердикту', () => {
    expect(() => summary({ k: 5, rows: [row({ verdict: null })] })).toThrow('не поставлено verdict');
  });
});
