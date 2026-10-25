/**
 * Брама по комітах (крок 03, після пропуску на diff гілки lab2/verify-stop): розбір аргументів
 * і правило «червоно, якщо червоний хоч один коміт». Без мережі й без git.
 */

import { describe, expect, it } from 'vitest';

import { isRangeBlocked, parseTarget } from '../scripts/verify';
import type { VerifyReport } from '../src/verify/schema';

const report = (verdict: 'pass' | 'fail' | 'unknown'): VerifyReport => ({
  results: [{ id: 'A5', verdict, reason: 'Причина.', evidence: verdict === 'unknown' ? '' : 'x.ts:1' }],
});

describe('parseTarget', () => {
  it('без прапорця — файл diff (типово docs/lab2/verify-input.diff)', () => {
    expect(parseTarget([])).toEqual({ kind: 'file', path: 'docs/lab2/verify-input.diff' });
    expect(parseTarget(['docs/lab2/calibration/case-11.diff'])).toEqual({ kind: 'file', path: 'docs/lab2/calibration/case-11.diff' });
  });

  it('--commits задає діапазон; останній прапорець виграє (npm run verify -- --commits …)', () => {
    expect(parseTarget(['--commits', 'main..HEAD'])).toEqual({ kind: 'commits', range: 'main..HEAD' });
    expect(parseTarget(['--commits', 'main..HEAD', '--commits', 'main..lab2/verify-stop'])).toEqual({
      kind: 'commits',
      range: 'main..lab2/verify-stop',
    });
  });

  it('--commits без діапазону — помилка', () => {
    expect(() => parseTarget(['--commits'])).toThrow('потребує діапазону');
    expect(() => parseTarget(['--commits', '--x'])).toThrow('потребує діапазону');
  });
});

describe('isRangeBlocked', () => {
  it('червоно, якщо червоний хоч один коміт; unknown і pass браму не валять', () => {
    expect(isRangeBlocked([report('unknown'), report('pass')])).toBe(false);
    expect(isRangeBlocked([report('unknown'), report('fail')])).toBe(true);
  });
});
