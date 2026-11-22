/**
 * Читальні інструменти гілок (Лабораторна 4, крок 03). Корінь читання — тека форка чужого проєкту.
 * Жоден інструмент тут нічого не пише і не змінює стан: перелік закріплено в src/multi/roles.ts і в тесті.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import { resolveInside } from '../agent/tools';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.stryker-tmp', 'lab4-evidence']);
const MAX_LINES = 400;
const MAX_HITS = 60;

/** Рядки файлу з номерами, як у `cat -n`: гілці потрібні номери рядків для посилань. */
export function readLines(root: string, path: string, from = 1, to = from + MAX_LINES - 1): string {
  const abs = resolveInside(root, path);
  const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
  const a = Math.max(1, from);
  const b = Math.min(lines.length, to, a + MAX_LINES - 1);
  const body = lines.slice(a - 1, b).map((l, i) => `${String(a + i).padStart(5)}  ${l}`).join('\n');
  return `${path} (рядки ${a}–${b} з ${lines.length})\n${body}`;
}

function* walk(root: string, dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith('.env')) continue;
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) yield* walk(root, abs);
    else if (st.size < 512_000) yield abs;
  }
}

/** Пошук підрядка (не regex — щоб модель не вішала процес катастрофічним шаблоном). */
export function searchCode(root: string, needle: string, dir = '.'): string {
  const base = resolveInside(root, dir);
  const hits: string[] = [];
  for (const abs of walk(root, base)) {
    const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
    for (const [i, line] of lines.entries()) {
      if (line.includes(needle)) {
        hits.push(`${relative(root, abs).split(sep).join('/')}:${i + 1}: ${line.trim().slice(0, 160)}`);
        if (hits.length >= MAX_HITS) return `${hits.join('\n')}\n… обрізано на ${MAX_HITS} збігах`;
      }
    }
  }
  return hits.length === 0 ? `збігів «${needle}» у ${dir} немає` : hits.join('\n');
}

/** Лише читальна форма git: log --follow з фіксованими аргументами; шлях перевірено resolveInside. */
export function gitHistory(root: string, path: string, limit = 30): string {
  resolveInside(root, path);
  const n = String(Math.min(Math.max(1, limit), 60));
  const out = execFileSync('git', ['log', '--follow', `-n${n}`, '--format=%h %as %s', '--', path], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1_000_000,
  });
  return out.trim() === '' ? `історії для ${path} немає` : out.trim();
}

export function listDir(root: string, path = '.'): string {
  const abs = resolveInside(root, path);
  return readdirSync(abs)
    .filter((n) => !SKIP_DIRS.has(n) && !n.startsWith('.env'))
    .map((n) => (statSync(join(abs, n)).isDirectory() ? `${n}/` : n))
    .join('\n');
}

/** Інструменти ролі «читач». Імена — ті самі, що в READER_TOOLS (src/multi/roles.ts). */
export function readOnlyForkTools(root: string): ToolSet {
  const safe = (fn: () => string) => {
    try {
      return fn();
    } catch (error) {
      return `відмова: ${error instanceof Error ? error.message : String(error)}`;
    }
  };
  return {
    read_file: tool({
      description: 'Прочитати файл форка з номерами рядків (до 400 рядків за раз)',
      inputSchema: z.object({ path: z.string().min(1), from: z.number().int().min(1).optional(), to: z.number().int().min(1).optional() }).strict(),
      execute: async ({ path, from, to }) => safe(() => readLines(root, path, from, to)),
    }),
    search_code: tool({
      description: 'Знайти підрядок у файлах форка (без node_modules, .git, dist); повертає файл:рядок: текст',
      inputSchema: z.object({ needle: z.string().min(2), dir: z.string().min(1).optional() }).strict(),
      execute: async ({ needle, dir }) => safe(() => searchCode(root, needle, dir)),
    }),
    git_history: tool({
      description: 'Історія файлу: git log --follow (коміт, дата, тема), лише читання',
      inputSchema: z.object({ path: z.string().min(1), limit: z.number().int().min(1).max(60).optional() }).strict(),
      execute: async ({ path, limit }) => safe(() => gitHistory(root, path, limit)),
    }),
    list_dir: tool({
      description: 'Перелік файлів і тек у теці форка',
      inputSchema: z.object({ path: z.string().min(1).optional() }).strict(),
      execute: async ({ path }) => safe(() => listDir(root, path)),
    }),
  };
}
