# Відкот зміни кроку 02

Зміна: `axios.getUri()` перестає кидати голий `TypeError`, коли `buildURL` падає на невалідному `url`
(наприклад, URL-обʼєкті), і кидає `AxiosError` з кодом `ERR_BAD_REQUEST` — так само, як уже робить Node-адаптер
у `lib/adapters/http.js#L1014-L1028`. Файл реалізації — один: `lib/core/Axios.js`.

## 1. План (заповнено ДО першого рядка коду, дата: 2026-11-22)

- Обраний шлях: **git revert**
- Чому саме він: зміна — один звичайний коміт в одному файлі реалізації, на нього ніщо пізніше не спирається;
  revert не додає залежностей, не змінює API і лишає в історії обидві дії. Прапорець чи конфігурація означали б
  нову публічну опцію в чужому проєкті — для зміни на ~10 рядків це більше, ніж сама зміна
- Команда дослівно: `git revert --no-edit <sha-зміни>` (на гілці-доказі `lab4/rollback-drill`)
- Ознака, що відкот потрібен:
  - `npm run test:vitest:unit` після зміни дає не 0 — зокрема червоний будь-який із 8 характеризаційних тестів
    `tests/unit/helpers/buildURL.characterization.test.js` або наявний тест, що чекає від `getUri` іншого типу помилки;
  - або `axios.getUri({ url: '/foo#hash', params: { query: 'axios', page: 1 } })` перестає повертати `/foo?query=axios&page=1`
    (тобто зміна торкнулася успішного шляху, а не лише помилкового)
- Чого відкот НЕ повертає: нічого поза `lib/core/Axios.js` — lock-файл і залежності не змінюються; файл нового тесту
  лежить в окремому коміті ПЕРЕД зміною і відкотом не зачіпається (тому після відкоту він має стати червоним)
- Скільки це займає: оцінка ~2 хв — сам revert секунди, решта — прогін `npm run test:vitest:unit` (~70 с на кроці 01)

## 2. Виконання (заповнено ПІСЛЯ навчання, дата: 2026-11-22)

- Гілка навчання: `lab4/rollback-drill` (від `lab4/change`)
- Відкочено РІВНО один коміт — коміт зміни: `4baf9678ef9a85fbc9e3514fe9114805bbe55322`
- Коміт нового тесту НЕ відкочувався: `80ebc96c4b16851e8e6e74ad707f51c8fcce3934` (тому тестовий файл на місці: `Test-Path tests\unit\core\getUri.badRequest.test.js` → `True`)
- SHA коміта відкоту: [f86f39c9](https://github.com/VitaliySysak/axios/commit/f86f39c92c15473a4d0158e9e17c5afd280a8628)
- Фактичний час від команди до зелених тестів: **73 с** (revert + повний unit-набір + два окремі прогони)
- Код після відкоту точно дорівнює коду перед зміною: `git diff 80ebc96c f86f39c9` — порожньо

Команди дослівно (PowerShell, у `change-tree`):

```
$change = git rev-parse HEAD          # 4baf9678…, перевірено за git log --oneline -4
git switch -c lab4/rollback-drill
git revert --no-edit $change
npm run test:vitest:unit
npx vitest run --project unit tests/unit/helpers/buildURL.characterization.test.js
npx vitest run --project unit tests/unit/core/getUri.badRequest.test.js
Test-Path tests\unit\core\getUri.badRequest.test.js
git log --oneline -5
```

| спостереження | очікувано | фактично | вивід |
|---|---|---|---|
| характеризаційні тести | зелені | **зелені**, код 0, 8 з 8 | [drill-char.txt](https://github.com/VitaliySysak/axios/blob/37890f40160132682451d293d8b04a52e0c0f23d/lab4-evidence/step02/drill-char.txt) |
| новий тест на нову поведінку | ЧЕРВОНИЙ, і файл НА МІСЦІ | **червоний**, код 1, 3 з 3 падають; файл на місці | [drill-new.txt](https://github.com/VitaliySysak/axios/blob/37890f40160132682451d293d8b04a52e0c0f23d/lab4-evidence/step02/drill-new.txt) |
| увесь unit-набір | червоний лише новим тестом | код 1, `3 failed \| 1808 passed (1811)` — червоні лише 3 нові | [drill-unit.txt](https://github.com/VitaliySysak/axios/blob/37890f40160132682451d293d8b04a52e0c0f23d/lab4-evidence/step02/drill-unit.txt) |
| історія | видно і зміну, і скасування | `f86f39c9 Revert "fix(getUri)…"` → `4baf9678 fix(getUri)…` → `80ebc96c test: getUri…` → `c99ba7cc test: характеризаційні…` | `git log --oneline -5` |

## 3. Що розійшлося з планом

1. **Ознака відкоту спрацювала ще до коміту — на першій спробі агента.** План називав ознакою червоний
   `npm run test:vitest:unit`, «зокрема наявний тест, що чекає від `getUri` іншого типу помилки». Саме так і сталося:
   перша версія зміни перекодовувала `ERR_FORM_DATA_DEPTH_EXCEEDED` на `ERR_BAD_REQUEST` і валила
   `paramsMerge.test.js`. Оскільки зміну ще не закомітили, відкотом був не `git revert`, а `git checkout -- lib/core/Axios.js`
   над незакоміченою правкою (диф збережено в `attempt1.diff`). Характеризаційні тести кроку 01 цю регресію **не зловили** —
   вони тримають `buildURL`, а не `getUri` із серіалізатором глибини. Сітку дав чужий наявний набір, а не мій.
2. **Після відкоту повний набір не дає код 0 — і не повинен.** У плані я сформулював ознаку «відкот потрібен» через
   `npm run test:vitest:unit`, але після відкоту той самий набір червоний (3 нові тести). Тому перевіряти відкот треба
   окремими прогонами характеризації й нового тесту, як у таблиці вище, а не одним загальним кодом виходу.
3. Час: планував ~2 хв, вийшло 73 с — повний unit-набір (~70 с) і є майже весь час відкоту.
