/**
 * ЄДИНА смуга запису (Лабораторна 4, крок 03). Рядок у журналі прогонів пишеться завжди;
 * відповідь — лише тоді, коли верифікатор не заблокував чернетку (інакше — падаємо закрито).
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { VerifyReport } from '../verify/schema';
import type { Budget, Spent, StageError, Stop } from './budget';
import { refOf } from './verify-claims';
import type { Draft } from './synthesize';

export const ANSWERS_DIR = 'docs/lab4/answers';
export const RUNS_LOG = 'docs/lab4/traces/multi-runs.jsonl';

export type RunRow = {
  at: string;
  qid: string;
  mode: 'fanout' | 'single';
  /** Бюджет, з яким ішло питання (для базової лінії — уже перерахований budgetFor). */
  budget: Budget;
  /** Час до відповіді — навколо всього питання. */
  wallMs: number;
  spent: Spent;
  stop: Stop;
  stopRound: number | null;
  failed: string[];
  /** Помилки етапів: без цього впалий виклик видно лише як «не повідомлено». */
  errors: StageError[];
  incomplete: boolean;
  blocked: boolean;
  /** Твердження зводу з вердиктом і причиною — і для заблокованих відповідей, щоб розбір був можливий. */
  verdicts: { id: string; verdict: string; ref: string; claim: string; reason: string }[];
  quality: { importers: number; importersTotal: number; tests: number; testsTotal: number };
  answerFile: string | null;
  traceId: string | null;
};

export function writeAnswer(opts: {
  row: Omit<RunRow, 'answerFile'>;
  draft: Draft | null;
  report: VerifyReport | null;
  question: string;
  answersDir?: string;
  runsLog?: string;
}): RunRow {
  const { row, draft, report } = opts;
  let answerFile: string | null = null;
  if (!row.blocked && draft !== null && report !== null) {
    answerFile = join(opts.answersDir ?? ANSWERS_DIR, `${row.qid}-${row.mode}.md`).split('\\').join('/');
    mkdirSync(dirname(answerFile), { recursive: true });
    const lines = [
      `# ${row.qid} (${row.mode}): ${opts.question}`,
      '',
      row.incomplete ? `> НЕПОВНА відповідь: смуги ${row.failed.join(', ')} не дали результату.\n` : '',
      draft.answer,
      '',
      '| твердження | посилання | вердикт |',
      '|---|---|---|',
      ...draft.claims.map((c, i) => `| ${c.text.replace(/\|/g, '\\|')} | ${refOf(c)} | ${report.results[i]?.verdict ?? '—'} |`),
      '',
      `Згенеровано ${row.at}; trace ${row.traceId ?? '—'}.`,
    ];
    writeFileSync(answerFile, `${lines.filter((l) => l !== '').join('\n')}\n`, 'utf8');
  }
  const full: RunRow = { ...row, answerFile };
  const log = opts.runsLog ?? RUNS_LOG;
  mkdirSync(dirname(log), { recursive: true });
  appendFileSync(log, `${JSON.stringify(full)}\n`);
  return full;
}
