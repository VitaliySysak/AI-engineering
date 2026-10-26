/**
 * Пул кроку 07 без мережі: гілки — підроблені задачі з таймерами. Перевіряємо те, на чому тримається вимір:
 * ширина не перевищується, помилка однієї гілки не губить інших, правило зупинки — перед стартом гілки.
 */

import { describe, expect, it } from 'vitest';

import { BUDGET, parseWidth, runPool, type Budget } from '../scripts/parallel-eval';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const budget = (over: Partial<Budget> = {}): Budget => ({ maxBranches: 2, maxTokens: 1_000, maxWallMs: 60_000, ...over });

/** Задачі, що рахують, скільки їх виконується одночасно. */
function tracked(n: number, ms = 5) {
  let running = 0;
  let peak = 0;
  const tasks = Array.from({ length: n }, (_, i) => async () => {
    running++;
    peak = Math.max(peak, running);
    await sleep(ms);
    running--;
    return i;
  });
  return { tasks, peak: () => peak };
}

describe('runPool', () => {
  it('одночасно не більше maxBranches гілок, і ширина справді досягається', async () => {
    const t = tracked(10);
    const { results, stoppedEarly } = await runPool(t.tasks, budget({ maxBranches: 3 }), () => 0);
    expect(t.peak()).toBe(3);
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]); // порядок — за задачами, а не за завершенням
    expect(stoppedEarly).toBe(false);
  });

  it('ширина 1 — строго послідовно', async () => {
    const t = tracked(4);
    await runPool(t.tasks, budget({ maxBranches: 1 }), () => 0);
    expect(t.peak()).toBe(1);
  });

  it('гілок не більше, ніж задач', async () => {
    const t = tracked(2);
    await runPool(t.tasks, budget({ maxBranches: 8 }), () => 0);
    expect(t.peak()).toBe(2);
  });

  it('помилка гілки (429) лишається в її клітинці, інші гілки відпрацьовують', async () => {
    const tasks = [
      async () => 'a',
      async () => {
        throw new Error('HTTP 429');
      },
      async () => 'c',
    ];
    const { results } = await runPool(tasks, budget(), () => 0);
    expect(results[0]).toBe('a');
    expect(results[1]).toBeInstanceOf(Error);
    expect((results[1] as Error).message).toBe('HTTP 429');
    expect(results[2]).toBe('c');
  });

  it('нерядкову помилку загортає в Error', async () => {
    const { results } = await runPool([() => Promise.reject('збій')], budget(), () => 0);
    expect(results[0]).toBeInstanceOf(Error);
  });

  it('стеля токенів: нова гілка не стартує, розпочаті доробляються', async () => {
    let spent = 0;
    let started = 0;
    const tasks = Array.from({ length: 6 }, () => async () => {
      started++;
      await sleep(5);
      spent += 400;
      return spent;
    });
    const { results, stoppedEarly } = await runPool(tasks, budget({ maxBranches: 1, maxTokens: 1_000 }), () => spent);
    // 0 → 400 → 800 → 1200: після третьої гілки стеля перетнута, четверта не стартує
    expect(started).toBe(3);
    expect(results.filter((r) => r !== undefined)).toHaveLength(3);
    expect(stoppedEarly).toBe(true);
  });

  it('стеля часу стіни 0: жодна гілка не стартує', async () => {
    const t = tracked(3);
    const { results, stoppedEarly } = await runPool(t.tasks, budget({ maxWallMs: 0 }), () => 0);
    expect(t.peak()).toBe(0);
    expect(results.filter((r) => r !== undefined)).toHaveLength(0);
    expect(stoppedEarly).toBe(true);
  });

  it('паралельний пул швидший за послідовний на гілках, що чекають', async () => {
    const time = async (width: number) => {
      const started = performance.now();
      await runPool(tracked(8, 20).tasks, budget({ maxBranches: width }), () => 0);
      return performance.now() - started;
    };
    const sequential = await time(1);
    const parallel = await time(4);
    expect(parallel).toBeLessThan(sequential / 2);
  });
});

describe('бюджет і ширина', () => {
  it('бюджет — ті самі числа, що в budget.md, розділ 2', () => {
    expect(BUDGET).toEqual({ maxBranches: 8, maxTokens: 60_000, maxWallMs: 300_000 });
  });

  it('ширина — ціле від 1 до maxBranches; без аргументу — 1', () => {
    expect(parseWidth(undefined)).toBe(1);
    expect(parseWidth('4')).toBe(4);
    expect(parseWidth('8')).toBe(8);
    for (const bad of ['0', '9', '2.5', 'abc', '-1']) expect(() => parseWidth(bad)).toThrow(/ширина пулу/);
  });
});
