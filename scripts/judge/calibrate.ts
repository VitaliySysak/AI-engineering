/**
 * Калібрування судді (Лабораторна 3, крок 05). Без мережі: сира згода, каппа Коена і матриця окремо на кожен вимір.
 *
 *   npx tsx scripts/judge/calibrate.ts --rubric before            лише робочі випадки
 *   npx tsx scripts/judge/calibrate.ts --rubric after --final     ще й відкладені та всі разом
 *
 * Без --final відкладені випадки не показуються: їх не дивляться, поки рубрику не дописано.
 */
import { readFileSync } from 'node:fs';

import { agreement, confusion, LABELS, type Label } from '../kappa';
import { CASES_FILE, jsonl, VERDICTS_FILE, type JudgeCase, type JudgeVerdict } from './run-judge';

export interface SetReport {
  readonly label: string;
  readonly n: number;
  readonly raw: number;
  readonly expected: number;
  readonly kappa: number;
  readonly matrix: Record<Label, Record<Label, number>>;
  /** Мій fail, суддя pass: найдорожчий дефект, зміна проїде в main. */
  readonly passesBad: number;
  /** Мій pass, суддя fail: зайва робота. */
  readonly wastedWork: number;
}

const key = (c: { case_id: string; dimension: string }) => `${c.case_id}|${c.dimension}`;

/** Кожна пара мусить мати вердикт цієї рубрики: пропуск зробив би число кращим непомітно. */
export function missingVerdicts(cases: readonly JudgeCase[], verdicts: readonly JudgeVerdict[], rubric: string): string[] {
  const have = new Set(verdicts.filter((v) => v.rubric === rubric).map(key));
  return cases.filter((c) => !have.has(key(c))).map(key);
}

export function reportSet(label: string, subset: readonly JudgeCase[], verdicts: readonly JudgeVerdict[], rubric: string): SetReport {
  const byKey = new Map(verdicts.filter((v) => v.rubric === rubric).map((v) => [key(v), v]));
  const mine = subset.map((c) => c.mine);
  const judge = subset.map((c) => (byKey.get(key(c)) as JudgeVerdict).verdict);
  const a = agreement(mine, judge);
  const matrix = confusion(mine, judge);
  return { label, n: a.n, raw: a.raw, expected: a.expected, kappa: a.kappa, matrix, passesBad: matrix.fail.pass, wastedWork: matrix.pass.fail };
}

/** Набори звіту. Без final відкладених немає ні окремо, ні в складі «усіх». */
export function selectSets(cases: readonly JudgeCase[], final: boolean): { label: string; subset: JudgeCase[] }[] {
  const dims = [...new Set(cases.map((c) => c.dimension))];
  const scopes: { name: string; pick: (c: JudgeCase) => boolean }[] = [{ name: 'робочі', pick: (c) => !c.holdout }];
  if (final) scopes.push({ name: 'ВІДКЛАДЕНІ', pick: (c) => c.holdout }, { name: 'усі', pick: () => true });
  const out: { label: string; subset: JudgeCase[] }[] = [];
  for (const scope of scopes) {
    for (const d of dims) out.push({ label: `${d} · ${scope.name}`, subset: cases.filter((c) => c.dimension === d && scope.pick(c)) });
    out.push({ label: `обидва виміри · ${scope.name}`, subset: cases.filter(scope.pick) });
  }
  return out;
}

export function formatReport(r: SetReport): string {
  const kappa = Number.isNaN(r.kappa) ? 'не визначена (усі мітки однакові)' : r.kappa.toFixed(3);
  return [
    `\n== ${r.label} · випадків ${r.n}`,
    `сира згода ${r.raw.toFixed(3)} · очікувана випадкова ${r.expected.toFixed(3)} · каппа Коена ${kappa}`,
    'матриця (рядок = мій, стовпець = суддя):',
    `  ${''.padEnd(8)} ${LABELS.map((l) => l.padStart(8)).join('')}`,
    ...LABELS.map((row) => `  ${row.padEnd(8)} ${LABELS.map((col) => String(r.matrix[row][col]).padStart(8)).join('')}`),
    `  пропускає погане (мій fail -> суддя pass): ${r.passesBad}`,
    `  марна робота     (мій pass -> суддя fail): ${r.wastedWork}`,
  ].join('\n');
}

function main(): void {
  const at = process.argv.indexOf('--rubric');
  const rubric = at > 0 ? process.argv[at + 1] : undefined;
  if (rubric === undefined) throw new Error('потрібна назва рубрики: --rubric before');
  const cases = jsonl<JudgeCase>(readFileSync(CASES_FILE, 'utf8'));
  const verdicts = jsonl<JudgeVerdict>(readFileSync(VERDICTS_FILE, 'utf8'));
  const missing = missingVerdicts(cases, verdicts, rubric);
  if (missing.length > 0) throw new Error(`немає вердиктів рубрики ${rubric}: ${missing.join(', ')}`);

  const models = new Set(verdicts.filter((v) => v.rubric === rubric).map((v) => v.model));
  console.log(`Рубрика ${rubric} · модель ${[...models].join(', ')} · порядок подання: порівняння варіантів немає`);
  for (const { label, subset } of selectSets(cases, process.argv.includes('--final'))) console.log(formatReport(reportSet(label, subset, verdicts, rubric)));
  if (!process.argv.includes('--final')) console.log('\nВідкладені випадки не показано: їх можна побачити лише після ітерації рубрики (--final).');
}

if (process.argv[1]?.endsWith('calibrate.ts')) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
