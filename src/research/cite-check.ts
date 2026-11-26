/**
 * Детермінована перевірка цитат дослідження (Лабораторна 4, крок 04). Запускається ДО верифікатора на моделі:
 * модель не обговорює твердження, цитати якого не існує. git cat-file -e і git blame -L n,n не мають власної думки.
 */
import { execFileSync } from 'node:child_process';

import { z } from 'zod';

/** Цитата: або коміт, або файл+рядок на момент коміту. */
export const citeSchema = z
  .object({
    sha: z.string().regex(/^[0-9a-f]{7,40}$/i),
    file: z.string().min(1).optional(),
    line: z.number().int().min(1).optional(),
  })
  .strict();

export type Cite = z.infer<typeof citeSchema>;

const git = (root: string, args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

/** Повертає причину браку або null, якщо цитата існує. */
export function checkCite(root: string, c: Cite): string | null {
  try {
    git(root, ['cat-file', '-e', `${c.sha}^{commit}`]);
  } catch {
    return `коміту ${c.sha} у форку немає`;
  }
  if (c.file === undefined && c.line === undefined) return null;
  if (c.file === undefined || c.line === undefined) return 'цитата файлу без рядка або рядок без файлу';
  if (c.file.includes('..') || /^[/\\]|^[A-Za-z]:/.test(c.file)) return `шлях не відносний до форка: ${c.file}`;
  try {
    // -L n,n прив'язує цитату до конкретного рядка на конкретному коміті
    git(root, ['blame', '-L', `${c.line},${c.line}`, c.sha, '--', c.file]);
  } catch {
    return `${c.file}:${c.line} на ${c.sha} не існує`;
  }
  return null;
}

/** Повний SHA — для permalink, які не зламаються, коли гілка піде вперед. */
export function fullSha(root: string, sha: string): string {
  return git(root, ['rev-parse', `${sha}^{commit}`]).trim();
}

export function permalink(repoUrl: string, root: string, c: Cite): string {
  const sha = fullSha(root, c.sha);
  return c.file === undefined ? `${repoUrl}/commit/${sha}` : `${repoUrl}/blob/${sha}/${c.file}#L${c.line}`;
}
