/**
 * Шар прогону зупинення (Лабораторна 3, крок 03): наш цикл на AI SDK свідомо впирається в isStepCount(2).
 * ХОДИТЬ У МЕРЕЖУ (безкоштовний рівень Gemini, ключ GOOGLE_GENERATIVE_AI_API_KEY) — запускає автор:
 *
 *   npx tsx --env-file=.env.local scripts/harness/stop-demo.ts
 *
 * Запис заборонено (write кидає виняток), читання — лише в межах репозиторію. Рядок про зупинку пише stepLimit.
 */
import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';

import { google } from '@ai-sdk/google';

import { createAgent } from '../../src/agent/agent-aisdk';
import { resolveInside } from '../../src/agent/tools';
import { STOP_LOG, stepLimit } from '../../src/harness/stop';
import { CATALOG } from '../../src/models';

const N = 2;
const root = process.cwd();
const agent = createAgent(
  // та сама модель безкоштовного рівня, що й у судді: перша спроба на gemini-3.8-flash впала з AI_RetryError
  google(CATALOG['gemini-3.5-flash-lite'].id),
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

const stops = () => (existsSync(STOP_LOG) ? readFileSync(STOP_LOG, 'utf8').split('\n').filter((l) => l.includes('"stop-demo"')).length : 0);
const before = stops();

try {
  const result = await agent.generate({ prompt });
  console.log(`Кроків виконано: ${result.steps.length} із межею ${N}; причина завершення: ${result.finishReason}`);
} catch (error) {
  // Зупинений межею цикл може не дати структурованого виходу, але виняток сам по собі нічого не доводить
  console.log(`Виняток: ${error instanceof Error ? `${error.name}: ${error.message.slice(0, 300)}` : String(error)}`);
}
await new Promise((resolve) => setTimeout(resolve, 50)); // stepLimit пише журнал асинхронно
// Висновок — лише за журналом: збій провайдера теж перериває цикл, але межа тоді не спрацювала
const hit = stops() > before;
console.log(hit ? `Межа isStepCount(${N}) спрацювала: новий рядок у ${STOP_LOG}` : `Межа isStepCount(${N}) НЕ спрацювала: нового рядка в журналі немає`);
if (!hit) process.exit(1);
