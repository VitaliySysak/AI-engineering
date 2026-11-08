/** Згода судді з розміткою (Лабораторна 3, крок 02): числа пораховано вручну в коментарях. */
import { describe, expect, it } from 'vitest';

import { agreement, confusion, type Label } from '../../scripts/kappa';

describe('agreement', () => {
  it('повний збіг: raw 1, kappa 1', () => {
    const a = agreement(['pass', 'fail', 'unknown'], ['pass', 'fail', 'unknown']);
    expect(a.raw).toBe(1);
    expect(a.kappa).toBeCloseTo(1, 10);
  });

  it('висока сира згода при перекошених мітках дає значно нижчу каппу', () => {
    // 10 випадків, збігів 8: raw 0,8. Я: 9 pass + 1 fail; суддя: 9 pass + 1 fail (розійшлися в різних місцях).
    // pe = 0,9·0,9 + 0,1·0,1 = 0,82; kappa = (0,8 − 0,82) / 0,18 = −0,111…
    const mine: Label[] = ['fail', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass'];
    const judge: Label[] = ['pass', 'fail', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass'];
    const a = agreement(mine, judge);
    expect(a.raw).toBeCloseTo(0.8, 10);
    expect(a.expected).toBeCloseTo(0.82, 10);
    expect(a.kappa).toBeCloseTo(-0.1111, 3);
  });

  it('усі мітки однакові в обох — каппа не визначена (NaN), а не 1', () => {
    expect(agreement(['pass', 'pass'], ['pass', 'pass']).kappa).toBeNaN();
  });

  it('порожня або різна довжина — помилка', () => {
    expect(() => agreement([], [])).toThrow();
    expect(() => agreement(['pass'], [])).toThrow();
  });
});

describe('confusion', () => {
  it('рядок — моя мітка, стовпець — суддя', () => {
    const m = confusion(['pass', 'pass', 'fail'], ['pass', 'unknown', 'pass']);
    expect(m.pass).toEqual({ pass: 1, fail: 0, unknown: 1 });
    expect(m.fail).toEqual({ pass: 1, fail: 0, unknown: 0 });
  });
});
