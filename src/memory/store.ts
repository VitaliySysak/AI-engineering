/**
 * Памʼять харнеса (Лабораторна 4, крок 04): JSONL зі строгою схемою. Дописує ЛИШЕ код — remember() після
 * детермінованих відмов; модель лише пропонує запис інструментом (src/memory/propose-tool.ts).
 * Читання в промпт — дві межі (записи й байти) і перевірка застарілості через git у репозиторії з поля repo.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { z } from 'zod';

export const STORE = 'docs/lab4/memory/store.jsonl';
export const REJECTIONS = 'docs/lab4/memory/rejections.jsonl';
export const MAX_TEXT = 400; // запис — твердження, не документ
export const MAX_NEWLINES = 2; // більше — це вже схоже на файл
export const MAX_CODE_RUN = 120; // довший фрагмент без пробілу-речення — схоже на код
export const PROMPT_ENTRIES = 20; // дві межі читання в промпт
export const PROMPT_BYTES = 6000;

export const entry = z
  .object({
    at: z.string().min(1),
    /** Рішення / обмеження / результат задачі. Більше видів не буває. */
    kind: z.enum(['decision', 'constraint', 'outcome']),
    text: z.string().min(1).max(MAX_TEXT),
    /** Коміт, на момент якого твердження було правдою (зазвичай HEAD при записі). */
    sha: z.string().regex(/^[0-9a-f]{7,40}$/),
    /** У ЯКОМУ репозиторії живуть paths. Без цього git перевіряє не той репозиторій. */
    repo: z.enum(['course', 'fork']),
    /** Файли, яких твердження стосується; порожній масив — глобальне твердження. */
    paths: z.array(z.string().min(1)).max(8),
    /** Звідки взято: вимір, прогін, permalink. Саме тут живуть посилання й хеші. */
    source: z.string().min(1),
  })
  .strict();

export type Entry = z.infer<typeof entry>;

export type StoreOptions = {
  file?: string;
  rejections?: string;
  /** Корені репозиторіїв: course — курсовий (типово cwd), fork — форк (типово ../axios або FORK_DIR). */
  roots?: { course: string; fork: string };
  maxEntries?: number;
  maxBytes?: number;
};

const roots = (o: StoreOptions) => o.roots ?? { course: '.', fork: process.env.FORK_DIR ?? '../axios' };

/**
 * Детерміновані відмови. Перевіряється ЛИШЕ text: посилання й хеші живуть у source і sha, інакше фільтр відхилив би
 * власний запис про зелений прогін. Навмисно грубі: зайва відмова коштує переформулювання, пропущений ключ — ротації.
 */
export function reject(e: Pick<Entry, 'text'>): string | null {
  const t = e.text;
  if (t.length > MAX_TEXT) return `довше за ${MAX_TEXT} символів`;
  if ((t.match(/\n/g)?.length ?? 0) > MAX_NEWLINES) return 'схоже на цілий файл';
  if (/```|^\s*(import|export|function|const|class)\s/m.test(t) || t.split(/\s+/).some((w) => w.length > MAX_CODE_RUN)) return 'схоже на фрагмент коду';
  // груба ознака секрету: довгий непробільний літерал (хеш теж сюди потрапить — це свідомий напрямок помилки)
  if (/[A-Za-z0-9_\-+/]{32,}={0,2}/.test(t)) return 'схоже на ключ або токен';
  if (/\b(api[_-]?key|token|secret|password|passwd)\b/i.test(t) && /[=:]\s*\S{8,}/.test(t)) return 'схоже на секрет у форматі ключ=значення';
  if (/\.env(\.|\b)/i.test(t)) return 'згадка файлу секретів';
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(t)) return 'схоже на персональні дані (адреса пошти)';
  return null;
}

/** ЄДИНЕ місце, яке дописує у store. Відмова — видима подія: рядок у журналі відмов і виняток. */
export function remember(e: Entry, o: StoreOptions = {}): void {
  const parsed = entry.parse(e); // невалідний запис — не «майже запис», а виняток
  const why = reject(parsed);
  if (why !== null) {
    const log = o.rejections ?? REJECTIONS;
    mkdirSync(dirname(log), { recursive: true });
    appendFileSync(log, `${JSON.stringify({ at: new Date().toISOString(), kind: parsed.kind, why, source: parsed.source, textLength: parsed.text.length })}\n`);
    throw new Error(`запис відхилено: ${why}`);
  }
  const file = o.file ?? STORE;
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(parsed)}\n`);
}

/**
 * Чи були коміти ПІСЛЯ sha, що торкалися шляху, — у ТОМУ репозиторії, який названо в полі repo.
 * Падаємо ЗАКРИТО: невідомий коміт, не той репозиторій або будь-яка помилка git означають «застаріле».
 */
export function isStale(e: Entry, o: StoreOptions = {}): boolean {
  if (e.paths.length === 0) return false; // глобальне твердження — перевіряти нічим
  const cwd = roots(o)[e.repo];
  return e.paths.some((p) => {
    try {
      execFileSync('git', ['cat-file', '-e', `${e.sha}^{commit}`], { cwd, stdio: 'ignore' });
      const after = execFileSync('git', ['log', '--format=%H', `${e.sha}..HEAD`, '--', p], { cwd, encoding: 'utf8' });
      return after.trim() !== ''; // непорожньо = після sha файл змінювали
    } catch {
      return true; // не змогли перевірити — вважаємо застарілим
    }
  });
}

export function readStore(file = STORE): Entry[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l) => entry.parse(JSON.parse(l)));
}

export type Recall = { text: string; used: number; total: number; staleDropped: number; stale: string[]; cutEntries: number; cutBytes: number };

/** Читання в промпт: застарілі не вантажимо, дві межі, і ЧИСЛА про те, що обрізано. */
export function recall(o: StoreOptions = {}): Recall {
  const all = readStore(o.file ?? STORE);
  const staleOnes = all.filter((e) => isStale(e, o));
  const fresh = all.filter((e) => !staleOnes.includes(e));
  const maxEntries = o.maxEntries ?? PROMPT_ENTRIES;
  const maxBytes = o.maxBytes ?? PROMPT_BYTES;
  const lines: string[] = [];
  let bytes = 0;
  let cutBytes = 0;
  let cutEntries = 0;
  for (const e of [...fresh].reverse()) {
    // найновіші першими
    const line = `- [${e.kind}] ${e.text} (${e.repo}@${e.sha.slice(0, 7)}; ${e.source})`;
    const size = Buffer.byteLength(line, 'utf8');
    if (lines.length >= maxEntries || bytes + size > maxBytes) {
      cutBytes += size;
      cutEntries++;
      continue;
    }
    lines.push(line);
    bytes += size;
  }
  return {
    text: lines.join('\n'),
    used: lines.length,
    total: all.length,
    staleDropped: staleOnes.length,
    stale: staleOnes.map((e) => `${e.repo}@${e.sha.slice(0, 7)} ${e.paths.join(',')}`),
    cutEntries,
    cutBytes,
  };
}

/** Рядок для журналу й memory.md: «у промпт пішло 18 записів із 54, обрізано 2140 байтів». */
export const describeRecall = (r: Recall) =>
  `у промпт пішло ${r.used} записів із ${r.total}; застарілих не вантажено: ${r.staleDropped}; не вмістилося: ${r.cutEntries} записів, ${r.cutBytes} байтів`;
