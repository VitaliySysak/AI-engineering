/**
 * Читальні інструменти гілок (Лабораторна 4, крок 03). Корінь читання — тека форка чужого проєкту.
 * Жоден інструмент тут нічого не пише і не змінює стан: перелік закріплено в src/multi/roles.ts і в тесті.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, sep, isAbsolute } from 'node:path';

import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import { resolveInside } from '../agent/tools';

export class ForkPathError extends Error {}

/**
 * Канонічний шлях усередині форка (Лабораторна 4, крок 04): відкидаємо закодовані «..», потім resolveInside
 * (../, абсолютні шляхи, файли секретів), потім realpath — символічне посилання з форка назовні теж відмова.
 */
export function inFork(root: string, path: string): string {
  if (/%2e|%2f|%5c/i.test(path)) throw new ForkPathError(`закодований шлях: ${path}`);
  const abs = resolveInside(root, path);
  if (!existsSync(abs)) return abs; // неіснуючий шлях далі впаде на читанні — назовні він не веде
  const real = realpathSync(abs);
  const rel = relative(realpathSync(root), real);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new ForkPathError(`шлях веде за межі форка: ${path}`);
  return real;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.stryker-tmp', 'lab4-evidence']);
const MAX_LINES = 400;
const MAX_HITS = 60;

/** Рядки файлу з номерами, як у `cat -n`: гілці потрібні номери рядків для посилань. */
export function readLines(root: string, path: string, from = 1, to = from + MAX_LINES - 1): string {
  const abs = inFork(root, path);
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
  const base = inFork(root, dir);
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

/** Лише читальна форма git: log --follow з фіксованими аргументами; шлях перевірено inFork. */
export function gitHistory(root: string, path: string, limit = 30): string {
  inFork(root, path);
  const n = String(Math.min(Math.max(1, limit), 60));
  const out = execFileSync('git', ['log', '--follow', `-n${n}`, '--format=%h %as %s', '--', path], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1_000_000,
  });
  return out.trim() === '' ? `історії для ${path} немає` : out.trim();
}

export function listDir(root: string, path = '.'): string {
  const abs = inFork(root, path);
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

/** Файл ігнорування масового переформатування у форку (крок 00): без нього blame показує автора prettier-коміту. */
const IGNORE_REVS = '.git-blame-ignore-revs';

/** Лише читання: git blame -w -C з ігноруванням prettier-коміту, вузький діапазон рядків. */
export function gitBlame(root: string, path: string, from: number, to: number): string {
  inFork(root, path);
  const a = Math.max(1, from);
  const b = Math.min(Math.max(a, to), a + 80);
  const args = ['blame', '-w', '-C', `-L${a},${b}`, '--date=short'];
  if (existsSync(join(root, IGNORE_REVS))) args.push('--ignore-revs-file', IGNORE_REVS);
  return execFileSync('git', [...args, '--', path], { cwd: root, encoding: 'utf8', maxBuffer: 1_000_000 }).trim();
}

/** Лише читання: опис коміту (тема, тіло, перелік файлів) — без дифа, щоб не тягнути чужий код у контекст. */
export function gitShow(root: string, sha: string): string {
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) throw new ForkPathError(`не SHA: ${sha}`);
  return execFileSync('git', ['show', '--stat', '--format=commit %H%nдата %as%nтема %s%n%n%b', sha], { cwd: root, encoding: 'utf8', maxBuffer: 1_000_000 }).slice(0, 4000);
}

/** Інструменти дослідника (крок 04): читальні інструменти читача + blame і show. Перелік — RESEARCH_TOOLS у roles.ts. */
export function researchForkTools(root: string): ToolSet {
  const safe = (fn: () => string) => {
    try {
      return fn();
    } catch (error) {
      return `відмова: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`;
    }
  };
  return {
    ...readOnlyForkTools(root),
    git_blame: tool({
      description: 'Хто й у якому коміті написав рядки from..to файлу (git blame -w -C, prettier-коміт ігнорується), до 80 рядків',
      inputSchema: z.object({ path: z.string().min(1), from: z.number().int().min(1), to: z.number().int().min(1) }).strict(),
      execute: async ({ path, from, to }) => safe(() => gitBlame(root, path, from, to)),
    }),
    git_show: tool({
      description: 'Опис коміту: тема, тіло повідомлення, перелік змінених файлів (без дифа)',
      inputSchema: z.object({ sha: z.string().min(7) }).strict(),
      execute: async ({ sha }) => safe(() => gitShow(root, sha)),
    }),
  };
}
