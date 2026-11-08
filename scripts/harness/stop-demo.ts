/**
 * Шар прогону зупинення (Лабораторна 3, крок 03): наш цикл на AI SDK свідомо впирається в isStepCount(2).
 * ХОДИТЬ У МЕРЕЖУ (безкоштовний рівень Gemini, ключ GOOGLE_GENERATIVE_AI_API_KEY) — запускає автор:
 *
 *   npx tsx --env-file=.env.local scripts/harness/stop-demo.ts
 *
 * Запис заборонено (write кидає виняток), читання — лише в межах репозиторію. Рядок про зупинку пише stepLimit.
 */
import { readdir, readFile } from 'node:fs/promises';

import { createAgent, pickModel } from '../../src/agent/agent-aisdk';
import { resolveInside } from '../../src/agent/tools';
import { stepLimit } from '../../src/harness/stop';

const N = 2;
const root = process.cwd();
const agent = createAgent(
  pickModel(),
  {
    list: (d) => readdir(resolveInside(root, d)),
    read: (p) => readFile(resolveInside(root, p), 'utf8'),
    write: async () => {
      throw new Error('запис у демонстрації заборонено');
    },
  },
  N,
  stepLimit(N, 'stop-demo'),
);

const prompt = 'Прочитай по черзі кожен файл у теці corpus (спершу list_files, потім read_file для кожного) і дай підсумок: назва файлу — одне речення.';

try {
  const result = await agent.generate({ prompt });
  console.log(`Кроків виконано: ${result.steps.length} із межею ${N}; причина завершення: ${result.finishReason}`);
} catch (error) {
  // Цикл, зупинений межею посеред виклику інструментів, не встигає дати структурований вихід — це очікувано
  console.log(`Цикл зупинено межею isStepCount(${N}) до структурованого виходу: ${error instanceof Error ? error.name : String(error)}`);
}
console.log('Рядок журналу: docs/lab3/stop-log.jsonl (limit: isStepCount)');
