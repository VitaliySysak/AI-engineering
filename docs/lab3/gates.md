# Ланцюг детермінованих брам

- Workflow: [`.github/workflows/gates.yml`](../../.github/workflows/gates.yml)
- Порядок: `types → lint → tests → build → record`
- Чому такий порядок: найдешевша й найвизначеніша перевірка першою, щоб зламані типи не оплачувалися хвилинами
  збірки. Час задач у зеленому прогоні (з `npm ci`): 63 с · 51 с · 64 с · 82 с · 5 с
  ([прогін 42470979060](https://github.com/VitaliySysak/AI-engineering/actions/runs/42470979060))
- Concurrency: `group: ${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: true`
- Артефакти: `actions/upload-artifact@v7` / `actions/download-artifact@v8`
- Версії решти дій — як у нашому `ci.yml`, де вони вже зелені: `actions/checkout@v7`, `actions/setup-node@v7`, Node 24
  (каркас курсу: `checkout@v6`, Node 22 — рішення автора 2026-11-08). `ci.yml` лишився як є і біжить поруч: `gates.yml`
  частково дублює його `verify`, зате e2e і посилання на прогони Лабораторних 1–2 не змінилися

## 1. Таблиця брам
| брама | що доводить | чого коштує (хв) | що пише |
|---|---|---|---|
| `types` | код узгоджений із власними типами: немає звернень до полів, яких немає | ~1,1; `timeout-minutes: 5` | `verdict` у вихід задачі; вивід `tsc` у лог |
| `lint` | дотримані правила, яких не видно з типів (ESLint) | ~0,9; `timeout-minutes: 5` | `verdict`; порушення в лог |
| `tests` | поведінка не змінилась там, де не мала; тести без мережі зелені | ~1,1; `timeout-minutes: 10` | `verdict`; артефакт `gate-tests` (`docs/lab3/runs/**`) |
| `build` | застосунок збирається: немає відсутніх залежностей і неімпортованих модулів | ~1,4; `timeout-minutes: 15` | `verdict`; артефакт `gate-build` (`.next/BUILD_ID`, `.next/build-manifest.json` — у Next.js результат збірки там, а не в `dist/`) |
| `record` | не брама, свідок: пов'язує вердикти з прогоном харнеса; виконується й на червоному (`if: ${{ !cancelled() }}`) | ~0,1; `timeout-minutes: 5` | `gate-record.json` + `gate-run.json` (`run.json` з полем `gates`) |

Два джерела вердикту: `needs.<job>.result` — факт, є завжди; `needs.<job>.outputs.verdict` — підтвердження, що брама
дійшла до кінця (поле `confirmed` у `gate-record.json`; на впалій брамі `false`).

[`scripts/harness/record-gates.mjs`](../../scripts/harness/record-gates.mjs) — відхилення від каркаса: прогін задачі
шукається за іменем гілки `harness/<id>` і міткою часу в імені теки, а не за `mtime`, бо після `checkout` час зміни в CI
однаковий в усіх файлів. На гілках не `harness/t-*` (`main`, `lab3/step-NN`, `harness/red-*`) — `task_id: null`, без
падіння. Перевірено без мережі: [`tests/harness/record-gates.test.ts`](../../tests/harness/record-gates.test.ts), 12 тестів
(6 — свідок окремим процесом; 6 — форма `gates.yml`: таймаути, порядок `needs`, `!cancelled()`, мажори артефактів).

## 2. Обов'язкові перевірки
Набір правил `main-gates` на `main` (налаштував автор у GitHub): «Require status checks to pass» — увімкнено.
Перелічені перевірки (джерело GitHub Actions): `types`, `lint`, `tests`, `build`.
«Require branches to be up to date before merging»: **вимкнено** — зливаємо лише fast-forward, гілка завжди поверх `main`.
Також увімкнено «Block force pushes». Скріншот: [`gates-ruleset.png`](gates-ruleset.png) — видно перевірки й перемикачі;
назва, статус Active і цільова гілка — вище на сторінці, у кадр не ввійшли.

Як це змінило злиття: «commits must first be pushed to another ref where the checks pass» — спершу push гілки, чекаємо
брами, потім fast-forward і push `main`. Push `6bfc5aa` у `main` пройшов уже з увімкненим правилом (брами на цьому коміті
зелені). **Не перевірено:** відмову правила на незеленому коміті не пробували — це вимагало б спроби запушити такий
коміт у `main`. API GitHub під час роботи над цим розділом відповідав 503/504, тож правило не звірено й через нього.

## 3. Навмисне падіння
Гілка: [`harness/red-2026-11-08`](https://github.com/VitaliySysak/AI-engineering/tree/harness/red-2026-11-08), коміт
`1cf62a5` · що саме зламано: у `src/metrics.ts` функція `mean` ділить на `values.size`, якого немає в типу масиву.
Прогін: https://github.com/VitaliySysak/AI-engineering/actions/runs/42474130041
Очікувано червона брама: `types`
Що показали наступні брами: `lint`, `tests`, `build` — `skipped` (а не failure)
`record` виконалась: так · [`gate-record-red/gate-record.json`](gate-record-red/gate-record.json), витяг:

```json
{
  "task_id": null,
  "branch": "harness/red-2026-11-08",
  "gates": { "types": "fail", "lint": "skipped", "tests": "skipped", "build": "skipped" },
  "confirmed": { "types": false, "lint": false, "tests": false, "build": false }
}
```

`task_id: null` — очікувано: це гілка-доказ, а не задача черги. Гілку не зливаємо й історію не переписуємо.

## 4. Зв'язок із фабрикою
Зелений прогін задачі: `task_id` **t-06**, `artifact_dir` `docs/lab3/runs/t-06-1794135046162`, гілка `harness/t-06`
(`28da429`), прогін https://github.com/VitaliySysak/AI-engineering/actions/runs/42473171157 — усі чотири брами `pass`,
кожна підтверджена `confirmed: true`. Докази: [`gate-record/gate-record.json`](gate-record/gate-record.json) і
[`gate-record/gate-run.json`](gate-record/gate-run.json) — `run.json` цієї задачі з заповненим `gates` і `ci_run_url`
(артефакт `gate-record`, завантажив автор). `run.json` у `docs/lab3/runs/t-06-…` лишається таким, яким його написав
виконавець (`gates: {}`): вердикти дописуються в CI, у копію робочої теки прогону, і приходять артефактом.

Щоб це працювало, `run-queue.ts` тепер комітить артефакт задачі і в її гілку: гілки `t-01`, `t-02`, `t-04`, `t-05`
кроку 00 створені до цього і брам не проходили.
