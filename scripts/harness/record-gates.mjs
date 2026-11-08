// Свідок ланцюга брам (Лабораторна 3, крок 01): вердикти → gate-record.json і поле gates у run.json задачі.
// Не брама: виконується й на червоному прогоні й сам нічого не вирішує (завжди код 0, якщо є що записати).
//
// Відхилення від каркаса курсу: прогін задачі шукаємо за іменем гілки harness/<id> і міткою часу в імені теки, а не за
// mtime — після checkout у CI час зміни однаковий в усіх файлів, і «найсвіжіший» був би випадковим.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, fallback = 'skipped') => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};

// GitHub дає success | failure | cancelled | skipped — зводимо до pass | fail | skipped
const verdict = (r) => (r === 'success' ? 'pass' : r === 'skipped' || r === 'cancelled' ? 'skipped' : 'fail');

const NAMES = ['types', 'lint', 'tests', 'build'];
const gates = Object.fromEntries(NAMES.map((g) => [g, verdict(arg(g))]));
// outputs.verdict порожній на впалій брамі: це підтвердження зеленого, а не джерело факту
const confirmed = Object.fromEntries(NAMES.map((g) => [g, arg(`${g}-output`, '') === 'pass']));

const branch = arg('branch', '');
const runUrl = arg('run-url', '');
const root = 'docs/lab3/runs';

/** Тека найновішого прогону задачі або null. Ім'я теки — <id>-<мітка часу>; t-1 не збігається з t-10. */
function latestRun(id) {
  if (!existsSync(root)) return null;
  const pattern = new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`);
  const found = readdirSync(root)
    .map((name) => ({ name, match: pattern.exec(name) }))
    .filter((d) => d.match !== null && existsSync(join(root, d.name, 'run.json')))
    .sort((a, b) => Number(b.match[1]) - Number(a.match[1]));
  return found[0]?.name ?? null;
}

const taskId = /^harness\/(t-[A-Za-z0-9-]+)$/.exec(branch)?.[1] ?? null;
const run = taskId === null ? null : latestRun(taskId);

let record = { task_id: null, artifact_dir: null, branch, gates, confirmed, ci_run_url: runUrl };
if (run !== null) {
  const dir = join(root, run);
  const updated = { ...JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8')), gates, ci_run_url: runUrl };
  writeFileSync(join(dir, 'run.json'), `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  // копія для артефакту прогону: шлях із мітками часу незручно перелічувати в upload-artifact
  writeFileSync('gate-run.json', `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  record = { ...record, task_id: updated.task_id, artifact_dir: updated.artifact_dir };
  console.log(`вердикти записано: ${join(dir, 'run.json')}`);
} else if (taskId !== null) {
  record = { ...record, note: `гілка ${branch}, але в ${root} немає прогону задачі ${taskId}` };
  console.log(record.note);
} else {
  console.log(`гілка «${branch}» не є гілкою задачі harness/t-*: вердикти лише в gate-record.json`);
}

writeFileSync('gate-record.json', `${JSON.stringify(record, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(gates));
