/**
 * Наповнення памʼяті харнеса записами з кроків 00–03 Лабораторної 4. Без мережі:
 *
 *   npx tsx scripts/memory/seed.ts
 *
 * Кожен запис іде через ту саму propose()/remember(), що й інструмент моделі: схема, відмови, sha = HEAD репозиторію.
 * Дві навмисні спроби мають бути ВІДХИЛЕНІ (рядок у rejections.jsonl) — це перевірка відмов на живому store.
 * Один запис із sha старого коміту — навмисна демонстрація застарілості (source це каже прямо).
 */
import { resolve } from 'node:path';

import { propose } from '../../src/memory/propose-tool';
import { remember } from '../../src/memory/store';

const roots = { course: '.', fork: resolve(process.env.FORK_DIR ?? '../axios') };
const o = { roots };

const proposals = [
  { kind: 'decision', repo: 'course', paths: ['src/multi/synthesize.ts'], text: 'Твердження зводу мають бути атомарними: один факт — одне посилання. Складене твердження з одним посиланням верифікатор чесно ставить у unknown, і відповідь блокується.', source: 'крок 03, прогін 2026-11-26: усі unknown/fail — складені твердження; docs/lab4/multiagent.md, розділ «Вердикт»' },
  { kind: 'decision', repo: 'course', paths: ['scripts/multi/run-multi.ts'], text: 'Розгалуження читання для питань про axios типово вимкнене (MULTI_FANOUT): на 12 чистих прогонах воно дало +19% часу до відповіді і ×2,3 викликів моделі без зміни якості.', source: 'крок 03, docs/lab4/multiagent.md, таблиця «Числа»' },
  { kind: 'decision', repo: 'course', paths: [], text: 'Верифікатор завжди іншої родини, ніж читачі: читачі й звід — Google Gemini, верифікатор — NVIDIA Nemotron через OpenRouter.', source: 'крок 03, assertNotGemini у scripts/multi/run-multi.ts' },
  { kind: 'constraint', repo: 'course', paths: ['scripts/multi/run-multi.ts'], text: 'Безкоштовний Gemini для читачів тримаємо на 8 запитах за хвилину; на 14 уже траплялося 429. Відповідь 503 high demand повторюємо до двох разів, 429 не повторюємо.', source: 'крок 03, прогони 2026-11-23 і 2026-11-25, traces/multi-runs.jsonl' },
  { kind: 'constraint', repo: 'fork', paths: ['vitest.config.js'], text: 'У axios юніт-тести лежать у tests/unit, файли мають суфікс .test.js; браузерні тести в tests/browser без Playwright не запускаються.', source: 'крок 00, docs/lab4/context.md, розділ 2' },
  { kind: 'constraint', repo: 'fork', paths: [], text: 'Імпорти в lib/ axios пишуться з явним розширенням .js, тому імпортерів модуля шукаємо підрядком «<імʼя>.js» у теці lib.', source: 'AGENTS.md форка, розділ Architecture Boundaries; перевірено search_code на кроці 03' },
  { kind: 'constraint', repo: 'fork', paths: [], text: 'Форк axios на Windows клонувати з core.autocrlf=false: з CRLF перевірки prettier падають.', source: 'крок 00, фільтр кандидатів path-to-regexp і cookie' },
  { kind: 'outcome', repo: 'fork', paths: ['lib/helpers/buildURL.js'], text: 'Крок 01: вісім характеризаційних тестів buildURL зелені на нульовій точці; мутаційний прогін Stryker убив 43 з 43 мутантів.', source: 'docs/lab4/characterization.md; https://github.com/VitaliySysak/axios/commit/c99ba7ccaaac34310e0e9fa6ed9d22252164d195' },
  { kind: 'outcome', repo: 'fork', paths: ['lib/core/Axios.js'], text: 'Крок 02: getUri загортає чужі помилки buildURL в AxiosError з кодом ERR_BAD_REQUEST; зміна живе в гілці lab4/change, у робочій копії форка її немає.', source: 'docs/lab4/change.md; https://github.com/VitaliySysak/axios/commit/4baf9678ef9a85fbc9e3514fe9114805bbe55322' },
] as const;

/** Навмисні порушення: обидва мають бути відхилені детермінованими відмовами. */
const mustReject = [
  { kind: 'outcome', repo: 'fork', paths: [], text: 'Зміна кроку 02 — коміт 4baf9678ef9a85fbc9e3514fe9114805bbe55322 у гілці lab4/change.', source: 'перевірка відмов: повний SHA у text (має йти в source) — очікувана помилкова відмова «схоже на ключ»' },
  { kind: 'decision', repo: 'course', paths: [], text: 'export function remember(e) {\n  entry.parse(e);\n  appendFileSync(FILE, JSON.stringify(e));\n}', source: 'перевірка відмов: фрагмент коду' },
] as const;

let ok = 0;
for (const p of proposals) {
  const r = propose(p, o);
  console.log(r.ok ? `записано: [${p.kind}] ${p.text.slice(0, 70)}…` : `ВІДХИЛЕНО (несподівано): ${r.why}`);
  if (r.ok) ok++;
}
for (const p of mustReject) {
  const r = propose(p, o);
  console.log(r.ok ? `ЗАПИСАНО (а мало бути відхилено): ${p.text.slice(0, 60)}` : `відхилено, як і очікувалося: ${r.why}`);
}

// Демонстрація застарілості: твердження, правдиве на коміті ded80ee (перша версія оркестратора), відтоді ask.ts змінювався.
remember({ at: new Date().toISOString(), kind: 'constraint', repo: 'course', sha: 'ded80ee', paths: ['src/multi/ask.ts'], text: 'Мультиагентний оркестратор ковтає помилки викликів моделі: упалий виклик видно лише як «не повідомлено», без причини.', source: 'демо застарілості: правда на ded80ee (крок 03, прогін 2026-11-23), виправлено в 75db4d8' }, o);
console.log(`\nЗаписано ${ok + 1} (з них 1 — навмисно застарілий), відхилено ${mustReject.length} навмисних порушень.`);
