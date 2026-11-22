/**
 * Питання про чужий проєкт і його розкладка на смуги читання (Лабораторна 4, крок 03).
 * Функціональність: «які модулі зачепить зміна в <модуль> і що про це каже історія».
 */
import { z } from 'zod';

import type { Branch } from './fanout';

export const questionSchema = z
  .object({
    id: z.string().regex(/^q\d+$/),
    /** Шлях модуля у форку, відносно кореня. */
    module: z.string().min(1),
    /** Еталон (madge 8.0.0 --depends, знято 2026-11-22): хто імпортує модуль — шляхи відносно lib/. */
    gold_importers: z.array(z.string()).min(1),
    /** Еталон: тестові файли, у яких згадано модуль (grep по tests/unit). Порожньо — тестів немає. */
    gold_tests: z.array(z.string()),
  })
  .strict();

export type Question = z.infer<typeof questionSchema>;

export function parseQuestions(text: string): Question[] {
  return text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l) => questionSchema.parse(JSON.parse(l)));
}

export const questionText = (q: Question) => `Які модулі зачепить зміна в ${q.module} і що про це каже історія?`;

export const READER_SYSTEM = [
  'Ти читач чужого репозиторію (axios). Інструменти лише читальні. Відповідай українською, коротко.',
  'Кожне твердження давай з посиланням: шлях:рядок (як у виводі read_file/search_code) або короткий SHA коміту з git_history.',
  'Не вигадуй файлів і рядків: що не знайшов інструментом — пиши «не знайдено».',
].join(' ');

/** Чотири незалежні смуги — кожна дивиться у свій бік і нічого не змінює. */
export function lanes(q: Question): Branch[] {
  const name = q.module.split('/').pop()!.replace(/\.js$/, '');
  return [
    { lane: 'history', prompt: `Смуга «історія». Модуль ${q.module}. Викличи git_history для нього (--follow вже включено). Назви: скільки комітів, чи перейменовувався, 3–5 найзмістовніших комітів (SHA + тема).` },
    { lane: 'deps', prompt: `Смуга «залежності». Модуль ${q.module}. Знайди search_code по «${name}.js» у теці lib, хто його імпортує (рядки import). Перелічи файли-імпортери з шляхом:рядок. Також прочитай перші 20 рядків модуля: що імпортує він сам.` },
    { lane: 'module', prompt: `Смуга «тіло модуля». Прочитай ${q.module} цілком через read_file. Опиши, що він робить і які його експорти, з посиланнями шлях:рядок.` },
    { lane: 'tests', prompt: `Смуга «тести». Знайди search_code по «${name}» у теці tests/unit. Які тестові файли його згадують (шлях:рядок)? Якщо жодного — так і напиши.` },
  ];
}

/** Базова лінія: один агент, та сама робота однією послідовною гілкою. */
export function singleLane(q: Question): Branch {
  return {
    lane: 'single',
    prompt: [
      `Відповідай на питання: «${questionText(q)}» Виконай послідовно чотири кроки:`,
      ...lanes(q).map((b, i) => `${i + 1}) ${b.prompt}`),
      'Потім дай загальний підсумок.',
    ].join('\n'),
  };
}
