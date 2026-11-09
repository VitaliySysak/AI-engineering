/**
 * Регресійна брама evals (Лабораторна 3, крок 04). Ненульовий код виходу — єдиний спосіб, яким CI дізнається про регресію.
 *
 *   npx tsx scripts/evals/gate.ts                     порівняти останній прогін із базовим рівнем (код 1 = регресія)
 *   npx tsx scripts/evals/gate.ts --write-baseline    записати базовий рівень (один раз, окремим комітом)
 *   ... --baseline <файл>                             інший базовий рівень (у CI — окремий, бо там інший агент)
 *
 * Каркас курсу з відхиленнями: задача з базового рівня, якої немає в прогоні, теж регресія (інакше її мовчазний пропуск
 * давав би зелене); неповний прогін і базовий рівень іншого агента чи іншого frozen_at не порівнюються.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export interface EvalLine {
  readonly task_id: string;
  readonly bucket: string;
  readonly frozen_at: string;
  readonly agent: string;
  readonly pass: boolean;
}

export interface BaselineEntry {
  /** 1 — усі k спроб успішні; інакше частка успішних спроб. */
  readonly pow_k: number;
  readonly k: number;
  readonly frozen_at: string;
  readonly bucket: string;
  readonly agent: string;
}

export type Baseline = Record<string, BaselineEntry>;

export interface Tally {
  readonly bucket: string;
  readonly frozen_at: string;
  readonly agent: string;
  readonly ok: number;
  readonly n: number;
}

export const DEFAULT_LOG = 'docs/lab3/evals.jsonl';
export const DEFAULT_BASELINE = 'docs/lab3/evals-baseline.json';

export function parseLog(text: string): EvalLine[] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as EvalLine);
}

export function tally(lines: readonly EvalLine[]): Map<string, Tally> {
  const out = new Map<string, Tally>();
  for (const l of lines) {
    const c = out.get(l.task_id) ?? { bucket: l.bucket, frozen_at: l.frozen_at, agent: l.agent, ok: 0, n: 0 };
    out.set(l.task_id, { ...c, ok: c.ok + (l.pass ? 1 : 0), n: c.n + 1 });
  }
  return out;
}

const powK = (t: Tally): number => (t.ok === t.n ? 1 : t.ok / t.n);

export function toBaseline(now: ReadonlyMap<string, Tally>, k: number): Baseline {
  const out: Baseline = {};
  for (const [id, t] of now) out[id] = { pow_k: powK(t), k, frozen_at: t.frozen_at, bucket: t.bucket, agent: t.agent };
  return out;
}

/** Чому прогін не можна порівнювати з базовим рівнем; порожній перелік — можна. */
export function comparability(now: ReadonlyMap<string, Tally>, base: Baseline, k: number, confirm = 0): string[] {
  const problems: string[] = [];
  if (now.size === 0) return ['у журналі немає жодної спроби'];
  const frozen = new Set([...now.values()].map((t) => t.frozen_at));
  if (frozen.size !== 1) problems.push(`банк не заморожений: frozen_at = ${[...frozen].join(', ')}`);
  const baseFrozen = new Set(Object.values(base).map((b) => b.frozen_at));
  for (const f of frozen) if (!baseFrozen.has(f)) problems.push(`frozen_at ${f} не збігається з базовим рівнем (${[...baseFrozen].join(', ')})`);
  const agents = new Set([...now.values()].map((t) => t.agent));
  const baseAgents = new Set(Object.values(base).map((b) => b.agent));
  for (const a of agents) if (!baseAgents.has(a)) problems.push(`агент ${a} не той, на якому записано базовий рівень (${[...baseAgents].join(', ')})`);
  for (const [id, t] of now) if (t.n !== k && t.n !== k + confirm) problems.push(`${id}: спроб ${t.n}, а очікувалось ${k}`);
  return problems;
}

/** Чи підтвердили повторні спроби падіння: при перепробуванні рахується більшість, без нього — будь-яка відмова. */
const isBroken = (t: Tally, k: number, confirm: number): boolean => (confirm > 0 && t.n === k + confirm ? t.ok * 2 < t.n : powK(t) < 1);

/**
 * Поіменно: regression-задача, що мала pass^k = 1, має менше або зникла з прогону. Edge і new не беруть участі.
 * При k=1 один збій моделі не є регресією: задача, що впала, повторюється confirm разів і має пройти більшість спроб.
 */
export function regressions(now: ReadonlyMap<string, Tally>, base: Baseline, k: number, confirm = 0): string[] {
  const broke: string[] = [];
  for (const [id, b] of Object.entries(base)) {
    if (b.bucket !== 'regression' || b.pow_k !== 1) continue;
    const t = now.get(id);
    if (t === undefined) broke.push(`${id}: була в базовому рівні, у прогоні її немає`);
    else if (isBroken(t, k, confirm)) broke.push(`${id}: було pass^${b.k}=1, стало ${t.ok}/${t.n} при k=${k}`);
  }
  return broke;
}

/** Задачі з відмовою, яку перепробування не підтвердило: їх треба бачити, а не губити в зеленому підсумку. */
export function unconfirmedFailures(now: ReadonlyMap<string, Tally>, k: number, confirm: number): string[] {
  return confirm === 0 ? [] : [...now].filter(([, t]) => t.n === k + confirm && t.ok < t.n && !isBroken(t, k, confirm)).map(([id, t]) => `${id}: ${t.ok}/${t.n}`);
}

function main(): void {
  const args = process.argv.slice(2);
  const baselineFile = args.includes('--baseline') ? (args[args.indexOf('--baseline') + 1] as string) : DEFAULT_BASELINE;
  const k = Number(process.env.EVAL_K ?? 3);
  const now = tally(parseLog(readFileSync(DEFAULT_LOG, 'utf8')));

  if (args.includes('--write-baseline')) {
    if (existsSync(baselineFile) && !args.includes('--force')) {
      console.error(`${baselineFile} уже існує: базовий рівень змінюється лише навмисно (--force і новий frozen_at)`);
      process.exit(1);
    }
    writeFileSync(baselineFile, `${JSON.stringify(toBaseline(now, k), null, 2)}\n`);
    console.log(`Базовий рівень записано на ${now.size} задач у ${baselineFile}: закомітьте його окремим комітом`);
    return;
  }

  const base = JSON.parse(readFileSync(baselineFile, 'utf8')) as Baseline;
  const confirm = Number(process.env.EVAL_CONFIRM ?? 0);
  const problems = comparability(now, base, k, confirm);
  if (problems.length > 0) {
    console.error(`Прогін не можна порівняти з базовим рівнем:\n${problems.join('\n')}`);
    process.exit(1);
  }
  const broke = regressions(now, base, k, confirm);
  const flaky = unconfirmedFailures(now, k, confirm);
  if (flaky.length > 0) console.log(`Падіння не підтвердилось при повторі (нестабільність, не регресія): ${flaky.join('; ')}`);
  if (broke.length > 0) {
    console.error(`РЕГРЕСІЯ на ${broke.length} задачах:\n${broke.join('\n')}`);
    process.exit(1);
  }
  const guarded = Object.values(base).filter((b) => b.bucket === 'regression' && b.pow_k === 1).length;
  console.log(`Регресії немає: прогін ${now.size} задач, k=${k}; під охороною брами ${guarded} задач`);
}

if (process.argv[1]?.endsWith('gate.ts')) main();
